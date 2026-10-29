import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { createApp } from "./http/app.js";
import { WorldService } from "./domain/world-service.js";
import { MemoryWorldRepository } from "./db/memory-repository.js";
import { PgWorldRepository } from "./db/pg-repository.js";
import { generateNarration } from "./integrations/narrator.js";
import type { WorldSnapshot } from "./domain/types.js";
import {
  TwitchEventSub,
  TwitchOAuth,
  type TwitchTokens,
} from "./integrations/twitch.js";

export async function startServer(env: NodeJS.ProcessEnv = process.env) {
  const allowRehearsal = env.ALLOW_REHEARSAL === "true";
  const rehearsalOnly = !env.DATABASE_URL;
  if (rehearsalOnly && !allowRehearsal)
    throw new Error(
      "DATABASE_URL is required. Set ALLOW_REHEARSAL=true only for temporary local rehearsal.",
    );
  const pool = env.DATABASE_URL
    ? new Pool({ connectionString: env.DATABASE_URL })
    : undefined;
  const repository = pool
    ? new PgWorldRepository(pool)
    : new MemoryWorldRepository();
  if (repository instanceof PgWorldRepository) await repository.migrate();
  const interval = Number(env.OFFLINE_INTERVAL_MS ?? 21600000);
  if (
    !Number.isSafeInteger(interval) ||
    interval <= 0 ||
    (!rehearsalOnly && interval < 60000)
  )
    throw new Error(
      "OFFLINE_INTERVAL_MS must be a positive integer; live worlds require at least 60000 ms.",
    );
  const service = new WorldService(repository, { offlineIntervalMs: interval });
  const publicOrigin =
    env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${env.PORT ?? "4310"}`;
  const oauthConfigured = !!(
    env.TWITCH_CLIENT_ID &&
    env.TWITCH_CLIENT_SECRET &&
    env.TWITCH_REDIRECT_URI
  );
  const oauth = oauthConfigured
    ? new TwitchOAuth(
        env.TWITCH_CLIENT_ID!,
        env.TWITCH_CLIENT_SECRET!,
        env.TWITCH_REDIRECT_URI!,
      )
    : undefined;
  const connections = new Map<
    string,
    { client: TwitchEventSub; refreshTimer: ReturnType<typeof setInterval> }
  >();
  const narrations = new Map<string, Promise<WorldSnapshot>>();
  const app = createApp({
    service,
    allowRehearsalLogin: allowRehearsal,
    rehearsalOnly,
    publicOrigin,
    secureCookies: new URL(publicOrigin).protocol === "https:",
    oauth,
    onScenePrepared: async (snapshot) => {
      const scene = snapshot.scene;
      if (
        !scene ||
        scene.round.status !== "prepared" ||
        !env.OPENAI_API_KEY ||
        !env.OPENAI_MODEL
      )
        return snapshot;
      const existing = narrations.get(scene.id);
      if (existing) {
        await existing;
        return service.getWorld(snapshot.worldId);
      }
      const job = (async () => {
        const result = await generateNarration(
          {
            facts: {
              factions: snapshot.factions,
              relationship: snapshot.relationship,
              locations: snapshot.locations,
            },
            events: snapshot.recentEvents
              .slice(-5)
              .map((event) => ({ id: event.id, summary: event.summary })),
            eligibleEncounterIds: [
              snapshot.relationship.grievance ? "retaliation" : "treaty",
            ],
            actions: scene.choices.map((choice) => ({
              id: choice.id,
              label: choice.label,
            })),
            fallbackTitle: scene.title,
            fallbackNarration: scene.narration,
          },
          { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
        );
        return service.applyNarration(
          snapshot.worldId,
          scene.id,
          result.narration,
          result.status === "fallback",
        );
      })();
      narrations.set(scene.id, job);
      if (narrations.size > 1000)
        narrations.delete(narrations.keys().next().value!);
      return job;
    },
    onAuthenticated: async (identity, value) => {
      if (!oauth) return;
      const prior = connections.get(identity.id);
      if (prior) {
        prior.client.stop();
        clearInterval(prior.refreshTimer);
      }
      const world = await service.createWorld(
        identity.id,
        undefined,
        rehearsalOnly,
      );
      let tokens = value as TwitchTokens;
      let expiresAt = Date.now() + tokens.expiresIn * 1000;
      const client = new TwitchEventSub({
        broadcasterId: identity.id,
        clientId: env.TWITCH_CLIENT_ID!,
        accessToken: () => tokens.accessToken,
        onCommand: async (input) => {
          const text =
            input.command.type === "join"
              ? `!join ${input.command.factionId}`
              : `!vote ${input.command.choiceNumber}`;
          await service.handleChat(world.worldId, {
            messageId: input.messageId,
            userId: input.userId,
            displayName: input.displayName,
            text,
            timestamp: input.timestamp,
          });
        },
        onPresence: async (broadcast) => {
          await service.setTwitchState(world.worldId, { broadcast });
        },
        onConnection: (connection) => {
          void service
            .setTwitchState(world.worldId, { connection })
            .catch(() =>
              app.log.warn("Could not persist Twitch connection state"),
            );
        },
        onError: () => app.log.warn("Twitch connection needs attention"),
      });
      let refreshing = false;
      const refreshTimer = setInterval(() => {
        if (refreshing || Date.now() < expiresAt - 120000) return;
        refreshing = true;
        void oauth
          .refresh(tokens.refreshToken)
          .then((next) => {
            tokens = next;
            expiresAt = Date.now() + next.expiresIn * 1000;
          })
          .catch(async () => {
            client.stop();
            clearInterval(refreshTimer);
            await service.setTwitchState(world.worldId, {
              connection: "unauthorized",
            });
          })
          .finally(() => {
            refreshing = false;
          });
      }, 30000);
      refreshTimer.unref();
      connections.set(identity.id, { client, refreshTimer });
      client.start();
    },
  });
  let working = false;
  const worker = setInterval(() => {
    if (working) return;
    working = true;
    void (async () => {
      await service.tickAll();
      await service.resolveDueRounds();
    })()
      .catch(() => app.log.warn("World worker failed; it will retry"))
      .finally(() => {
        working = false;
      });
  }, 1000);
  worker.unref();
  app.addHook("onClose", async () => {
    clearInterval(worker);
    for (const { client, refreshTimer } of connections.values()) {
      client.stop();
      clearInterval(refreshTimer);
    }
    await pool?.end();
  });
  const port = Number(env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("PORT must be a valid port number.");
  await app.listen({ host: env.HOST ?? "127.0.0.1", port });
  return { app, service, repository };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer()
    .then(({ app }) => {
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.once(signal, () => {
          void app.close().then(() => process.exit(0));
        });
      console.log("AFTERLIFE backend is listening.");
    })
    .catch(() => {
      console.error(
        "AFTERLIFE failed to start. Check database and server configuration.",
      );
      process.exitCode = 1;
    });
}
