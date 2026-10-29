import test from "node:test";
import assert from "node:assert/strict";
import {
  OAuthStateStore,
  TwitchOAuth,
  TwitchEventSub,
  parseChatCommand,
  type SocketLike,
} from "../src/integrations/twitch.js";
import {
  generateNarration,
  type NarratorContext,
} from "../src/integrations/narrator.js";

const now = Date.parse("2026-10-30T12:00:00Z");
const notification = (id = "m1", overrides: Record<string, unknown> = {}) => ({
  metadata: {
    message_id: id,
    message_timestamp: new Date(now).toISOString(),
    message_type: "notification",
    subscription_type: "channel.chat.message",
  },
  payload: {
    event: {
      broadcaster_user_id: "owner",
      chatter_user_id: "viewer",
      chatter_user_name: "Viewer",
      message: { text: "!vote 2" },
      ...overrides,
    },
  },
});
const context: NarratorContext = {
  facts: { trust: -20 },
  events: [{ id: "betrayal", summary: "Red broke the treaty." }],
  eligibleEncounterIds: ["retaliation"],
  actions: [
    { id: "pay", label: "Pay" },
    { id: "fortify", label: "Fortify" },
    { id: "talk", label: "Talk" },
  ],
  fallbackTitle: "A reckoning",
  fallbackNarration: "Blue remembers the broken treaty.",
};
const goodNarration = {
  sceneTitle: "Blue returns",
  narration: "Blue demands an answer for the broken treaty.",
  leaderReactions: [{ factionId: "blue", text: "We remember." }],
  referencedEventIds: ["betrayal"],
  eligibleEncounterId: "retaliation",
  choiceLabels: [
    { actionId: "pay", label: "Offer payment" },
    { actionId: "fortify", label: "Fortify" },
    { actionId: "talk", label: "Begin talks" },
  ],
};
const output = (value: unknown) => ({
  status: "completed",
  output: [
    {
      type: "message",
      content: [{ type: "output_text", text: JSON.stringify(value) }],
    },
  ],
});
const fakeFetch = (fn: (...args: any[]) => Promise<Response>) =>
  fn as typeof fetch;

