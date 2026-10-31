# AFTERLIFE bug list

Reviewed October 31, 2026 against main commit `0c6fee1`, after integration PR #3 merged. Separate frontend and backend agents performed focused reviews and reproduced eight findings: five frontend and three backend, all P2. No application fixes were applied.

P1 means high impact; P2 means medium impact. All entries are open. Reproduction evidence establishes the behavior described, not every possible downstream consequence. Live Twitch/OpenAI calls and OBS compositing were outside this review.

## Status update — October 31, 2026 (branch `fix/frontend-bugs-and-ui`)

- FE-01 to FE-05 are fixed, each with a regression test in `apps/web/test/regressions.test.tsx`.
- New and fixed: **BE-04**. On Windows, the built frontend's `/assets/*` returned HTTP 403 because `relative()` produced backslash paths that `@fastify/static` rejects. The page rendered blank and both Playwright scenarios failed. `apps/server/src/http/static.ts` now converts the path to `/` separators. Both e2e scenarios pass on Windows.
- Known Windows-only test limitation: six `static.test.ts` cases fail with `EPERM` on `symlink` unless Developer Mode or admin rights are enabled. This is a test-setup issue, not an app defect; they pass on Linux CI.
- BE-01 fixed: each counted vote stores its chat timestamp. A delayed, strictly older `!vote` no longer replaces a newer one; equal timestamps keep delivery order.
- BE-02 fixed: paying reparations returns Blue Keep from `preparing` to `stable` in the same transaction.
- BE-03 fixed: `openRound` rejects a live (non-rehearsal) world whose chat is not connected, with `CHAT_DISCONNECTED`. Rehearsal worlds are unaffected. Existing tests that open rounds in live worlds now connect chat first.
- Regression tests for BE-01 to BE-03 are in `apps/server/test/domain.test.ts`. All eight audit findings are now fixed.

## Frontend

| ID | Priority | Issue | Source |
| --- | --- | --- | --- |
| FE-01 | P2 (fixed) | Old-world history contaminates the newly selected world | [useWorld.ts](../../apps/web/src/lib/useWorld.ts), history request at line 233 and reducer at line 89 |
| FE-02 | P2 (fixed) | Expired session leaves creator controls enabled without offering sign-in | [useSession.ts](../../apps/web/src/lib/useSession.ts):29; [useCommand.ts](../../apps/web/src/lib/useCommand.ts):31; [Studio.tsx](../../apps/web/src/pages/Studio.tsx):552 |
| FE-03 | P2 (fixed) | Empty story filter hides access to existing history | [Chronicle.tsx](../../apps/web/src/components/Chronicle.tsx):53 |
| FE-04 | P2 (fixed) | Studio memory links fail to reveal causes outside the recent list | [Chronicle.tsx](../../apps/web/src/components/Chronicle.tsx):44; [Studio.tsx](../../apps/web/src/pages/Studio.tsx):695 |
| FE-05 | P2 (fixed) | HTTP 5xx retries discard the logical action's idempotency key | [useCommand.ts](../../apps/web/src/lib/useCommand.ts):34 |

### FE-01 — History responses survive a world switch

**Reproduce:** Delay world A's older-history response. Navigate to world B before it completes, then release A's response with `nextCursor: null`.

**Observed:** A's events enter B's event map, and A's exhausted cursor disables B's pagination. The focused hook reproduction reported `CROSS_WORLD_HISTORY world-b world-a hasOlder false`.

**Expected/fix direction:** Ignore obsolete success, failure, and loading completions after a world/request-generation change. Include identity in history reducer actions so only B's history can update B.

### FE-02 — Session expiry does not update the studio's auth gate

**Reproduce:** Open an authenticated studio, expire/remove its session cookie, then click Start episode.

**Observed:** Chromium against the real rehearsal server shows “Your session has ended. Sign in again to control the kingdom,” but no sign-in link appears and Start remains enabled. Command 401 responses never invalidate the cached signed-in state.

**Expected/fix direction:** Refresh/invalidate the session on 401 and render the sign-in gate. Reloading or explicitly signing out currently recovers.

### FE-03 — Chronicle's empty state removes its own recovery controls

**Reproduce:** Start/end 12 episodes without decisions, so the latest 20 events contain only episode boundaries. Open the viewer Chronicle with older founding records still present.

**Observed:** The default story filter is empty. The component returns “Nothing has happened yet” before rendering either Show all events or Load older history. Confirmed with both a component reproduction and the real server in Chromium.

**Expected/fix direction:** Retain filter and pagination controls when the current filtered list is empty. Older stored history must remain accessible.

### FE-04 — Selecting an older remembered cause has no visible effect

**Reproduce:** In the studio, select a known cause older than its five visible recent story entries. A focused component reproduction uses six entries and selects the sixth.

**Observed:** `selectedId` changes, but the five-entry slice excludes the target. There is no selected DOM element to reveal or scroll to.

**Expected/fix direction:** Reveal the selected event, open its details, or navigate to the full chronicle. Add regression coverage for a selected cause outside the visible slice.

### FE-05 — A server error incorrectly ends retry identity

**Reproduce:** Have a creator command return HTTP 500, then retry the same logical command key.

**Observed:** The hook generates a different request ID for each attempt; confirmed by the focused hook reproduction. A server error can follow a committed mutation because episode-start and scene-prepare routes await additional hooks afterward.

