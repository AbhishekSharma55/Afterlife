import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { createApp } from "./http/app.js";
import { WorldService } from "./domain/world-service.js";
import { MemoryWorldRepository } from "./db/memory-repository.js";
import { PgWorldRepository } from "./db/pg-repository.js";
import { generateNarration, generateRecap } from "./integrations/narrator.js";
import {
  RefreshingTwitchSession,
  fetchBroadcastPresence,
} from "./runtime/twitch-auth.js";
import type { WorldSnapshot } from "./domain/types.js";
import {
  TwitchEventSub,
  TwitchOAuth,
  type TwitchTokens,
} from "./integrations/twitch.js";

export interface StartupDependencies {
  createPool?: (connectionString: string) => Pool;
  createApp?: typeof createApp;
}

export async function startServer(
  env: NodeJS.ProcessEnv = process.env,
  dependencies: StartupDependencies = {},
) {
  const allowRehearsal = env.ALLOW_REHEARSAL === "true";
  const rehearsalOnly = !env.DATABASE_URL;
  if (rehearsalOnly && !allowRehearsal)
    throw new Error(
      "DATABASE_URL is required. Set ALLOW_REHEARSAL=true only for temporary local rehearsal.",
    );
  const interval = Number(env.OFFLINE_INTERVAL_MS ?? 21600000);
  if (
    !Number.isSafeInteger(interval) ||
    interval <= 0 ||
    (!rehearsalOnly && interval < 60000)
  )
    throw new Error(
      "OFFLINE_INTERVAL_MS must be a positive integer; live worlds require at least 60000 ms.",
    );
  const port = Number(env.PORT ?? 4310);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("PORT must be a valid port number.");
  const publicOrigin = env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${port}`;
  let origin: URL;
  try {
    origin = new URL(publicOrigin);
  } catch {
    throw new Error("PUBLIC_ORIGIN must be an HTTP or HTTPS URL.");
  }
  if (
    !["http:", "https:"].includes(origin.protocol) ||
    origin.username ||
    origin.password
  )
    throw new Error(
      "PUBLIC_ORIGIN must be an HTTP or HTTPS URL without credentials.",
    );
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
  const recaps = new Map<string, Promise<WorldSnapshot>>();
  const pool = env.DATABASE_URL
    ? (
        dependencies.createPool ??
        ((connectionString) => new Pool({ connectionString }))
      )(env.DATABASE_URL)
    : undefined;
  let app: ReturnType<typeof createApp> | undefined;
  let worker: ReturnType<typeof setInterval> | undefined;
  let workerJob: Promise<void> | undefined;
  let cleanedUp = false;
  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (worker) clearInterval(worker);
    for (const { client, refreshTimer } of connections.values()) {
      client.stop();
      clearInterval(refreshTimer);
    }
    await workerJob;
    await pool?.end();
  };
  try {
    const repository = pool
      ? new PgWorldRepository(pool)
      : new MemoryWorldRepository();
    if (repository instanceof PgWorldRepository) await repository.migrate();
    const service = new WorldService(repository, {
      offlineIntervalMs: interval,
    });
    // Provider sessions are memory-only. A restarted process must not advertise an old live connection.
    for (const stored of await repository.list()) {
      await service.setTwitchState(stored.snapshot.worldId, {
        connection: "disconnected",
        broadcast: "unknown",
      });
    }
    const application = (dependencies.createApp ?? createApp)({
      service,
      webDist: env.WEB_DIST || undefined,
      allowRehearsalLogin: allowRehearsal,
      rehearsalOnly,
      publicOrigin,
      secureCookies: origin.protocol === "https:",
      oauth,
      onScenePrepared: async (snapshot) => {
        const scene = snapshot.scene;
        if (!scene || scene.round.status !== "prepared") return snapshot;
        const existing = narrations.get(scene.id);
        if (existing) {
          await existing;
          return service.getWorld(snapshot.worldId);
        }
        const job = (async () => {
          const memory = await service.getNarratorMemory(snapshot.worldId);
          if (
            memory.facts.mode !== "active" ||
            memory.facts.scene?.id !== scene.id ||
            memory.facts.scene.round.status !== "prepared" ||
            memory.facts.scene.leaderReactions !== undefined
          )
            return memory.facts;
          const relevantEvents = [
            ...new Map(
              [
                ...snapshot.recentEvents.slice(-4),
                ...memory.events.filter((event) =>
                  scene.causeEventIds.includes(event.id),
                ),
              ].map((event) => [
                event.id,
                { id: event.id, summary: event.summary },
              ]),
            ).values(),
          ];
          const result = await generateNarration(
            {
              facts: {
                factions: snapshot.factions,
                relationship: snapshot.relationship,
                locations: snapshot.locations,
              },
              events: relevantEvents,
              contributions: memory.contributions,
              eligibleEncounterIds: [
                scene.encounterId ??
                  (snapshot.relationship.grievance ? "retaliation" : "treaty"),
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
      onEpisodeStarted: async (snapshot) => {
        const episode = snapshot.episode;
        if (!episode || episode.status !== "active") return snapshot;
        const existing = recaps.get(episode.id);
        if (existing) {
          await existing;
          return service.getWorld(snapshot.worldId);
        }
        const job = (async () => {
          const memory = await service.getNarratorMemory(snapshot.worldId);
          if (
            memory.episodeId !== episode.id ||
            memory.facts.mode !== "active" ||
            memory.facts.recap.generationStatus !== undefined
          )
            return memory.facts;
          const result = await generateRecap(
            {
              facts: {
                factions: snapshot.factions,
                relationship: snapshot.relationship,
                locations: snapshot.locations,
              },
              events: memory.events,
              previousEvents: memory.previousEpisodeEvents,
              offlineEvents: memory.offlineEvents,
              contributions: memory.contributions,
              fallbackPreviously: memory.fallbackPreviously,
              fallbackWhileAway: memory.fallbackWhileAway,
            },
            { apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL },
          );
          return service.applyRecap(
            snapshot.worldId,
            episode.id,
            result.recap,
            result.status === "fallback",
          );
        })();
        recaps.set(episode.id, job);
        if (recaps.size > 1000) recaps.delete(recaps.keys().next().value!);
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
        const tokenSession = new RefreshingTwitchSession({
          tokens: value as TwitchTokens,
          refresh: (refreshToken) => oauth.refresh(refreshToken),
        });
        let presenceVersion = 0;
        let connectionVersion = 0;
        const client = new TwitchEventSub({
          broadcasterId: identity.id,
          clientId: env.TWITCH_CLIENT_ID!,
          accessToken: tokenSession.accessToken,
          request: tokenSession.request,
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
            presenceVersion++;
            await service.setTwitchState(world.worldId, { broadcast });
          },
          onConnection: (connection) => {
            const generation = ++connectionVersion;
            const eventVersion = presenceVersion;
            void (async () => {
              await service.setTwitchState(world.worldId, {
                connection,
                ...(connection !== "connected"
                  ? { broadcast: "unknown" as const }
                  : {}),
              });
              if (connection !== "connected") return;
              const broadcast = await fetchBroadcastPresence(
                tokenSession,
                identity.id,
                env.TWITCH_CLIENT_ID!,
              );
              if (
                generation === connectionVersion &&
                eventVersion === presenceVersion
              ) {
                await service.setTwitchState(world.worldId, { broadcast });
              }
            })().catch(() =>
              application.log.warn(
                "Could not reconcile Twitch connection state",
              ),
            );
          },
          onError: () =>
            application.log.warn("Twitch connection needs attention"),
        });
        let refreshing = false;
        const refreshTimer = setInterval(() => {
          if (refreshing) return;
          refreshing = true;
          void tokenSession
            .refreshIfDue()
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
    app = application;
    application.addHook("onClose", cleanup);
    worker = setInterval(() => {
      if (workerJob) return;
      workerJob = (async () => {
        await service.tickAll();
        await service.resolveDueRounds();
      })()
        .catch(() => application.log.warn("World worker failed; it will retry"))
        .finally(() => {
          workerJob = undefined;
        });
    }, 1000);
    worker.unref();
    await application.listen({ host: env.HOST ?? "127.0.0.1", port });
    return { app: application, service, repository };
  } catch (error) {
    try {
      await app?.close();
    } catch {
      // Preserve the original startup failure while still releasing the database.
    }
    await cleanup().catch(() => undefined);
    throw error;
  }
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
