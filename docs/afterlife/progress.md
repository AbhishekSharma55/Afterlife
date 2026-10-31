**Full application checkpoint — October 31, 2026**

Backend PRs #1, frontend #2, and integration #3 are merged. Main was refreshed to `0c6fee1` before the current review. The user explicitly requested the combined bug list be pushed directly to main. No application fixes are part of this checkpoint.

**Current user steering**

The user subsequently requested OpenRouter support with `deepseek/deepseek-v4-flash`, an environment-based provider/model switch, and a direct push to main. Both narration and recaps now use `AI_PROVIDER` / `AI_MODEL` with separate provider keys. The ignored local `.env` selects OpenRouter and preserves existing keys; the user will supply `OPENROUTER_API_KEY`. No authenticated provider calls were made. Provider-switch verification passed: typecheck/build, 111 workspace tests with one PostgreSQL test skipped because TEST_DATABASE_URL was unset, and both browser scenarios. Four new tests exercise provider/key/model selection, both scene/recap endpoints, and fallback behavior; startup also rejects invalid provider configuration before pool allocation. See [AI provider setup](ai-providers.md). The eight audited bugs remain open and outside this change.

Two dedicated agents reviewed frontend and backend on main. The [combined bug list](bug-list.md) records **eight reproduced P2 findings: five frontend and three backend**, their source references, concrete reproduction steps, evidence limits, and suggested fix directions. Findings are open; no frontend/backend application code was modified. The earlier [frontend-only review](frontend-bug-review.md) remains as historical detail.

The user offered to configure Twitch/OpenAI credentials for live testing; an ignored local `.env` template was prepared. Credential values were not inspected during this audit, and no provider calls were made. Do not assume credentials are configured or claim real Twitch participation, live narration, public deployment, or complete hackathon acceptance. Any local test should isolate its environment rather than silently load `.env`.

Integration application commit `afdc4e8` passed [full CI](https://github.com/AbhishekSharma55/Afterlife/actions/runs/41208948149), including browser and restart rehearsals. Its application source matches reviewed main `0c6fee1`; this review adds documentation only.

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

The normal connected rehearsal works and the creator/viewer/OBS presentation is coherent. Code inspection identified uncertain command retries losing request IDs after HTTP 5xx and delayed history responses lacking a world-navigation guard. Visual review identified notification overlap and mobile fixture navigation for usability checks. The current dependency audit reports advisories requiring exposure/upgrade triage. These were documented, not fixed. The dedicated frontend agent subsequently reproduced the five findings; see the combined bug list for the current frontend/backend handoff.

**Implemented backend and limits**

Persistent world engine and causal history; faction membership and one-effective-vote rules; atomic idempotency; resource crises, foraging, symmetric aid, reparations, fortification and peace talks; bounded offline progression and deferred-choice revalidation; recorded contribution recall and historical affiliation; grounded/fallback episode recaps and persisted leader reactions; owner-authenticated HTTP/SSE; browser-bound OAuth; opt-in rehearsal chat with reserved synthetic identities and live-world injection protection; reactive/proactive token refresh; reconnect presence reconciliation; shared DTO/Zod schemas and eight deterministic fixtures.

Persistence uses one locked PostgreSQL JSONB aggregate per world. Provider tokens and creator sessions remain memory-only: restarting requires re-sign-in, while canonical world facts/history persist. Startup clears stale connection status. Generated prose is interpretation guarded by IDs/prompts; canonical facts and recorded credits remain authoritative.

**Remaining acceptance**

1. Address the eight findings in the combined bug list with regression coverage, then run a creator/viewer pilot and actual OBS compositor/readability check over stream content.
2. Select/configure an always-running public host and durable PostgreSQL; verify HTTPS/SSE and restart/redeploy persistence on that host.
3. When local credentials are ready for a separate live test, verify Twitch OAuth with two real accounts, vote replacement, disconnect/pause/resume, presence reconciliation, and token lifecycle.
4. When live narration is enabled, verify one accepted scene and recap with the configured provider and observe latency. No live model response is claimed.
5. Record the two-episode demo and complete submission materials/official acceptance checks.

**Scheduler and quota**

The existing cron runner checks quota every ten minutes and reads this checkpoint. Preserve `.afterlife/STOP`; do not install duplicate or recursive jobs. Its shared flock is held during foreground work. At this checkpoint `.afterlife/WAITING_FOR_INPUT` remains in place because this task authorizes review/reporting; applying the listed fixes and external acceptance are separate next steps. Do not remove this hold or write `.afterlife/COMPLETE` merely because integration tests pass. A new user task can resume authorized work.

Check quota only with `node scripts/check-usage.mjs`; never print or commit `check_usage.js`, credentials, or runner logs/config. Stop initiating tasks at 85% window usage or 95% weekly usage. The submission deadline remains November 2 at 22:00 UTC (November 3 at 03:30 IST).
