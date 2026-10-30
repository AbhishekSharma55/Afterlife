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
test("stopping during subscription prevents stale connected state and further subscriptions", async () => {
  const socket = new FakeSocket();
  const states: string[] = [];
  let requests = 0;
  let complete!: (response: Response) => void;
  const adapter = new TwitchEventSub({
    broadcasterId: "owner",
    clientId: "client",
    accessToken: () => "token",
    onCommand: () => {},
    onConnection: (state) => states.push(state),
    socketFactory: () => socket,
    request: fakeFetch(async () => {
      requests++;
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    }),
  });
  adapter.start();
  socket.send({
    metadata: { message_type: "session_welcome" },
    payload: { session: { id: "first", keepalive_timeout_seconds: 60 } },
  });
  await flush();
  assert.equal(requests, 1);
  adapter.stop();
  complete(Response.json({}, { status: 202 }));
  await flush();
  assert.equal(requests, 1);
  assert.deepEqual(states, ["connecting", "disconnected"]);
  assert.equal(socket.closed, true);
});
test("a socket without a welcome retries and stop cancels its timers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sockets: FakeSocket[] = [];
  const adapter = new TwitchEventSub({
    broadcasterId: "owner",
    clientId: "client",
    accessToken: () => "token",
    onCommand: () => {},
    socketFactory: () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  });
  t.after(() => adapter.stop());
  adapter.start();
  t.mock.timers.tick(10_000);
  assert.equal(sockets[0]!.closed, true);
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 2);
  adapter.stop();
  t.mock.timers.tick(30_000);
  assert.equal(sockets.length, 2);
  adapter.start();
  t.mock.timers.tick(10_000);
  adapter.stop(); // Cancel a scheduled retry, then reuse this client.
  adapter.start();
  t.mock.timers.tick(10_000);
  t.mock.timers.tick(1000);
  assert.equal(sockets.length, 5);
});
test("a silent migration or lost old socket recovers with a fresh subscribed session", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const loseOld of [false, true]) {
    const sockets: FakeSocket[] = [];
    const states: string[] = [];
    let requests = 0;
    const adapter = new TwitchEventSub({
      broadcasterId: "owner",
      clientId: "client",
      accessToken: () => "token",
      onCommand: () => {},
      onConnection: (state) => states.push(state),
      socketFactory: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      request: fakeFetch(async () => {
        requests++;
        return Response.json({}, { status: 202 });
      }),
    });
    const welcome = (socket: FakeSocket, id: string) =>
      socket.send({
        metadata: { message_type: "session_welcome" },
        payload: { session: { id, keepalive_timeout_seconds: 60 } },
      });
    adapter.start();
    welcome(sockets[0]!, "first");
    await flush();
    sockets[0]!.send({
      metadata: { message_type: "session_reconnect" },
      payload: {
        session: {
          reconnect_url: "wss://eventsub.wss.twitch.tv/ws?session=saved",
        },
      },
    });
    await flush();
    if (loseOld) sockets[0]!.close();
    else t.mock.timers.tick(10_000);
    assert.equal(sockets[0]!.closed, true);
    assert.equal(sockets[1]!.closed, true);
    t.mock.timers.tick(1000);
    assert.equal(sockets.length, 3);
    welcome(sockets[2]!, "fresh");
    await flush();
    assert.equal(requests, 6);
    assert.equal(states.at(-1), "connected");
    adapter.stop();
  }
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

