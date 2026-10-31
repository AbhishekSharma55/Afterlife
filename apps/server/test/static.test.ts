import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/http/app.js";
import { WorldService } from "../src/domain/world-service.js";
import { MemoryWorldRepository } from "../src/db/memory-repository.js";

async function fixture(t: { after(fn: () => Promise<unknown>): void }) {
  const temporary = await mkdtemp(join(tmpdir(), "afterlife-static-"));
  const root = join(temporary, "dist");
  await mkdir(join(root, "assets"), { recursive: true });
  await mkdir(join(root, "art"));
  await writeFile(
    join(root, "index.html"),
    '<!doctype html><html><body>AFTERLIFE<script type="module" src="/assets/app-abcdefgh.js"></script></body></html>',
  );
  await writeFile(
    join(root, "assets", "app-abcdefgh.js"),
    'console.log("AFTERLIFE");',
  );
  await writeFile(
    join(root, "art", "map.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  );
  await writeFile(
    join(root, "favicon.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
  );
  await writeFile(join(root, ".env"), "PRIVATE=must-not-be-served");
  await writeFile(join(temporary, "outside.txt"), "PRIVATE=must-not-be-served");
  await symlink(
    join(temporary, "outside.txt"),
    join(root, "assets", "outside.txt"),
  );
  const service = new WorldService(new MemoryWorldRepository());
  const app = createApp({ service, webDist: root });
  t.after(async () => {
    await app.close();
    await rm(temporary, { recursive: true, force: true });
  });
  return { app, root, service, temporary };
}

test("built frontend serves home and exact browser routes directly without caching the shell", async (t) => {
  const { app } = await fixture(t);
  for (const url of [
    "/",
    "/studio",
    "/studio/",
    "/studio/world-example",
    "/world/world-example",
    "/overlay/world-example",
    "/world/world-example?rehearsal=1",
  ]) {
    const response = await app.inject({
      url,
      headers: { accept: "text/html" },
    });
    assert.equal(response.statusCode, 200, url);
    assert.match(String(response.headers["content-type"]), /text\/html/);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.match(response.body, /AFTERLIFE/);
  }
  const head = await app.inject({
    method: "HEAD",
    url: "/studio/world-example",
  });
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, "");
});

test("hashed JavaScript and public artwork retain correct MIME types and caching", async (t) => {
  const { app } = await fixture(t);
  const js = await app.inject("/assets/app-abcdefgh.js");
  assert.equal(js.statusCode, 200);
  assert.match(String(js.headers["content-type"]), /javascript/);
  assert.match(String(js.headers["cache-control"]), /immutable/);
  assert.match(String(js.headers["cache-control"]), /max-age=31536000/);
  const art = await app.inject("/art/map.svg");
  assert.equal(art.statusCode, 200);
  assert.match(String(art.headers["content-type"]), /image\/svg\+xml/);
  assert.doesNotMatch(String(art.headers["cache-control"]), /immutable/);
  assert.equal((await app.inject("/favicon.svg")).statusCode, 200);
});

test("API/auth/health routes and JSON failures never become the SPA or static artifacts", async (t) => {
  const { app, root, service } = await fixture(t);
  for (const segment of ["api", "auth", "health"]) {
    await mkdir(join(root, segment));
    await writeFile(
      join(root, segment, "hidden.json"),
      '{"shouldNotServe":true}',
    );
  }
  assert.deepEqual((await app.inject("/health")).json(), { status: "ok" });
  assert.equal((await app.inject("/api/me")).statusCode, 401);
  assert.equal((await app.inject("/auth/twitch")).statusCode, 503);
  const world = await service.createWorld("owner");
  assert.equal(
    (await app.inject(`/api/worlds/${world.worldId}`)).json().worldId,
    world.worldId,
  );
  for (const url of [
    "/api/missing",
    "/auth/missing",
    "/health/missing",
    "/api/hidden.json",
    "/auth/hidden.json",
    "/health/hidden.json",
    "/API/hidden.json",
  ]) {
    const response = await app.inject({
      url,
      headers: { accept: "text/html" },
    });
    assert.equal(response.statusCode, 404, url);
    assert.equal(response.json().error.code, "not_found");
  }
  const post = await app.inject({
    method: "POST",
    url: "/studio/world-example",
    payload: {},
  });
  assert.equal(post.statusCode, 404);
});

test("missing assets, unrelated paths and explicit JSON requests receive ordinary 404 responses", async (t) => {
  const { app } = await fixture(t);
  for (const url of [
    "/assets/missing.js",
    "/art/missing.jpg",
    "/unrelated",
    "/studio/world/nested",
    "/world",
    "/overlay",
    "/assets/",
  ]) {
    const response = await app.inject({
      url,
      headers: { accept: "text/html" },
    });
    assert.equal(response.statusCode, 404, url);
    assert.equal(response.json().error.code, "not_found");
  }
  assert.equal(
    (
      await app.inject({
        url: "/studio/world",
        headers: { accept: "application/json" },
      })
    ).statusCode,
    404,
  );
});

test("dotfiles, encoded traversal and escaping symlinks cannot expose files", async (t) => {
  const { app } = await fixture(t);
  for (const url of [
    "/.env",
    "/assets/../.env",
    "/assets/%2e%2e/outside.txt",
    "/%252e%252e/outside.txt",
    "/assets/%5c..%5coutside.txt",
    "/assets/%00outside.txt",
    "/assets/outside.txt",
  ]) {
    const response = await app.inject(url);
    assert.ok(response.statusCode >= 400, `${url}: ${response.statusCode}`);
    assert.doesNotMatch(response.body, /PRIVATE=must-not-be-served/);
  }
});

test("missing frontend build or an explicitly disabled frontend leaves a usable backend", async (t) => {
  const { service, temporary } = await fixture(t);
  for (const webDist of [join(temporary, "not-built"), false] as const) {
    const app = createApp({ service, webDist });
    t.after(() => app.close());
    assert.equal((await app.inject("/health")).statusCode, 200);
    const response = await app.inject("/studio");
    assert.equal(response.statusCode, 404);
    assert.equal(response.json().error.code, "not_found");
  }
});
