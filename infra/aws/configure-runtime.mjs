import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { parseEnv } from "node:util";
const state = JSON.parse(readFileSync(".afterlife/aws/resources.json"));
if (!state.origin) throw new Error("Public HTTPS URL is not ready.");
const env = parseEnv(readFileSync(".env", "utf8"));
const secret = JSON.parse(
  execFileSync(
    "aws",
    [
      "secretsmanager",
      "get-secret-value",
      "--secret-id",
      state.secretArn,
      "--region",
      state.region,
      "--query",
      "SecretString",
      "--output",
      "text",
    ],
    { encoding: "utf8" },
  ),
);
secret.env = {
  NODE_ENV: "production",
  HOST: "0.0.0.0",
  PORT: "4310",
  WEB_DIST: "/app/apps/web/dist",
  DATABASE_URL: `postgresql://afterlife:${secret.dbPassword}@postgres:5432/afterlife`,
  PUBLIC_ORIGIN: state.origin,
  TWITCH_REDIRECT_URI: state.origin + "/auth/twitch/callback",
  ALLOW_REHEARSAL: "false",
  OFFLINE_INTERVAL_MS: "21600000",
};
for (const key of [
  "TWITCH_CLIENT_ID",
  "TWITCH_CLIENT_SECRET",
  "AI_PROVIDER",
  "AI_MODEL",
  "OPENAI_MODEL",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
])
  if (env[key]) secret.env[key] = env[key];
if (!secret.env.TWITCH_CLIENT_ID || !secret.env.TWITCH_CLIENT_SECRET)
  throw new Error("Twitch configuration missing.");
const provider = secret.env.AI_PROVIDER || "openai";
if (provider !== "openai" && provider !== "openrouter")
  throw new Error("Unknown AI provider.");
const request = {
  SecretId: state.secretArn,
  SecretString: JSON.stringify(secret),
};
writeFileSync(".afterlife/aws/secret-update.json", JSON.stringify(request), {
  mode: 0o600,
});
try {
  execFileSync(
    "aws",
    [
      "secretsmanager",
      "put-secret-value",
      "--cli-input-json",
      "file://.afterlife/aws/secret-update.json",
      "--region",
      state.region,
    ],
    { stdio: "ignore" },
  );
} finally {
  unlinkSync(".afterlife/aws/secret-update.json");
}
const script = `#!/bin/bash\nset -euo pipefail\numask 077\ncd /srv/afterlife\naws s3 cp s3://${state.bucket}/deploy/deployment.tar.gz deployment.tar.gz --region ${state.region} --only-show-errors\ntar -xzf deployment.tar.gz\naws secretsmanager get-secret-value --secret-id ${state.secretArn} --region ${state.region} --query SecretString --output text > runtime.json\npython3 configure.py\ndocker compose config --quiet\ndocker compose up -d postgres\npg=$(docker compose ps -q postgres)\nready=0\nfor i in $(seq 1 60); do if [ "$(docker inspect -f '{{.State.Health.Status}}' "$pg")" = healthy ]; then ready=1; break; fi; sleep 2; done\n[ "$ready" = 1 ] || { echo 'Database readiness failed'; exit 1; }\nif [ ! -f migration.done ]; then\n existing=$(docker exec "$pg" psql -U afterlife -d afterlife -qAt -c "SELECT to_regclass('public.afterlife_worlds')")\n if [ -n "$existing" ]; then echo 'Refusing to overwrite an existing database without a migration marker'; exit 1; fi\n aws s3 cp s3://${state.bucket}/migration/worlds.sql migration.sql --region ${state.region} --only-show-errors\n if ! docker exec -i "$pg" psql -U afterlife -d afterlife --set ON_ERROR_STOP=1 --quiet < migration.sql > migration.log 2>&1; then echo 'Database import failed; inspect private migration.log'; exit 1; fi\n touch migration.done\n rm migration.sql\nfi\ndocker compose up -d\nready=0\nfor i in $(seq 1 60); do if docker compose exec -T backend node -e "fetch('http://127.0.0.1:4310/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then ready=1; break; fi; sleep 2; done\n[ "$ready" = 1 ] || { echo 'Application readiness failed'; exit 1; }\nchmod 700 backup.sh\ncat > /etc/systemd/system/afterlife-backup.service <<'UNIT'\n[Unit]\nDescription=AFTERLIFE PostgreSQL backup to private S3\n[Service]\nType=oneshot\nExecStart=/srv/afterlife/backup.sh\nUNIT\ncat > /etc/systemd/system/afterlife-backup.timer <<'UNIT'\n[Unit]\nDescription=Daily AFTERLIFE database backup\n[Timer]\nOnCalendar=*-*-* 03:17:00 UTC\nRandomizedDelaySec=600\nPersistent=true\n[Install]\nWantedBy=timers.target\nUNIT\nsystemctl daemon-reload\nsystemctl enable --now afterlife-backup.timer\n./backup.sh\ndocker compose ps\ndocker exec "$pg" psql -U afterlife -d afterlife -qAt -c 'SELECT count(*) AS saved_worlds FROM afterlife_worlds'\necho 'Deployment healthy; world import and initial encrypted backup complete.'\n`;
writeFileSync(".afterlife/aws/remote-deploy.sh", script, { mode: 0o600 });
console.log(
  "Provider and Twitch environment stored privately; public callback " +
    state.origin +
    "/auth/twitch/callback",
);
