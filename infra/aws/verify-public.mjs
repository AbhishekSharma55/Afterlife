import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { worldSnapshotSchema } from "@afterlife/shared";
const state = JSON.parse(readFileSync(".afterlife/aws/resources.json"));
const expected = JSON.parse(
  readFileSync(".afterlife/aws/migration-summary.json"),
);
const base = state.origin;
const checks = [];
for (const path of ["/", "/studio", "/health"]) {
  const r = await fetch(base + path);
  assert.equal(r.status, 200, path);
  checks.push({ route: path, status: r.status });
}
const http = await fetch(base.replace("https:", "http:") + "/health", {
  redirect: "manual",
});
assert.ok([301, 302, 307, 308].includes(http.status));
assert.equal(new URL(http.headers.get("location")).protocol, "https:");
for (const [path, status] of [
  ["/api/me", 401],
  ["/api/nonexistent", 404],
  ["/.env", 404],
]) {
  const r = await fetch(base + path);
  assert.equal(r.status, status, path);
  assert.match(r.headers.get("content-type"), /json/);
}
const practice = await fetch(base + "/auth/rehearsal", {
  method: "POST",
  headers: { Origin: base },
});
assert.equal(practice.status, 404);
const auth = await fetch(base + "/auth/twitch", { redirect: "manual" });
assert.equal(auth.status, 302);
const location = new URL(auth.headers.get("location"));
assert.equal(location.hostname, "id.twitch.tv");
assert.equal(
  location.searchParams.get("redirect_uri"),
  base + "/auth/twitch/callback",
);
const cookie = auth.headers.get("set-cookie");
assert.match(cookie, /Secure/i);
assert.match(cookie, /HttpOnly/i);
assert.match(cookie, /SameSite=Lax/i);
checks.push({
  oauthRedirectConfigured: true,
  secureStateCookie: true,
  publicRehearsalDisabled: true,
});
for (const world of expected) {
  const r = await fetch(base + "/api/worlds/" + world.worldId);
  const s = worldSnapshotSchema.parse(await r.json());
  assert.equal(s.episode?.number, world.episode);
  assert.equal(s.relationship.trust, world.trust);
  assert.equal(
    s.locations.find((l) => l.id === "westbridge").status,
    world.bridge,
  );
  const h = await fetch(base + "/api/worlds/" + world.worldId + "/history");
  assert.equal((await h.json()).events.length, world.events);
  checks.push({
    worldPreserved: true,
    episode: s.episode?.number,
    trust: s.relationship.trust,
    events: world.events,
  });
}
const browser = await chromium.launch();
const browserErrors = [];
try {
  for (const [surface, path, size] of [
    ["studio", "/studio", { width: 1280, height: 900 }],
    ["world", "/world/" + state.worldIds[0], { width: 390, height: 844 }],
    ["overlay", "/overlay/" + state.worldIds[0], { width: 1920, height: 1080 }],
  ]) {
    const page = await browser.newPage({ viewport: size });
    page.on("pageerror", (e) => browserErrors.push(e.message));
    const response = await page.goto(base + path);
    assert.equal(response.status(), 200);
    if (surface === "studio")
      await page.locator('a[href="/auth/twitch"]').waitFor();
    else if (surface === "world") await page.locator(".map").first().waitFor();
    else await page.locator(".ov-badge").waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    if (surface === "overlay") {
      assert.equal(
        await page.evaluate(
          () => getComputedStyle(document.documentElement).backgroundColor,
        ),
        "rgba(0, 0, 0, 0)",
      );
    }
    await page.screenshot({
      path: ".afterlife/aws/public-" + surface + ".png",
      fullPage: surface !== "overlay",
    });
    await page.close();
  }
  assert.deepEqual(browserErrors, []);
} finally {
  await browser.close();
}
const controller = new AbortController();
const start = performance.now();
const stream = await fetch(
  base + "/api/worlds/" + state.worldIds[0] + "/stream",
  { signal: controller.signal },
);
assert.equal(stream.status, 200);
assert.match(stream.headers.get("content-type"), /text\/event-stream/);
const reader = stream.body.getReader();
let text = "",
  firstByteMs,
  heartbeats = 0;
const timer = setTimeout(() => controller.abort(), 45000);
try {
  while (heartbeats < 2) {
    const chunk = await reader.read();
    if (chunk.done) break;
    firstByteMs ??= Math.round(performance.now() - start);
    text += new TextDecoder().decode(chunk.value);
    heartbeats = (text.match(/: heartbeat/g) || []).length;
  }
  assert.ok(text.includes("event: world.snapshot"));
  assert.ok(heartbeats >= 2);
} finally {
  clearTimeout(timer);
  await reader.cancel().catch(() => {});
  controller.abort();
}
checks.push({
  sseInitialSnapshot: true,
  sseHeartbeats: heartbeats,
  firstByteMs,
  browserErrors: browserErrors.length,
});
const result = { origin: base, testedAt: new Date().toISOString(), checks };
writeFileSync(
  ".afterlife/aws/public-verification.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
