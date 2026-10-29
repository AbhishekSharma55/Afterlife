#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"
mkdir -p .afterlife
exec 9>.afterlife/runner.lock
flock -n 9 || exit 0
[[ -f .afterlife/runner.env ]] || exit 0
source .afterlife/runner.env
export PATH="$(dirname "$AFTERLIFE_NODE"):/usr/local/bin:/usr/bin:/bin:$PATH"
for marker in STOP COMPLETE WAITING_FOR_INPUT; do
  [[ ! -e ".afterlife/$marker" ]] || exit 0
done
now=$(date +%s)
[[ $now -lt 1793656800 ]] || exit 0
if [[ -f .afterlife/parent-active ]]; then
  modified=$(stat -c %Y .afterlife/parent-active)
  [[ $((now-modified)) -ge 900 ]] || exit 0
fi
last=$(cat .afterlife/last-attempt 2>/dev/null || echo 0)
[[ $((now-last)) -ge 600 ]] || exit 0
echo "$now" > .afterlife/last-attempt
if ! "$AFTERLIFE_NODE" scripts/check-usage.mjs > .afterlife/usage.json 2>.afterlife/usage-error.log; then
  echo "$(date -Is) usage unavailable; waiting" >> .afterlife/runner.log
  exit 0
fi
if ! "$AFTERLIFE_NODE" --input-type=module -e '
import fs from "node:fs";
const u=JSON.parse(fs.readFileSync(".afterlife/usage.json","utf8"));
process.exit(u.allowed && Number.isFinite(u.usedPercent) && u.usedPercent < 85 && Number.isFinite(u.weeklyUsedPercent) && u.weeklyUsedPercent < 95 ? 0 : 1);
'; then
  echo "$(date -Is) quota reserve reached; waiting" >> .afterlife/runner.log
  exit 0
fi
echo "$(date -Is) resuming backend session" >> .afterlife/runner.log
status=0
timeout --signal=TERM --kill-after=60s 45m "$AFTERLIFE_CODEX" -a never -s danger-full-access exec --color never resume "$AFTERLIFE_THREAD" - < scripts/autonomous-prompt.md >> .afterlife/session.log 2>&1 || status=$?
echo "$(date -Is) session exited: $status" >> .afterlife/runner.log
