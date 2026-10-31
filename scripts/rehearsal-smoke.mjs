import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { historyPageSchema, worldSnapshotSchema } from "@afterlife/shared";

// Intentionally opt-in: this starts/restarts a real backend against an EMPTY,
// disposable database. It never uses .env or invokes Twitch/OpenAI.
process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const databaseUrl = process.env.TEST_DATABASE_URL;
assert.ok(
  databaseUrl,
  "Set TEST_DATABASE_URL to an empty disposable PostgreSQL database.",
);
const pool = new Pool({ connectionString: databaseUrl });
let child;
let worldId;
let cookie;
let origin;
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    interrupted = true;
  });
function checkStop() {
  assert.ok(
    !interrupted && !existsSync(".afterlife/STOP"),
    "Rehearsal stopped.",
  );
}
async function stopBackend() {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child?.kill("SIGKILL"), 10000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
}
async function startBackend() {
  checkStop();
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  origin = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["apps/server/dist/server.js"], {
    env: {
      PATH: process.env.PATH,
      DATABASE_URL: databaseUrl,
      HOST: "127.0.0.1",
      PORT: String(port),
      PUBLIC_ORIGIN: origin,
      ALLOW_REHEARSAL: "true",
      OFFLINE_INTERVAL_MS: "60000",
    },
    stdio: "ignore",
  });
  let spawnError = false;
  child.once("error", () => {
    spawnError = true;
  });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    checkStop();
    assert.ok(
      !spawnError && child.exitCode === null && child.signalCode === null,
      "Backend failed to start.",
    );
    try {
      const response = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {
      /* Retry until startup completes. */
    }
    await delay(100);
  }
  assert.fail("Backend health deadline exceeded.");
}
async function request(path, body) {
  checkStop();
  const response = await fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200, `Unexpected response for ${path}`);
  return response;
}
async function signIn() {
  const login = await request("/auth/rehearsal", {});
  cookie = login.headers.get("set-cookie").split(";")[0];
}
async function snapshot(path = "", body) {
  return worldSnapshotSchema.parse(
    await (await request(`/api/worlds/${worldId}${path}`, body)).json(),
  );
}
async function history() {
  return historyPageSchema.parse(
    await (await request(`/api/worlds/${worldId}/history`)).json(),
  ).events;
}

try {
  checkStop();
  const table = await pool.query(
    "SELECT to_regclass('afterlife_worlds') AS name",
  );
  if (table.rows[0].name) {
    const result = await pool.query(
      "SELECT count(*)::int AS count FROM afterlife_worlds",
    );
    assert.equal(
      result.rows[0].count,
      0,
      "Use an empty disposable database; existing worlds must be preserved.",
    );
  }
  await startBackend();
  await signIn();
  const world = worldSnapshotSchema.parse(
    await (await request("/api/worlds", { rehearsal: true })).json(),
  );
  worldId = world.worldId;
  assert.equal(world.rehearsal, true);
  const first = await snapshot("/episodes/start", {
    requestId: "smoke-start-1",
  });
  const prepared = await snapshot("/scenes/prepare", {
    requestId: "smoke-prepare-1",
  });
  const roundId = prepared.scene.round.id;
  await snapshot(`/rounds/${roundId}/open`, { requestId: "smoke-open-1" });
  for (const viewer of ["red", "blue"]) {
    await snapshot("/rehearsal/chat", {
      requestId: `smoke-join-${viewer}`,
      viewer,
      text: `!join ${viewer}`,
    });
    await snapshot("/rehearsal/chat", {
      requestId: `smoke-vote-${viewer}`,
      viewer,
      text: "!vote 2",
    });
  }
  const duplicate = await snapshot("/rehearsal/chat", {
    requestId: "smoke-vote-red",
    viewer: "red",
    text: "!vote 2",
  });
  assert.equal(duplicate.scene.round.totalVoters, 2);
  const resolved = await snapshot(`/rounds/${roundId}/close`, {
    requestId: "smoke-close-1",
  });
  assert.equal(resolved.relationship.trust, -20);
  assert.equal(resolved.scene.round.winningChoiceId, "break_treaty");
  assert.equal(resolved.scene.round.totalVoters, 2);
  const betrayal = (await history()).find(
    (event) => event.kind === "decision_resolved",
  );
  assert.ok(betrayal);
  await snapshot(`/episodes/${first.episode.id}/end`, {
    requestId: "smoke-end-1",
  });
  console.log(
    "Rehearsal betrayal persisted; waiting for the actual 60-second background tick.",
  );
  const deadline = Date.now() + 75000;
  let offline;
  while (Date.now() < deadline) {
    checkStop();
    offline = (await history()).find(
      (event) => event.kind === "offline_development",
    );
    if (offline) break;
    await delay(500);
  }
  assert.ok(offline, "No background tick arrived before the deadline.");
  assert.ok(offline.causeEventIds.includes(betrayal.id));
  const resting = await snapshot();
  assert.equal(resting.mode, "resting");
  assert.equal(
    resting.locations.find((location) => location.id === "blue_keep").status,
    "preparing",
  );
  await stopBackend();
  await startBackend();
  const expired = await fetch(`${origin}/api/me`, { headers: { cookie } });
  assert.equal(
    expired.status,
    401,
    "Restart must discard memory-only creator sessions.",
  );
  await signIn();
  const reloaded = await snapshot();
  assert.equal(reloaded.relationship.trust, -20);
  assert.deepEqual(reloaded.factions, resting.factions);
  assert.deepEqual(reloaded.recap, resting.recap);
  assert.equal(reloaded.twitch.connection, "disconnected");
  const second = await snapshot("/episodes/start", {
    requestId: "smoke-start-2",
  });
  assert.equal(second.episode.number, 2);
  assert.ok(second.recap.causeEventIds.includes(betrayal.id));
  assert.ok(second.recap.causeEventIds.includes(offline.id));
  assert.equal(second.recap.generationStatus, "fallback");
  assert.equal(second.recap.contributionCredits.length, 2);
  assert.ok(
    second.recap.contributionCredits.every(
      (credit) =>
        credit.choiceId === "break_treaty" &&
        credit.sourceEventId === betrayal.id,
    ),
  );
  const returning = await snapshot("/scenes/prepare", {
    requestId: "smoke-prepare-2",
  });
  assert.equal(returning.scene.encounterId, "retaliation");
  assert.ok(returning.scene.causeEventIds.includes(betrayal.id));
  const repeated = await snapshot("/scenes/prepare", {
    requestId: "smoke-prepare-2",
  });
  assert.deepEqual(
    repeated,
    returning,
    "Retry must retain narration and canonical facts.",
  );
  assert.deepEqual(
    await snapshot(),
    returning,
    "Reading the recap must not advance the world.",
  );
  const events = await history();
  assert.equal(
    events.filter((event) => event.kind === "offline_development").length,
    1,
  );
  assert.equal(
    events.filter((event) => event.kind === "decision_resolved").length,
    1,
  );
  console.log(
    "PASS: real HTTP, two synthetic viewers, background tick, process restart, durable episode-two causes and accurate recall.",
  );
} catch (error) {
  // Never echo a connection error or URL, which could contain a database secret.
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Rehearsal failed; check the disposable database and backend configuration.",
  );
  process.exitCode = 1;
} finally {
  try {
    await stopBackend();
    if (worldId)
      await pool.query(
        "DELETE FROM afterlife_worlds WHERE id=$1 AND owner_id=$2",
        [worldId, "rehearsal-owner"],
      );
  } catch {
    console.error("Could not clean up the disposable rehearsal world.");
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {
      process.exitCode = 1;
    });
  }
}
