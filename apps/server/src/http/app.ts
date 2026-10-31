import Fastify, { type FastifyRequest } from "fastify";
import { configureFrontend } from "./static.js";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { DomainError, type WorldSnapshot } from "../domain/types.js";
import type { WorldService } from "../domain/world-service.js";
import { SessionStore, type CreatorSession } from "./sessions.js";
import { parseChatCommand } from "../integrations/twitch.js";
import {
  creatorCommandSchema as command,
  openRoundCommandSchema as openCommand,
  rehearsalChatCommandSchema,
} from "@afterlife/shared";

export interface OAuthProvider {
  authorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<unknown>;
  getIdentity(
    accessToken: string,
  ): Promise<{ id: string; login?: string; displayName?: string }>;
}
type ApiService = Pick<
  WorldService,
  | "createWorld"
  | "getWorld"
  | "getOwnerId"
  | "handleChat"
  | "history"
  | "listOwnedWorlds"
  | "startEpisode"
  | "endEpisode"
  | "prepareScene"
  | "openRound"
  | "closeRound"
  | "resumeRound"
  | "subscribe"
>;
export interface AppOptions {
  service: ApiService;
  webDist?: string | false;
  sessions?: SessionStore;
  allowRehearsalLogin?: boolean;
  publicOrigin?: string;
  secureCookies?: boolean;
  rehearsalOnly?: boolean;
  onScenePrepared?: (snapshot: WorldSnapshot) => Promise<WorldSnapshot>;
  onEpisodeStarted?: (snapshot: WorldSnapshot) => Promise<WorldSnapshot>;
  oauth?: OAuthProvider;
  onAuthenticated?: (
    identity: { id: string; login?: string; displayName?: string },
    tokens: unknown,
  ) => Promise<void>;
}
const id = z.string().min(1).max(128);
const cookieName = "afterlife_session";
function cookies(request: FastifyRequest): Record<string, string> {
  const result: Record<string, string> = {};
  for (const entry of (request.headers.cookie ?? "").split(";")) {
    const split = entry.indexOf("=");
    if (split > 0)
      result[entry.slice(0, split).trim()] = entry.slice(split + 1).trim();
  }
  return result;
}
function cookie(
  name: string,
  token: string,
  secure: boolean,
  maxAge: number,
): string {
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Expose the agreed snapshot shape rather than internal repository records. */
export function publicSnapshot(snapshot: WorldSnapshot): WorldSnapshot {
  const keys = [
    "worldId",
    "revision",
    "name",
    "mode",
    "episode",
    "factions",
    "relationship",
    "locations",
    "scene",
    "recap",
    "recentEvents",
    "narratorStatus",
    "twitch",
    "rehearsal",
  ] as const;
  return Object.fromEntries(
    keys.map((key) => [key, snapshot[key]]),
  ) as unknown as WorldSnapshot;
}
export function createApp(options: AppOptions) {
  const app = Fastify({ logger: false, bodyLimit: 16 * 1024 });
  const { service } = options;
  const sessions = options.sessions ?? new SessionStore();
  const secure = options.secureCookies ?? false;
  const states = new Map<string, number>();
  const clients = new Set<() => void>();
  const expectedOrigin = options.publicOrigin
    ? new URL(options.publicOrigin).origin
    : undefined;
  function session(request: FastifyRequest): CreatorSession {
    const value = sessions.read(cookies(request)[cookieName]);
    if (!value)
      throw new DomainError(
        401,
        "unauthenticated",
        "Sign in to control your kingdom.",
      );
    return value;
  }
  async function owner(
    request: FastifyRequest,
    worldId: string,
  ): Promise<CreatorSession> {
    const value = session(request);
    if (value.rehearsal && !(await service.getWorld(worldId)).rehearsal) {
      throw new DomainError(
        403,
        "rehearsal_only",
        "A rehearsal session cannot control a live world.",
      );
    }
    return value;
  }
  app.addHook("onRequest", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    if (request.url.startsWith("/auth/") || request.url === "/api/me")
      reply.header("Cache-Control", "no-store");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
      const origin = request.headers.origin;
      const localOrigin = `${request.protocol}://${request.headers.host}`;
      if (origin && origin !== (expectedOrigin ?? localOrigin))
        throw new DomainError(
          403,
          "invalid_origin",
          "This request origin is not allowed.",
        );
    }
  });
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, _request, reply) => {
      if (error instanceof z.ZodError)
        return reply.code(422).send({
          error: {
            code: "invalid_input",
            message: "Request fields are invalid.",
          },
        });
      if (error instanceof DomainError)
        return reply
          .code(error.status)
          .send({ error: { code: error.code, message: error.message } });
      if (error.statusCode && error.statusCode < 500)
        return reply.code(error.statusCode).send({
          error: {
            code: "invalid_request",
            message: "The request could not be processed.",
          },
        });
      return reply.code(500).send({
        error: {
          code: "internal_error",
          message: "The request could not be completed.",
        },
      });
    },
  );
  configureFrontend(app, options.webDist);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/me", async (request) => {
    const value = session(request);
    return {
      id: value.ownerId,
      rehearsal: value.rehearsal,
      worlds: await service.listOwnedWorlds(value.ownerId),
    };
  });
  app.post("/auth/logout", async (request, reply) => {
    sessions.remove(cookies(request)[cookieName]);
    reply.header("Set-Cookie", cookie(cookieName, "", secure, 0));
    return { ok: true };
  });
  if (options.allowRehearsalLogin)
    app.post("/auth/rehearsal", async (request, reply) => {
      if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.ip))
        throw new DomainError(
          403,
          "local_only",
          "Rehearsal sign-in is available on localhost only.",
        );
      reply.header(
        "Set-Cookie",
        cookie(
          cookieName,
          sessions.create("rehearsal-owner", true),
          secure,
          43200,
        ),
      );
      return { id: "rehearsal-owner", rehearsal: true };
    });
  if (options.allowRehearsalLogin)
    app.post<{ Params: { id: string } }>(
      "/api/worlds/:id/rehearsal/chat",
      async (request) => {
        const creator = session(request);
        const worldId = id.parse(request.params.id);
        if ((await service.getOwnerId(worldId)) !== creator.ownerId)
          throw new DomainError(
            403,
            "forbidden",
            "Only the world owner can send rehearsal commands.",
          );
        const snapshot = await service.getWorld(worldId);
        if (!snapshot.rehearsal)
          throw new DomainError(
            403,
            "rehearsal_only",
            "Synthetic commands are disabled for live worlds.",
          );
        const body = rehearsalChatCommandSchema.parse(request.body);
        if (!parseChatCommand(body.text))
          throw new DomainError(
            422,
            "invalid_command",
            "Use a faction join or vote command.",
          );
        return publicSnapshot(
          await service.handleChat(worldId, {
            messageId: `rehearsal:${createHash("sha256").update(`${worldId}:${body.requestId}`).digest("hex")}`,
            userId: `rehearsal:${worldId}:${body.viewer}`,
            displayName:
              body.viewer === "red" ? "Rehearsal Red" : "Rehearsal Blue",
            text: body.text,
            timestamp: new Date().toISOString(),
          }),
        );
      },
    );
  app.get("/auth/twitch", async (_request, reply) => {
    if (!options.oauth)
      throw new DomainError(
        503,
        "oauth_unconfigured",
        "Twitch sign-in is not configured.",
      );
    const now = Date.now();
    for (const [key, expiry] of states) if (expiry <= now) states.delete(key);
    if (states.size >= 1000)
      throw new DomainError(
        429,
        "too_many_signins",
        "Please retry sign-in shortly.",
      );
    const state = randomBytes(32).toString("hex");
    states.set(state, now + 10 * 60 * 1000);
    reply.header(
      "Set-Cookie",
      cookie("afterlife_oauth_state", state, secure, 600),
    );
    return reply.redirect(options.oauth.authorizationUrl(state));
  });
  app.get("/auth/twitch/callback", async (request, reply) => {
    if (!options.oauth)
      throw new DomainError(
        503,
        "oauth_unconfigured",
        "Twitch sign-in is not configured.",
      );
    const query = z.object({ code: id, state: id }).parse(request.query);
    const browserState = cookies(request).afterlife_oauth_state;
    const expiresAt = states.get(query.state);
    if (
      !browserState ||
      !safeEqual(browserState, query.state) ||
      !expiresAt ||
      expiresAt <= Date.now()
    )
      throw new DomainError(
        400,
        "invalid_oauth_state",
        "Sign-in expired. Please sign in again.",
      );
    states.delete(query.state);
    const tokens = await options.oauth.exchangeCode(query.code);
    const accessToken = (tokens as { accessToken?: unknown }).accessToken;
    if (typeof accessToken !== "string")
      throw new DomainError(
        502,
        "oauth_invalid_tokens",
        "Twitch sign-in failed.",
      );
    const identity = await options.oauth.getIdentity(accessToken);
    if (!identity.id)
      throw new DomainError(
        502,
        "oauth_invalid_identity",
        "Twitch sign-in failed.",
      );
    await options.onAuthenticated?.(identity, tokens);
    const world = await service.createWorld(
      identity.id,
      undefined,
      options.rehearsalOnly ?? false,
    );
    reply.header("Set-Cookie", [
      cookie(cookieName, sessions.create(identity.id), secure, 43200),
      cookie("afterlife_oauth_state", "", secure, 0),
    ]);
    return reply.redirect(`/studio/${encodeURIComponent(world.worldId)}`);
  });
  app.post("/api/worlds", async (request) => {
    const creator = session(request);
    const input = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        rehearsal: z.boolean().optional(),
      })
      .strict()
      .parse(request.body ?? {});
    return publicSnapshot(
      await service.createWorld(
        creator.ownerId,
        input.name,
        options.rehearsalOnly || creator.rehearsal || input.rehearsal === true,
      ),
    );
  });
  app.get<{ Params: { id: string } }>("/api/worlds/:id", async (request) =>
    publicSnapshot(await service.getWorld(id.parse(request.params.id))),
  );
  app.get<{ Params: { id: string } }>(
    "/api/worlds/:id/history",
    async (request) => {
      const query = z
        .object({ before: z.coerce.number().int().positive().optional() })
        .strict()
        .parse(request.query);
      return service.history(id.parse(request.params.id), query.before);
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/worlds/:id/stream",
    async (request, reply) => {
      const worldId = id.parse(request.params.id);
      const initial = await service.getWorld(worldId);
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      let lastRevision = -1;
      const send = (snapshot: WorldSnapshot) => {
        if (reply.raw.destroyed || snapshot.revision <= lastRevision) return;
        lastRevision = snapshot.revision;
        if (
          !reply.raw.write(
            `event: world.snapshot\nid: ${snapshot.revision}\ndata: ${JSON.stringify(publicSnapshot(snapshot))}\n\n`,
          )
        )
          reply.raw.destroy();
      };
      send(initial);
      const unsubscribe = service.subscribe(worldId, send);
      // Re-read after subscription to close the initial snapshot/subscription race.
      void service
        .getWorld(worldId)
        .then(send)
        .catch(() => reply.raw.end());
      const heartbeat = setInterval(() => {
        if (!reply.raw.destroyed) reply.raw.write(": heartbeat\n\n");
      }, 15000);
      heartbeat.unref();
      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        clients.delete(close);
      };
      const close = () => {
        cleanup();
        reply.raw.end();
      };
      clients.add(close);
      reply.raw.on("close", cleanup);
    },
  );
  app.addHook("onClose", async () => {
    for (const close of [...clients]) close();
  });
  app.post<{ Params: { id: string } }>(
    "/api/worlds/:id/episodes/start",
    async (request) => {
      const creator = await owner(request, request.params.id);
      const body = command.parse(request.body);
      const snapshot = await service.startEpisode(
        request.params.id,
        creator.ownerId,
        body.requestId,
      );
      return publicSnapshot(
        options.onEpisodeStarted
          ? await options.onEpisodeStarted(snapshot)
          : snapshot,
      );
    },
  );
  app.post<{ Params: { id: string; episodeId: string } }>(
    "/api/worlds/:id/episodes/:episodeId/end",
    async (request) => {
      const creator = await owner(request, request.params.id);
      const body = command.parse(request.body);
      return publicSnapshot(
        await service.endEpisode(
          request.params.id,
          creator.ownerId,
          request.params.episodeId,
          body.requestId,
        ),
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/worlds/:id/scenes/prepare",
    async (request) => {
      const creator = await owner(request, request.params.id);
      const body = command.parse(request.body);
      const prepared = await service.prepareScene(
        request.params.id,
        creator.ownerId,
        body.requestId,
      );
      return publicSnapshot(
        options.onScenePrepared
          ? await options.onScenePrepared(prepared)
          : prepared,
      );
    },
  );
  for (const operation of ["open", "close", "resume"] as const)
    app.post<{ Params: { id: string; roundId: string } }>(
      `/api/worlds/:id/rounds/:roundId/${operation}`,
      async (request) => {
        const creator = await owner(request, request.params.id);
        if (operation === "open") {
          const body = openCommand.parse(request.body);
          return publicSnapshot(
            await service.openRound(
              request.params.id,
              creator.ownerId,
              request.params.roundId,
              body.requestId,
              body.durationSeconds,
            ),
          );
        }
        const body = command.parse(request.body);
        return publicSnapshot(
          await (operation === "resume"
            ? service.resumeRound(
                request.params.id,
                creator.ownerId,
                request.params.roundId,
                body.requestId,
              )
            : service.closeRound(
                request.params.id,
                creator.ownerId,
                request.params.roundId,
                body.requestId,
              )),
        );
      },
    );
  return app;
}
