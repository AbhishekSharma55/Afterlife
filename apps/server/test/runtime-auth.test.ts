import test from "node:test";
import assert from "node:assert/strict";
import {
  RefreshingTwitchSession,
  fetchBroadcastPresence,
} from "../src/runtime/twitch-auth.js";
const tokens = {
  accessToken: "old",
  refreshToken: "rotation+secret",
  expiresIn: 3600,
  scopes: ["user:read:chat"],
};
test("concurrent 401 responses rotate once and retry with the new credential", async () => {
  let refreshes = 0;
  const sent: string[] = [];
  const auth = new RefreshingTwitchSession({
    tokens,
    refresh: async (value) => {
      assert.equal(value, tokens.refreshToken);
      refreshes++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { ...tokens, accessToken: "new", refreshToken: "rotated" };
    },
    request: async (_url, init) => {
      const header = new Headers(init?.headers).get("Authorization")!;
      sent.push(header);
      return new Response(null, {
        status: header === "Bearer old" ? 401 : 204,
      });
    },
  });
  const results = await Promise.all([
    auth.request("https://api.twitch.tv/helix/users"),
    auth.request("https://api.twitch.tv/helix/users"),
  ]);
  assert.deepEqual(
    results.map((r) => r.status),
    [204, 204],
  );
  assert.equal(refreshes, 1);
  assert.equal(auth.accessToken(), "new");
  assert.equal(sent.filter((h) => h === "Bearer old").length, 2);
});
test("proactive expiry rotation is single-flight and revoked tokens fail closed", async () => {
  let now = 0,
    refreshes = 0;
  const auth = new RefreshingTwitchSession({
    tokens,
    now: () => now,
    refresh: async () => {
      refreshes++;
      throw new Error("revoked");
    },
  });
  await auth.refreshIfDue();
  assert.equal(refreshes, 0);
  now = 3500_000;
  const results = await Promise.allSettled([
    auth.refreshIfDue(),
    auth.refreshIfDue(),
  ]);
  assert.equal(refreshes, 1);
  assert.ok(results.every((r) => r.status === "rejected"));
});
test("retry is bounded and credentials cannot be sent to another origin", async () => {
  let calls = 0,
    refreshes = 0;
  const auth = new RefreshingTwitchSession({
    tokens,
    refresh: async () => {
      refreshes++;
      return { ...tokens, accessToken: "new" };
    },
    request: async () => {
      calls++;
      return new Response(null, { status: 401 });
    },
  });
  assert.equal(
    (await auth.request("https://api.twitch.tv/helix/users")).status,
    401,
  );
  assert.equal(calls, 2);
  assert.equal(refreshes, 1);
  await assert.rejects(
    auth.request("https://untrusted.example/helix/users"),
    /must target Helix/,
  );
  assert.equal(calls, 2);
});

test("presence distinguishes verified offline from failed or unrelated stream responses", async () => {
  const presence = (data: unknown, status = 200) =>
    fetchBroadcastPresence(
      { request: async () => Response.json(data, { status }) },
      "123",
      "client",
    );
  assert.equal(
    await presence({ data: [{ user_id: "123", type: "live" }] }),
    "live",
  );
  assert.equal(await presence({ data: [] }), "offline");
  assert.equal(
    await presence({ data: [{ user_id: "other", type: "live" }] }),
    "unknown",
  );
  assert.equal(await presence({ error: "unavailable" }, 503), "unknown");
  assert.equal(await presence({}), "unknown");
});
