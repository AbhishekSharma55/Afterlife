**Dedicated frontend bug review — October 31, 2026**

A dedicated agent reviewed application commit `afdc4e8` without changing frontend code. Five actionable findings were reproduced; all are P2 (medium). This is a focused functional review, not an exhaustive accessibility or production acceptance audit.

| Finding | Trigger and observed behavior | Evidence and suggested direction |
| --- | --- | --- |
| Old-world history contaminates the newly selected world | Start loading world A's older history, navigate to B, then complete A's response. A's events enter B's history and can mark B's pagination exhausted. | Hook reproduction confirms `world-b` contains a `world-a` event and `hasOlderHistory=false`. Guard history success/failure by world/request generation and check identity in reducer actions. Source: `apps/web/src/lib/useWorld.ts:233`, history reducer at line 89. |
| Expired session leaves creator controls enabled without offering reauthentication | Load an authenticated studio, remove/expire the session cookie, then start an episode. An error toast asks the user to sign in again, but no sign-in link appears and Start remains enabled. | Reproduced in Chromium against the actual rehearsal server. Invalidate/refresh the cached session on command 401 and show the sign-in gate. Reload or explicitly signing out currently recovers. Sources: `apps/web/src/lib/useSession.ts:29`, `apps/web/src/lib/useCommand.ts:31`, studio gate `apps/web/src/pages/Studio.tsx:552`. |
| Chronicle hides history navigation when recent events contain only episode boundaries | After 12 empty episodes, the latest 20 records are episode starts/ends. The viewer says “Nothing has happened yet” and displays neither Show all events nor Load older history, although older founding records exist. | Reproduced in Chromium against the actual backend and in a component test. Keep navigation/filter controls available when the current filtered list is empty. Source: early return in `apps/web/src/components/Chronicle.tsx:53`. |
| Studio memory links fail to reveal causes outside the five visible entries | Select a known cause older than the five-entry recent list. Selection changes but the target remains outside the rendered slice; nothing is revealed or scrolled into view. | Component reproduction with six story events confirms the selected target is absent from the DOM. Reveal the selected entry, show details, or open the full chronicle. Sources: `apps/web/src/components/Chronicle.tsx:44`, usage in `apps/web/src/pages/Studio.tsx:695`. |
| HTTP 5xx retries discard the logical action's idempotency key | Retry the same command after HTTP 500. The hook generates a different request ID on the next attempt, although a failed response can follow a committed mutation and a failing post-commit hook. | Hook reproduction confirms different IDs. Preserve IDs for uncertain outcomes and reconcile state. A duplicate canonical mutation was **not** reproduced; backend lifecycle guards prevent some duplicates. Source: `apps/web/src/lib/useCommand.ts:34`. |

**Local reproduction evidence**

The agent used ignored scripts rather than adding tests that assert broken behavior to the application's passing suite:

- `.afterlife/frontend-review.test.tsx`: four hook/component reproductions. Run `npx vitest run --config .afterlife/frontend-review.config.ts`. Passing assertions demonstrate the defects, not their resolution.
- `.afterlife/frontend-session-review.mjs` and `.afterlife/review-session-expired.png`: real-server session recovery reproduction.
- `.afterlife/frontend-history-review.mjs` and `.afterlife/review-empty-chronicle.png`: real-server hidden-history reproduction.

Evidence scripts/screenshots are local and ignored, not portable CI regression tests. The temporary server on port 44410 was stopped. Fixes should add focused regression coverage asserting the corrected behavior.

The connected normal-flow rehearsal and existing tests remain green. Those checks do not cover these recovery/navigation cases. Mobile navigation, notification overlap, and dependency advisories recorded in the [integration review](frontend-integration-review.md) remain triage items; they were not promoted into additional confirmed defects here. Actual OBS compositing, live Twitch/OpenAI behavior, and comprehensive accessibility checks remain unverified.

No fixes were applied. The review report is documentation only.