test('episode recaps source betrayal and offline developments and render canonical vote credits', async () => {
  const { generateRecap } = await import('../src/integrations/narrator.js');
  const recorded = { displayName: 'River', factionId: 'red' as const, choiceId: 'break_treaty', sourceEventId: 'betrayal', summary: 'River voted to break the treaty while aligned with Red.' };
  const context = { facts: { trust: -20 }, previousEvents: [{ id: 'betrayal', summary: 'The community broke the treaty.' }], offlineEvents: [{ id: 'preparation', summary: 'Blue prepares retaliation.' }], contributions: [recorded], fallbackPreviously: 'The treaty was broken.', fallbackWhileAway: 'Blue prepares retaliation.' };
  let payload: any;
  const good = { previously: 'The council broke its promise.', whileAway: 'Blue prepared a response.', referencedEventIds: ['betrayal', 'preparation'], contributionRefs: [{ displayName: 'River', choiceId: 'break_treaty', sourceEventId: 'betrayal' }] };
  const result = await generateRecap(context, { apiKey: 'key', model: 'model', request: fakeFetch(async (_url, init) => { payload = JSON.parse(String(init.body)); return Response.json(output(good)); }) });
  assert.equal(result.status, 'generated');
  assert.deepEqual(result.recap.contributionCredits, [recorded]);
  assert.equal(payload.text.format.strict, true);
  assert.deepEqual(JSON.parse(payload.input).facts, { trust: -20 });
  for (const invalid of [
    { ...good, referencedEventIds: ['betrayal', 'invented_war'] },
    { ...good, referencedEventIds: ['betrayal'] },
    { ...good, contributionRefs: [{ displayName: 'River', choiceId: 'honor_treaty', sourceEventId: 'betrayal' }] },
    { ...good, contributionRefs: [{ displayName: 'Unknown viewer', choiceId: 'break_treaty', sourceEventId: 'betrayal' }] },
    { ...good, contributionRefs: [...good.contributionRefs, ...good.contributionRefs] },
  ]) {
    const rejected = await generateRecap(context, { apiKey: 'key', model: 'model', request: fakeFetch(async () => Response.json(output(invalid))) });
    assert.equal(rejected.status, 'fallback');
    assert.equal(rejected.recap.previously, 'The treaty was broken.');
    assert.deepEqual(rejected.recap.contributionCredits, [recorded]);
  }
});
test('recap fallback preserves a historical vote after the viewer changes affiliation and does not invent offline action', async () => {
  const { generateRecap } = await import('../src/integrations/narrator.js');
  const recorded = { displayName: 'River', factionId: 'red' as const, choiceId: 'break_treaty', sourceEventId: 'betrayal', summary: 'River supported the treaty breach as a Red member.' };
  const context = { facts: { currentMembership: 'blue' }, previousEvents: [{ id: 'betrayal', summary: 'Red breaks the treaty.' }], offlineEvents: [], contributions: [recorded], fallbackPreviously: 'The treaty was broken.', fallbackWhileAway: '' };
  const fallback = await generateRecap(context);
  assert.equal(fallback.recap.contributionCredits[0]!.factionId, 'red');
  const generated = await generateRecap(context, { apiKey: 'key', model: 'model', request: fakeFetch(async () => Response.json(output({ previously: 'The community broke a treaty.', whileAway: 'An invented overnight battle took place.', referencedEventIds: ['betrayal'], contributionRefs: [] }))) });
  assert.equal(generated.recap.whileAway, '');
  const unavailable = await generateRecap(context, { apiKey: 'key', model: 'model', request: fakeFetch(async () => { throw new Error('offline'); }) });
  assert.equal(unavailable.status, 'fallback');
  assert.deepEqual(unavailable.recap.referencedEventIds, ['betrayal']);
});

test('fallback recap always includes the source of displayed individual credits in its bounded references', async () => {
  const { factualRecap } = await import('../src/integrations/narrator.js');
  const events = Array.from({ length: 20 }, (_, i) => ({ id: `event_${i}`, summary: `Recorded event ${i}` }));
  const result = factualRecap({ facts: {}, previousEvents: events, offlineEvents: [], contributions: [{ displayName: 'River', factionId: 'red', choiceId: 'break_treaty', sourceEventId: 'event_19', summary: 'River voted to break the treaty.' }], fallbackPreviously: 'The treaty was broken.', fallbackWhileAway: '' });
  assert.ok(result.recap.referencedEventIds.includes('event_19'));
  assert.ok(result.recap.referencedEventIds.length <= 12);
});
