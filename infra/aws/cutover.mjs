import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { parseEnv } from "node:util";
import { setTimeout } from "node:timers/promises";
import { Pool } from "pg";
if (!process.argv.includes("--cutover"))
  throw new Error(
    "Pass --cutover only when ready to stop the local backend and migrate.",
  );
const statePath = ".afterlife/aws/resources.json";
const state = JSON.parse(readFileSync(statePath));
if (!state.origin) throw new Error("Provision the public URL before cutover.");
if (state.migrationUploaded) {
  console.log(
    "Initial migration already captured; refusing to overwrite it with local state.",
  );
  process.exit(0);
}
const env = parseEnv(readFileSync(".env", "utf8"));
const db = new URL(env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(db.hostname))
  throw new Error(
    "This cutover helper expects the existing local PostgreSQL source.",
  );
const pid = Number(readFileSync(".afterlife/local-app.pid", "utf8").trim());
if (
  !readFileSync(`/proc/${pid}/cmdline`, "utf8").includes(
    "apps/server/dist/server.js",
  )
)
  throw new Error("Local PID is not the expected project backend.");
process.kill(pid, "SIGTERM");
let stopped = false;
for (let i = 0; i < 40; i++) {
  try {
    await fetch("http://localhost:4310/health", {
      signal: AbortSignal.timeout(500),
    });
  } catch {
    stopped = true;
    break;
  }
  await setTimeout(200);
}
if (!stopped)
  throw new Error(
    "Local backend shutdown still in progress; no migration performed.",
  );
const pool = new Pool({ connectionString: env.DATABASE_URL });
let rows;
try {
  rows = (
    await pool.query("SELECT id,document FROM afterlife_worlds ORDER BY id")
  ).rows;
} finally {
  await pool.end();
}
const dump = execFileSync(
  "docker",
  [
    "exec",
    "afterlife-local-postgres",
    "pg_dump",
    "-U",
    decodeURIComponent(db.username),
    "-d",
    decodeURIComponent(db.pathname.slice(1)),
    "--no-owner",
    "--no-privileges",
    "--table=public.afterlife_worlds",
  ],
  { maxBuffer: 128 * 1024 * 1024 },
);
mkdirSync(".afterlife/backups", { recursive: true, mode: 0o700 });
const backup =
  ".afterlife/backups/pre-aws-" +
  new Date().toISOString().replace(/[:.]/g, "-") +
  ".sql";
writeFileSync(backup, dump, { mode: 0o600 });
writeFileSync(".afterlife/aws/worlds.sql", dump, { mode: 0o600 });
execFileSync("aws", [
  "s3",
  "cp",
  ".afterlife/aws/worlds.sql",
  `s3://${state.bucket}/migration/worlds.sql`,
  "--region",
  state.region,
  "--sse",
  "AES256",
  "--only-show-errors",
]);
const summary = rows.map(({ id, document: w }) => ({
  worldId: id,
  episode: w.snapshot.episode?.number,
  events: w.events.length,
  memberships: Object.keys(w.memberships).length,
  votes: Object.values(w.votes).reduce((n, v) => n + v.length, 0),
  trust: w.snapshot.relationship.trust,
  grievance: w.snapshot.relationship.grievance,
  bridge: w.snapshot.locations.find((l) => l.id === "westbridge")?.status,
}));
writeFileSync(
  ".afterlife/aws/migration-summary.json",
  JSON.stringify(summary, null, 2),
  { mode: 0o600 },
);
state.worldIds = rows.map((r) => r.id);
state.localStopped = true;
state.migrationUploaded = true;
state.migrationCapturedAt = new Date().toISOString();
state.localBackup = backup;
writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
console.log(
  "Local backend stopped for cutover; " +
    rows.length +
    " world(s) exported, backed up locally, and uploaded privately.",
);
