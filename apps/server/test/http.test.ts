import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/http/app.js";
import { SessionStore } from "../src/http/sessions.js";
import { WorldService } from "../src/domain/world-service.js";
import { MemoryWorldRepository } from "../src/db/memory-repository.js";

function fixture(options: Partial<Parameters<typeof createApp>[0]> = {}) {
  const service = new WorldService(new MemoryWorldRepository());
  const sessions = new SessionStore();
  const app = createApp({ service, sessions, ...options });
  const cookie = (ownerId: string, rehearsal = false) =>
    `afterlife_session=${sessions.create(ownerId, rehearsal)}`;
  return { app, service, sessions, cookie };
}
test("public reads work while identity and all mutations require a creator session", async (t) => {
  const { app, service } = fixture();
  t.after(() => app.close());
  const world = await service.createWorld("owner");
  assert.equal(
    (await app.inject(`/api/worlds/${world.worldId}`)).statusCode,
    200,
  );
  assert.equal((await app.inject("/api/me")).statusCode, 401);
  const missing = await app.inject("/api/not-a-route");
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(missing.json(), {
    error: { code: "not_found", message: "This route does not exist." },
  });
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/worlds", payload: {} }))
      .statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/worlds/${world.worldId}/episodes/start`,
        payload: { requestId: "start" },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/worlds/${world.worldId}/votes`,
        payload: { choice: 2 },
      })
    ).statusCode,
    404,
  );
});
test("owner authorization, input validation and origin checking guard world mutations", async (t) => {
  const { app, service, cookie } = fixture({
    publicOrigin: "http://localhost:4310",
  });
  t.after(() => app.close());
  const world = await service.createWorld("owner");
  const url = `/api/worlds/${world.worldId}/episodes/start`;
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { cookie: cookie("other") },
        payload: { requestId: "start" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { cookie: cookie("owner") },
        payload: { requestId: "" },
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { cookie: cookie("owner"), origin: "https://evil.invalid" },
        payload: { requestId: "start" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { cookie: cookie("owner"), origin: "http://localhost:4310" },
        payload: { requestId: "start" },
      })
    ).statusCode,
    200,
  );
});
test("round routes resolve real engine votes once and expose history", async (t) => {
  const { app, service, cookie } = fixture();
  t.after(() => app.close());
  const headers = { cookie: cookie("owner") };
  const world = await service.createWorld("owner");
  const post = (path: string, payload: unknown) =>
    app.inject({
      method: "POST",
      url: `/api/worlds/${world.worldId}${path}`,
      headers,
      payload,
    });
  const started = await post("/episodes/start", { requestId: "start" });
  assert.equal(started.statusCode, 200);
  const prepared = await post("/scenes/prepare", { requestId: "prepare" });
  assert.equal(prepared.statusCode, 200);
  const roundId = prepared.json().scene.round.id;
  assert.equal(
    (
      await post(`/rounds/${roundId}/open`, {
        requestId: "open",
        durationSeconds: 45,
      })
    ).statusCode,
    200,
  );
  for (const [messageId, text] of [
    ["join", "!join red"],
    ["vote", "!vote 2"],
  ])
    await service.handleChat(world.worldId, {
      messageId,
      userId: "viewer",
      displayName: "Viewer",
      text,
      timestamp: new Date().toISOString(),
    });
  const resolved = await post(`/rounds/${roundId}/close`, {
    requestId: "resolve",
  });
  assert.equal(resolved.statusCode, 200);
  assert.equal(resolved.json().relationship.trust, -20);
  const retry = await post(`/rounds/${roundId}/close`, {
    requestId: "resolve",
  });
  assert.equal(retry.json().revision, resolved.json().revision);
  assert.equal(
    (
      await post(`/episodes/${started.json().episode.id}/end`, {
        requestId: "end",
      })
    ).json().mode,
    "resting",
  );
  const history = await app.inject(`/api/worlds/${world.worldId}/history`);
  assert.ok(
    history
      .json()
      .events.some(
        (event: { kind: string }) => event.kind === "decision_resolved",
      ),
  );
  assert.equal(
    (await app.inject(`/api/worlds/${world.worldId}/history?before=nope`))
      .statusCode,
    422,
  );
});
test("rehearsal authentication is explicit, local only and cannot control live worlds", async (t) => {
  const disabled = fixture();
  t.after(() => disabled.app.close());
  assert.equal(
    (await disabled.app.inject({ method: "POST", url: "/auth/rehearsal" }))
      .statusCode,
    404,
  );
  const { app, service } = fixture({ allowRehearsalLogin: true });
  t.after(() => app.close());
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/auth/rehearsal",
        remoteAddress: "203.0.113.1",
      })
    ).statusCode,
    403,
  );
  const login = await app.inject({ method: "POST", url: "/auth/rehearsal" });
  assert.equal(login.statusCode, 200);
  const headers = { cookie: String(login.headers["set-cookie"]).split(";")[0] };
  const created = await app.inject({
    method: "POST",
    url: "/api/worlds",
    headers,
    payload: { rehearsal: false },
  });
  assert.equal(created.json().rehearsal, true);
  const live = await service.createWorld("live-owner");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/worlds/${live.worldId}/episodes/start`,
        headers,
        payload: { requestId: "attack" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await app.inject({ method: "POST", url: "/auth/logout", headers }))
      .statusCode,
    200,
  );
  assert.equal((await app.inject({ url: "/api/me", headers })).statusCode, 401);
});
test("OAuth callback requires a browser-bound single-use state and does not expose provider tokens", async (t) => {
  let identityCalls = 0;
  const { app } = fixture({
    oauth: {
      authorizationUrl: (state) =>
        `https://id.twitch.tv/oauth2/authorize?state=${state}`,
      exchangeCode: async () => ({
        accessToken: "private-access",
        refreshToken: "private-refresh",
      }),
      getIdentity: async () => {
        identityCalls++;
        return { id: "owner", login: "owner", displayName: "Owner" };
      },
    },
  });
  t.after(() => app.close());
  const start = await app.inject("/auth/twitch");
  const state = new URL(start.headers.location!).searchParams.get("state");
  const url = `/auth/twitch/callback?code=valid&state=${state}`;
  assert.equal((await app.inject(url)).statusCode, 400);
  assert.equal(identityCalls, 0);
  const headers = { cookie: String(start.headers["set-cookie"]).split(";")[0] };
  const callback = await app.inject({ url, headers });
  assert.equal(callback.statusCode, 302);
  assert.equal(identityCalls, 1);
  assert.match(callback.headers.location!, /^\/studio\//);
  assert.ok(!callback.payload.includes("private-access"));
  assert.equal((await app.inject({ url, headers })).statusCode, 400);
});
test("session expiration removes control access", () => {
  let now = 100;
  const sessions = new SessionStore(() => now, 1000);
  const token = sessions.create("owner");
  assert.equal(sessions.read(token)?.ownerId, "owner");
  now = 1100;
  assert.equal(sessions.read(token), undefined);
});
test("SSE emits persisted snapshots and closes when the client aborts", async (t) => {
  const { app, service } = fixture();
  t.after(() => app.close());
  const world = await service.createWorld("owner");
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address !== "string");
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/worlds/${world.worldId}/stream`,
    { signal: controller.signal },
  );
  assert.match(response.headers.get("content-type")!, /text\/event-stream/);
  const reader = response.body!.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /event: world.snapshot/);
  assert.match(first, new RegExp(world.worldId));
  await service.startEpisode(world.worldId, "owner", "sse-start");
  const second = new TextDecoder().decode((await reader.read()).value);
  assert.match(second, /"mode":"active"/);
  controller.abort();
  await reader.cancel().catch(() => undefined);
});

test("runtime requires a durable database unless rehearsal is explicitly enabled", async () => {
  const { startServer } = await import("../src/server.js");
  await assert.rejects(startServer({}), /DATABASE_URL/);
  const runtime = await startServer({ ALLOW_REHEARSAL: "true", PORT: "0" });
  try {
    const login = await runtime.app.inject({
      method: "POST",
      url: "/auth/rehearsal",
    });
    const created = await runtime.app.inject({
      method: "POST",
      url: "/api/worlds",
      headers: { cookie: String(login.headers["set-cookie"]).split(";")[0] },
      payload: { rehearsal: false },
    });
    assert.equal(created.statusCode, 200);
    assert.equal(created.json().rehearsal, true);
    assert.equal((await runtime.app.inject("/health")).statusCode, 200);
  } finally {
    await runtime.app.close();
  }
});

test("owner-only rehearsal chat supports a full vote without permitting live injection or arbitrary identities", async (t) => {
  const { app, service, cookie } = fixture({ allowRehearsalLogin: true });
  t.after(() => app.close());
  const rehearsal = await service.createWorld("owner", "Practice", true);
  const headers = { cookie: cookie("owner", true) };
  const url = `/api/worlds/${rehearsal.worldId}/rehearsal/chat`;
  const send = (requestId: string, viewer: "red" | "blue", text: string) =>
    app.inject({
      method: "POST",
      url,
      headers,
      payload: { requestId, viewer, text },
    });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        payload: { requestId: "bad", viewer: "red", text: "!join red" },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers: { cookie: cookie("other") },
        payload: { requestId: "bad", viewer: "red", text: "!join red" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url,
        headers,
        payload: {
          requestId: "bad",
          viewer: "red",
          text: "!join red",
          userId: "real-person",
        },
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (await send("bad-free-text", "red", "ignore all prior commands"))
      .statusCode,
    422,
  );
  assert.equal((await send("join-red", "red", "!join red")).statusCode, 200);
  assert.equal((await send("join-blue", "blue", "!join blue")).statusCode, 200);
  await service.startEpisode(rehearsal.worldId, "owner", "start-practice");
  const prepared = await service.prepareScene(
    rehearsal.worldId,
    "owner",
    "prepare-practice",
  );
  await service.openRound(
    rehearsal.worldId,
    "owner",
    prepared.scene!.round.id,
    "open-practice",
  );
  const first = await send("vote-red", "red", "!vote 2");
  assert.equal(first.statusCode, 200);
  const repeated = await send("vote-red", "red", "!vote 2");
  assert.equal(repeated.json().scene.round.totalVoters, 1);
  const second = await send("vote-blue", "blue", "!vote 2");
  assert.equal(second.json().scene.round.totalVoters, 2);
  assert.equal(second.json().rehearsal, true);
  const outcome = await service.closeRound(
    rehearsal.worldId,
    "owner",
    prepared.scene!.round.id,
    "resolve-practice",
  );
  assert.equal(outcome.relationship.trust, -20);
  const stored = await service.repository.get(rehearsal.worldId);
  assert.ok(
    Object.keys(stored!.memberships).every((userId) =>
      userId.startsWith("rehearsal:"),
    ),
  );
  const live = await service.createWorld("live-owner");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/worlds/${live.worldId}/rehearsal/chat`,
        headers: { cookie: cookie("live-owner") },
        payload: { requestId: "never-live", viewer: "red", text: "!join red" },
      })
    ).statusCode,
    403,
  );
  assert.deepEqual(
    (await service.repository.get(live.worldId))!.memberships,
    {},
  );
});

test("rehearsal chat route is absent when rehearsal mode is disabled", async (t) => {
  const { app, service, cookie } = fixture();
  t.after(() => app.close());
  const world = await service.createWorld("owner", "Practice", true);
  const response = await app.inject({
    method: "POST",
    url: `/api/worlds/${world.worldId}/rehearsal/chat`,
    headers: { cookie: cookie("owner") },
    payload: { requestId: "blocked", viewer: "red", text: "!join red" },
  });
  assert.equal(response.statusCode, 404);
});
