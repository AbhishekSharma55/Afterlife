**Frontend/backend integration review — October 31, 2026**

The frontend provides a strong basis for the demo: a creator studio with one prominent next action, distinct public viewer and OBS surfaces, consistent kingdom styling, and visible causal links from episode two to the original betrayal. It consumes shared schemas, keeps fixture/rehearsal labels visible, and follows backend snapshots through SSE. The normal two-episode rehearsal works in Chromium against the real server.

The user requested that frontend bugs remain for a dedicated agent. This integration changes no application code under `apps/web`. The observations below are review targets, not a completed bug audit or a claim of production readiness.

**Integration completed**

- Fastify serves the compiled frontend, assets, and supported browser deep links on the API/auth/SSE origin. Missing assets and unknown API/auth routes retain JSON errors. The frontend shell is not cached; fingerprinted assets receive immutable caching. Backend-only operation remains possible without a frontend build.
- Docker builds and packages all three workspaces, including frontend art/fonts and labeled preview fixtures. Compose runs the combined application beside durable PostgreSQL.
- Root build/typecheck/test commands and CI now include the frontend. Playwright exercises the connected app in Chromium; CI installs the browser and retains failure artifacts.

**Obvious gaps for the dedicated bug agent**

| Priority | Observation and evidence | Verification to add |
| --- | --- | --- |
| High | `apps/web/src/lib/useCommand.ts:31` retains a request ID only for status 0, discarding it on HTTP 5xx. A failed response can follow a committed mutation: backend episode-start and scene-prepare routes await additional hooks after committing. A retry with a new key could execute as a different action. This is a code-inspection risk; the normal rehearsal did not reproduce a duplicate mutation. | Commit a creator command, fail its HTTP response, retry from the browser, and assert the same logical action/ID and no duplicate state change. Include snapshot reconciliation after an uncertain outcome. |
| Medium | `apps/web/src/lib/useWorld.ts:224` loads history without a route/world generation guard. The history reducer action also lacks a world ID, so an old request completing after navigation can merge prior-world events or mark the new world's history exhausted. | Delay world A's history response, navigate to B, resolve A, and assert B's history, cause references, and pagination remain correct. Repeat fixture/live navigation. |
| Review | Mobile viewer at 390px has no document-wide horizontal overflow and stacks the main cards successfully, but the fixture navigation needs a usability pass. Desktop success notifications can temporarily cover the map after several rapid commands. | Check touch targets, keyboard navigation/focus, contrast, narrow studio controls, fixture navigation, and notification overlap. These are visual observations, not independently confirmed accessibility violations. |
| Review | `npm audit --json` currently reports 8 affected dependency entries: 6 moderate and 2 critical, including development-only Vitest/tinypool, React Router, and the new static plugin's glob/minimatch chain. Counts can change as advisories update and include transitive/metavulnerability entries. | Review actual affected paths, production versus development exposure, and compatible upgrades. Do not infer that every advisory is reachable in this CSR app or run a forced major upgrade without validation. |

**Verification and limits**

`npm run build`, `npm run typecheck`, all eight fixture drift checks, and the existing workspace tests pass. Six new backend tests cover browser deep links, MIME/cache behavior, missing assets, API/auth separation, traversal/symlink protection, and backend-only startup. Current exact totals are in [progress.md](progress.md).

The connected Playwright scenario creates a rehearsal world in the studio, starts episode one, joins two synthetic viewers, votes for betrayal, observes the live tally on a separate viewer page, observes the result on a separate OBS page, ends the episode, waits for background progression, starts episode two, and verifies the grievance/cause after reloading the viewer. A separate 390px fixture scenario checks direct navigation and document width. The OBS page is captured at its documented 1920×1080 size. Generated screenshots are local under `test-results/`; failure artifacts are uploaded by CI.

Docker verification additionally exercised compiled JS/CSS, fonts/art, browser deep links, JSON API/auth failures, non-root runtime, and PostgreSQL state/cause after a container restart. The isolated test stack was removed afterward.

The browser rehearsal uses in-memory storage, synthetic viewers, a shortened offline interval, and factual narration. PostgreSQL restart behavior is verified separately. Real OBS compositing/readability over gameplay, an external HTTPS/SSE deployment, real Twitch voting, and live OpenAI narration remain unverified. The user explicitly chose rehearsal for now; do not request credentials again unless that choice changes.
