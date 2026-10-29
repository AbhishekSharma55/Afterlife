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
