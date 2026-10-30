**Autonomous backend runs**

The user authorized backend implementation, subagent delegation, usage checks, scheduled continuation, and feature-branch PRs. The frontend remains owned by the frontend teammate. Changes are reviewed through PRs; the runner does not merge them.

`python3 scripts/install-scheduler.py` installs one labeled user cron entry. Cron wakes the shell each minute; a local timestamp limits quota checks to once every ten minutes. A fresh parent-session heartbeat defers background work while the interactive session is working. `flock` serializes scheduled runs; active interactive work holds the same lock. Scheduled work starts an independent Codex session with the installed ChatGPT authentication and reads the repository checkpoint. It does not reopen the app's existing thread, which retains an active writer even between turns.

Verified on October 30 at 08:49 IST: the installed cron entry launched an authenticated read-only probe, returned `CRON_AUTH_READY`, and exited with status zero. This proves the launch/authentication path; backend work in future runs is verified through its own tests and commits.

The local `check_usage.js` is ignored because it contains credentials. `node scripts/check-usage.mjs` executes that checker while printing only allowance, used percentages, and reset time. Failed or unrecognized responses prevent a new run. The runner reserves the last 15% of the current window and the last 5% of weekly allowance for checkpointing. It checks real allowance rather than assuming a reset at a particular clock hour.

Local controls in the ignored `.afterlife/` directory:

- `touch .afterlife/STOP`: prevent subsequent scheduled runs.
- `.afterlife/COMPLETE`: backend acceptance work is complete.
- `.afterlife/WAITING_FOR_INPUT`: all independent work finished and external input is needed; inspect progress before removing it.
- `runner.log`: scheduling decisions.
- `session.log`: private Codex run output; never commit it.
- `parent-active`: interactive-session heartbeat; expires after fifteen minutes without updates.

The scheduler stops starting work at the submission deadline. Each launched run is bounded to 45 minutes and instructed to save progress, tests, commits and PR links in `docs/afterlife/progress.md`. It cannot guarantee continuation if this machine sleeps, cron stops, authentication expires, or provider access changes. Actual scheduled executions are recorded in the local log.

To uninstall, remove the crontab line tagged `# afterlife-backend-autonomy`, preserving unrelated jobs. Stop markers prevent future launches; an already-running agent must also be stopped if immediate interruption is required.
