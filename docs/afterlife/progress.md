**Backend checkpoint — 30 October 2026, 13:59 IST**

Branch `feat/backend-foundation`, PR https://github.com/AbhishekSharma55/Afterlife/pull/1 remains open; do not merge. Fetched origin before editing and again before checkpointing; main through f44a021 is included, with no newer main changes. The initial working tree was clean. No frontend application changes.

**Current steering and status**

The user chose rehearsal for now; live Twitch/OpenAI credentials are intentionally not configured. Do not solicit them again or repeatedly spend runs on those checks. Independent backend implementation and the pending durable rehearsal are finished. Full backend acceptance remains incomplete because the real Twitch pilot and public deployment have not run. Do not write `.afterlife/COMPLETE` yet.

At this checkpoint `.afterlife/WAITING_FOR_INPUT` holds the runner for the remaining external acceptance. The user can remove that marker when the deployment, live-provider checks, or teammate integration are ready. Keep `.afterlife/STOP` authoritative and retain the existing scheduler; do not install additional jobs.

**Implemented backend**

Persistent world engine and causal history; faction memberships and one-effective-vote rules; atomic idempotency; resource crises, foraging, symmetric aid, reparations, fortification and peace talks; bounded offline progression and deferred-choice revalidation; exact recorded contribution recall and historical affiliation; grounded/fallback episode recaps and persisted leader reactions; owner-authenticated HTTP/SSE; browser-bound OAuth; opt-in rehearsal chat with reserved synthetic identities and live-world injection protection; reactive/proactive token refresh; reconnect presence reconciliation; shared DTO/Zod schemas and eight deterministic fixtures.

Persistence uses one locked PostgreSQL JSONB aggregate per world. Provider tokens and creator sessions remain memory-only: restarting requires re-sign-in, while canonical world facts/history persist. Startup clears stale connection status. Generated prose is interpretation guarded by IDs/prompts; canonical facts and recorded credits remain authoritative.

This run fixed EventSub sockets stranded without a welcome, failed connection migration recovery, and stale subscription completion after stop/replacement. Startup validates configuration before allocating database resources, closes resources on failed migration/read/app creation/listen, and waits for an active worker before closing the pool. Nine new injected tests cover these lifecycle paths.

**Completed verification**

- `TEST_DATABASE_URL=... npm test`: shared **5/5**, backend **56/56**, **61 total**, no skips, with real disposable PostgreSQL.
- `npm run typecheck`, Docker's workspace builds, and all eight deterministic fixture drift checks passed. `git diff --check` passed.
- New `npm run smoke:rehearsal` builds and launches a real backend process against an empty disposable database. Two synthetic viewers joined and chose betrayal over HTTP; duplicate input did not add vote weight; the episode ended; an actual 60-second background tick prepared Blue's retaliation. SIGTERM stopped the backend; a new process loaded the same facts and history, rejected the old session, and preserved episode-two causal recall plus both recorded contribution credits. Repeated reads/commands added no duplicate tick or result.
- The complete smoke passed once on host Node and again inside the rebuilt Node 24 production image as its unprivileged user. The default image command separately served `/health` with durable PostgreSQL and rehearsal disabled. The smoke also refused a populated world store without changing its records. CI now includes the real HTTP/restart rehearsal.
- The earlier checkpoint validated Compose configuration. No public hosting or live-provider claim is made. Only this run's disposable containers, volumes, network and image tag were removed; unrelated Docker resources were preserved.

The smoke uses `TEST_DATABASE_URL`, refuses a nonempty `afterlife_worlds` table, receives no Twitch/OpenAI credentials, and removes only its own rehearsal world. See [deployment.md](deployment.md) for reproducible commands and isolation requirements.

**Remaining external acceptance, in order when ready**

1. Select/configure the public always-running host and durable PostgreSQL; deploy, verify HTTPS/SSE, and repeat restart/redeploy persistence on that host. Local container verification does not establish public hosting.
2. Verify Twitch OAuth and two distinct real accounts joining/voting, including replacement, disconnect/pause/resume, presence reconciliation and token lifecycle. Injected tests and synthetic participants do not establish live Twitch participation.
3. Verify an accepted scene and recap with the configured OpenAI model and observe latency. Missing keys currently exercise persisted factual fallbacks; no live model response is claimed.
4. Integrate the teammate's frontend, run the creator/viewer pilot and OBS readability check, and record the two-episode story. Do not implement or overwrite `apps/web`.

These are externally dependent acceptance steps, not unfinished independent backend behavior identified in this review. Preserve this distinction when deciding whether to resume or mark completion.

**Scheduler and quota**

The existing cron runner launches independent checkpoint-based sessions and checks quota every ten minutes. Its launch/authentication probe was verified at 08:49 IST. This run inherited the cron parent's shared flock and refreshed the parent-active heartbeat. Latest allowance check: 13% current-window usage, 31% weekly. Controls and logs remain local/ignored; never print or commit `check_usage.js`, credentials, or runner config/logs. Stop initiating tasks at 85% window usage or 95% weekly usage; the submission deadline remains November 2 at 22:00 UTC (November 3 at 03:30 IST).
