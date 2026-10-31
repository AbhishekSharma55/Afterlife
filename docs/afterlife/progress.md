**Full application checkpoint — October 31, 2026**

Backend PR [#1](https://github.com/AbhishekSharma55/Afterlife/pull/1) and frontend PR [#2](https://github.com/AbhishekSharma55/Afterlife/pull/2) were merged in the requested order. Local main was refreshed to `20d806f`. Current work is on `feat/fullstack-integration`; do not merge its PR without a new explicit instruction. Origin was fetched before checkpointing and main has not advanced.

**Current user steering**

Connect the teammate's frontend to the backend and assess the rendered implementation. The user explicitly said to leave bug finding/fixes for a dedicated agent. No frontend application files under `apps/web` were changed in this integration. See [frontend-integration-review.md](frontend-integration-review.md) for observations and handoff targets.

The user chose rehearsal for now; live Twitch/OpenAI credentials are intentionally not configured. Do not solicit them again or repeatedly spend runs on those checks. Do not claim public deployment, real Twitch voting, live narration, or full hackathon acceptance.

**Integration completed**

The backend now serves the built React application, assets, and exact studio/world/overlay deep links from the API/auth/SSE origin. Unknown API/auth routes and missing assets remain JSON errors. The frontend shell is not cached; fingerprinted assets receive immutable caching. Backend-only startup remains available when no frontend build exists.

The Docker image builds and packages shared schemas, backend, and frontend, including local fonts/art and labeled fixture previews, then runs as an unprivileged user. Compose uses the same application service alongside persistent PostgreSQL. Root build/typecheck/test scripts and GitHub Actions include the frontend. Playwright now covers the connected two-episode flow, viewer/OBS updates, direct navigation, and a narrow viewer screen. README/deployment instructions describe running the combined app.

**Current verification**

- `npm run build`, `npm run typecheck`, all eight deterministic fixture drift checks, and `git diff --check` passed.
- `npm test` with fresh disposable PostgreSQL 17: shared **5/5**, backend **62/62**, frontend **41/41**; **108 passed, zero failures/skips**. Six new backend tests cover static routes, caching/MIME, JSON errors, traversal/symlink protection, and missing-build startup.
- Chromium Playwright: **2/2 passed**. The studio creates a rehearsal kingdom; two synthetic viewers join and vote for betrayal; a separate viewer page receives the tally through SSE; a separate OBS page shows the outcome; episode one ends; background progression prepares retaliation; episode two and the reloaded viewer preserve the grievance and original cause. The OBS viewport is 1920×1080. The 390px fixture viewer passes direct navigation and document-width checks. Browser success does not establish complete accessibility or OBS broadcast acceptance.
- The full application Docker image built successfully. An isolated Compose/PostgreSQL stack served HTML, compiled JS/CSS, fonts, art, and all supported SPA deep links while preserving JSON API/auth errors. A stored synthetic betrayal and its cause survived application-container restart. Runtime UID was 1000. Test containers/network/database storage were removed afterward.
- The previous October 30 backend rehearsal also verified a real 60-second offline worker tick and process restart through HTTP on host and inside the production container. That backend CI passed at commit `fe5ff13`; current integration CI status should be read from its own PR/checks.

Generated screenshots and test logs are local/ignored. Run `npm run test:e2e` to regenerate the browser evidence. See the [deployment guide](deployment.md) for container and durable rehearsal commands.

**Frontend review handoff**

The normal connected rehearsal works and the creator/viewer/OBS presentation is coherent. Code inspection identified uncertain command retries losing request IDs after HTTP 5xx and delayed history responses lacking a world-navigation guard. Visual review identified notification overlap and mobile fixture navigation for usability checks. The current dependency audit reports advisories requiring exposure/upgrade triage. These were documented, not fixed. A dedicated frontend bug agent should reproduce and address them with focused regression coverage.

**Implemented backend and limits**

Persistent world engine and causal history; faction membership and one-effective-vote rules; atomic idempotency; resource crises, foraging, symmetric aid, reparations, fortification and peace talks; bounded offline progression and deferred-choice revalidation; recorded contribution recall and historical affiliation; grounded/fallback episode recaps and persisted leader reactions; owner-authenticated HTTP/SSE; browser-bound OAuth; opt-in rehearsal chat with reserved synthetic identities and live-world injection protection; reactive/proactive token refresh; reconnect presence reconciliation; shared DTO/Zod schemas and eight deterministic fixtures.

Persistence uses one locked PostgreSQL JSONB aggregate per world. Provider tokens and creator sessions remain memory-only: restarting requires re-sign-in, while canonical world facts/history persist. Startup clears stale connection status. Generated prose is interpretation guarded by IDs/prompts; canonical facts and recorded credits remain authoritative.

**Remaining acceptance**

1. Dedicated frontend bug review and fixes, then a creator/viewer pilot and actual OBS compositor/readability check over stream content.
2. Select/configure an always-running public host and durable PostgreSQL; verify HTTPS/SSE and restart/redeploy persistence on that host.
3. When the user changes the rehearsal-only choice, verify Twitch OAuth with two real accounts, vote replacement, disconnect/pause/resume, presence reconciliation, and token lifecycle.
4. When live narration is enabled, verify one accepted scene and recap with the configured provider and observe latency. No live model response is claimed.
5. Record the two-episode demo and complete submission materials/official acceptance checks.

**Scheduler and quota**

The existing cron runner checks quota every ten minutes and reads this checkpoint. Preserve `.afterlife/STOP`; do not install duplicate or recursive jobs. Its shared flock is held during foreground work. At this checkpoint `.afterlife/WAITING_FOR_INPUT` remains in place because the next work is the separately requested dedicated frontend review or external acceptance, not permission to modify the teammate's UI autonomously. Do not remove this hold or write `.afterlife/COMPLETE` merely because integration tests pass. A new user task can resume authorized work.

Check quota only with `node scripts/check-usage.mjs`; never print or commit `check_usage.js`, credentials, or runner logs/config. Stop initiating tasks at 85% window usage or 95% weekly usage. The submission deadline remains November 2 at 22:00 UTC (November 3 at 03:30 IST).