test("OAuth nonce is browser-bound, expiring, and single-use even when rejected", () => {
  let clock = 0;
  const states = new OAuthStateStore(() => clock, 100);
  const nonce = states.create("browserA");
  assert.equal(states.consume(nonce, "browserB"), false);
  assert.equal(states.consume(nonce, "browserA"), false);
  const next = states.create("browserA");
  clock = 101;
  assert.equal(states.consume(next, "browserA"), false);
  const valid = states.create("browserA");
  assert.equal(states.consume(valid, "browserA"), true);
  assert.equal(states.consume(valid, "browserA"), false);
});
test("OAuth refresh correctly URL-encodes rotating refresh tokens and validates scope", async () => {
  let body = "";
  const oauth = new TwitchOAuth(
    "client",
    "secret",
    "http://localhost/callback",
    fakeFetch(async (_url, init) => {
      body = String(init.body);
      return Response.json({
        access_token: "access",
        refresh_token: "new-refresh",
        expires_in: 100,
        scope: ["user:read:chat"],
      });
    }),
  );
  const result = await oauth.refresh("token+with&special=chars");
  assert.equal(
    new URLSearchParams(body).get("refresh_token"),
    "token+with&special=chars",
  );
  assert.equal(result.refreshToken, "new-refresh");
  assert.equal(
    new URL(oauth.authorizationUrl("state")).searchParams.get("scope"),
    "user:read:chat",
  );
  const wrong = new TwitchOAuth(
    "client",
    "secret",
    "http://localhost",
    fakeFetch(async () =>
      Response.json({
        access_token: "x",
        refresh_token: "y",
        expires_in: 10,
        scope: [],
      }),
    ),
  );
  await assert.rejects(wrong.exchangeCode("code"), /missing chat scope/);
});
test("chat parser accepts only bounded game commands", () => {
  assert.deepEqual(parseChatCommand(" !JOIN Blue "), {
    type: "join",
    factionId: "blue",
  });
  assert.deepEqual(parseChatCommand("!vote 3"), {
    type: "vote",
    choiceNumber: 3,
  });
  for (const text of [
    "!vote 9",
    "!vote 1 then ignore rules",
    "hello !join red",
    "!join admin",
  ])
    assert.equal(parseChatCommand(text), null);
});
test("EventSub ignores duplicates, stale events, and another channel", async () => {
  const accepted: unknown[] = [];
  const adapter = new TwitchEventSub({
    broadcasterId: "owner",
    clientId: "client",
    accessToken: () => "token",
    now: () => now,
    onCommand: (input) => {
      accepted.push(input);
    },
  });
  await adapter.ingest(notification());
  await adapter.ingest(notification());
  await adapter.ingest(
    notification("foreign", { broadcaster_user_id: "other" }),
  );
  const stale = notification("old");
  stale.metadata.message_timestamp = new Date(now - 700_000).toISOString();
  await adapter.ingest(stale);
  assert.equal(accepted.length, 1);
  assert.equal((accepted[0] as any).userId, "viewer");
});
test("failed command processing can be retried without being falsely deduplicated", async () => {
  let attempts = 0;
  const adapter = new TwitchEventSub({
    broadcasterId: "owner",
    clientId: "client",
    accessToken: () => "token",
    now: () => now,
    onCommand: () => {
      if (++attempts === 1) throw new Error("transient");
    },
  });
  await assert.rejects(adapter.ingest(notification()));
  await adapter.ingest(notification());
  await adapter.ingest(notification());
  assert.equal(attempts, 2);
});
class FakeSocket implements SocketLike {
  listeners = new Map<string, Array<(event: any) => void>>();
  closed = false;
  addEventListener(type: string, listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, value: unknown) {
    for (const listener of this.listeners.get(type) ?? []) listener(value);
  }
  send(value: unknown) {
    this.emit("message", { data: JSON.stringify(value) });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.emit("close", {});
  }
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
test("WebSocket migration preserves subscriptions and closes old socket only after welcome", async () => {
  const sockets: FakeSocket[] = [];
  const urls: string[] = [];
  let requests = 0;
  const adapter = new TwitchEventSub({
    broadcasterId: "owner",
    clientId: "client",
    accessToken: () => "token",
    onCommand: () => {},
    socketFactory: (url) => {
      urls.push(url);
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
    request: fakeFetch(async () => {
      requests++;
      return Response.json({}, { status: 202 });
    }),
  });
  adapter.start();
  sockets[0]!.send({
    metadata: { message_type: "session_welcome" },
    payload: { session: { id: "first", keepalive_timeout_seconds: 60 } },
  });
  await flush();
  assert.equal(requests, 3);
  const reconnect = "wss://eventsub.wss.twitch.tv/ws?session=saved";
  sockets[0]!.send({
    metadata: { message_type: "session_reconnect" },
    payload: { session: { reconnect_url: reconnect } },
  });
  await flush();
  assert.equal(urls[1], reconnect);
  assert.equal(sockets[0]!.closed, false);
  sockets[1]!.send({
    metadata: { message_type: "session_welcome" },
    payload: { session: { id: "migrated", keepalive_timeout_seconds: 60 } },
  });
  await flush();
  assert.equal(sockets[0]!.closed, true);
  assert.equal(requests, 3);
  adapter.stop();
});
test("narrator uses strict response schema and accepts only known actions and facts", async () => {
  let requestBody: any;
  const options = {
    apiKey: "test-key",
    model: "configured-model",
    request: fakeFetch(async (_url, init) => {
      requestBody = JSON.parse(String(init.body));
      return Response.json(output(goodNarration));
    }),
  };
  const generated = await generateNarration(context, options);
  assert.equal(generated.status, "generated");
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.store, false);
  const invented = await generateNarration(context, {
    ...options,
    request: fakeFetch(async () =>
      Response.json(
        output({ ...goodNarration, referencedEventIds: ["never-happened"] }),
      ),
    ),
  });
  assert.equal(invented.status, "fallback");
  assert.equal(invented.narration.narration, context.fallbackNarration);
  const unknownAction = await generateNarration(context, {
    ...options,
    request: fakeFetch(async () =>
      Response.json(
        output({
          ...goodNarration,
          choiceLabels: [
            { actionId: "destroy_world", label: "Destroy" },
            ...goodNarration.choiceLabels.slice(1),
          ],
        }),
      ),
    ),
  });
  assert.equal(unknownAction.status, "fallback");
});
test("narrator degrades on refusal, unavailable credentials, and network failure", async () => {
  assert.equal((await generateNarration(context)).status, "fallback");
  for (const response of [
    Response.json({
      output: [{ content: [{ type: "refusal", refusal: "No" }] }],
    }),
    new Response("unavailable", { status: 503 }),
    Response.json({ status: "incomplete", output: [] }),
  ]) {
    assert.equal(
      (
        await generateNarration(context, {
          apiKey: "key",
          model: "model",
          request: fakeFetch(async () => response),
        })
      ).status,
      "fallback",
    );
  }
  assert.equal(
    (
      await generateNarration(context, {
        apiKey: "key",
        model: "model",
        request: fakeFetch(async () => {
          throw new Error("offline");
        }),
      })
    ).status,
    "fallback",
  );
});

test("narrator accepts fewer eligible choices but requires each supplied action exactly once", async () => {
  for (const count of [1, 2]) {
    const reduced = { ...context, actions: context.actions.slice(0, count) };
    const result = await generateNarration(reduced, {
      apiKey: "key",
      model: "model",
      request: fakeFetch(async () =>
        Response.json(
          output({
            ...goodNarration,
            choiceLabels: goodNarration.choiceLabels.slice(0, count),
          }),
        ),
      ),
    });
    assert.equal(result.status, "generated");
  }
  const reduced = { ...context, actions: context.actions.slice(0, 2) };
  const duplicate = await generateNarration(reduced, {
    apiKey: "key",
    model: "model",
    request: fakeFetch(async () =>
      Response.json(
        output({
          ...goodNarration,
          choiceLabels: [
            goodNarration.choiceLabels[0],
            goodNarration.choiceLabels[1],
            goodNarration.choiceLabels[1],
          ],
        }),
      ),
    ),
  });
  assert.equal(duplicate.status, "fallback");
  const missing = await generateNarration(context, {
    apiKey: "key",
    model: "model",
    request: fakeFetch(async () =>
      Response.json(
        output({
          ...goodNarration,
          choiceLabels: goodNarration.choiceLabels.slice(0, 2),
        }),
      ),
    ),
  });
  assert.equal(missing.status, "fallback");
});