**Expected/fix direction:** Preserve the ID for uncertain outcomes and reconcile the latest snapshot before another action. A duplicate canonical mutation was **not** reproduced: backend lifecycle guards prevent some duplicate attempts. The confirmed defect is loss of retry identity.

## Backend

| ID | Priority | Issue | Source |
| --- | --- | --- | --- |
| BE-01 | P2 (fixed) | A delayed older chat vote overwrites the viewer's newer choice | [world-service.ts](../../apps/server/src/domain/world-service.ts):510; stored vote shape in [types.ts](../../apps/server/src/domain/types.ts):12 |
| BE-02 | P2 (fixed) | Reparations resolve the grievance but leave Blue Keep preparing retaliation | [world-service.ts](../../apps/server/src/domain/world-service.ts):663 |
| BE-03 | P2 (fixed) | A disconnected live world can open and resolve a voting round | [world-service.ts](../../apps/server/src/domain/world-service.ts):448 |

### BE-01 — Replacement votes use delivery order instead of message order

**Reproduce:** Open a round and join a faction. Receive `!vote 2` timestamped T+2s, then receive a delayed `!vote 1` timestamped T+1s from the same user. Give each a distinct message ID and keep both timestamps inside the valid open window.

**Observed:** The effective tally becomes `{ honor_treaty: 1, break_treaty: 0, hold_position: 0 }`. The older choice replaces the newer one because stored votes have no ordering timestamp/key.

**Expected/fix direction:** Preserve the later valid user choice, consistent with the voting contract. Store ordering information with effective votes, reject older replacements, and define equal-timestamp ordering. This domain-service reproduction demonstrates vulnerability to reordered delivery; no live Twitch reordering was observed in this review. A changed effective vote can affect both the outcome and recorded contribution history.

### BE-02 — Grievance resolution does not reconcile retaliation preparation

**Reproduce:** Resolve a betrayal, end the episode, advance one offline tick so Blue prepares retaliation, start episode two, then vote for and resolve reparations.

**Observed:** Relationship state becomes `{ trust: 0, grievance: null, causeEventId: null }`, but Blue Keep remains `status: "preparing"`. The viewer/OBS derives the label “Preparing retaliation” from that state in `apps/web/src/lib/derive.ts:42`.

**Expected/fix direction:** Reconcile preparation when reparations resolve its sole cause. Update location state in the same canonical transaction and add regression coverage that includes the offline tick before reparations. The existing reparations test does not assert this sequence/location.

### BE-03 — Opening while disconnected bypasses round pause behavior

**Reproduce:** Prepare a round in a non-rehearsal world, set Twitch connection to disconnected, open the prepared round, advance beyond its deadline, then run due-round resolution.

**Observed:** With `rehearsal=false` and `connection=disconnected`, the round becomes `open`, then `resolved` with `reason: "no_votes"`. Disconnecting an already-open round pauses it, but opening after disconnection has no equivalent guard.

**Expected/fix direction:** Prevent a disconnected live world from consuming its voting window without participation, consistent with the connectivity/pause contract. Require connectivity before opening, or create an explicitly paused round until reconnection and creator resume. Preserve synthetic rehearsal behavior.

All three backend findings were reproduced through the actual domain service and memory repository using an injected clock:

```sh
node --import tsx .afterlife/backend-review.ts
```

The reproduction script is local/ignored. No Twitch/OpenAI calls, credentials, dependency changes, or database changes were involved.

## Evidence and review limits

The frontend agent revalidated all five findings on `0c6fee1`; its application source matches the previously reviewed `afdc4e8`. Four targeted hook/component reproductions and both real-server Chromium scenarios were rerun. These temporary checks assert defective behavior and are not passing regression coverage for a fix.

Local ignored evidence:

```sh
npx vitest run --config .afterlife/frontend-review.config.ts
node .afterlife/frontend-session-review.mjs
node .afterlife/frontend-history-review.mjs
```

Scripts/config/screenshots live under `.afterlife/` on the review machine and are not part of a fresh clone. The reproduction steps in this document are the portable handoff. See also the earlier [frontend review](frontend-bug-review.md).

Existing normal-flow checks passed on application commit `afdc4e8`: 108 workspace tests with PostgreSQL, two connected browser scenarios, build/typecheck, fixture drift, and the HTTP/restart rehearsal. Passing happy-path checks do not cover these cases.

Mobile fixture navigation, notification overlap, and dependency advisories remain separate triage items from the [integration review](frontend-integration-review.md); this review did not establish them as additional confirmed defects. Public hosting, real Twitch accounts/votes, live OpenAI output, actual OBS composition, and comprehensive accessibility testing remain acceptance work rather than confirmed bugs.

## Suggested fix order

Address BE-01 and BE-03 first because they affect decision integrity/participation, then FE-05 for uncertain-command recovery. Fix BE-02 with FE-03/FE-04 to make the remembered story and its causes consistent and accessible; FE-01 and FE-02 cover navigation/auth recovery. All remain open; this ordering is a proposed implementation sequence rather than a change in severity.

The backend agent did not rerun PostgreSQL tests or validate external services during this focused review. Fixes should add regression tests asserting corrected outcomes and rerun the appropriate existing checks.
