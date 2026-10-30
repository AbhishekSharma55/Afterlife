**AFTERLIFE — frontend/backend integration contract, v1**

Updated on 30 October 2026 to let two people build in parallel. The backend API and shared schemas are implemented; the frontend routes below remain the frontend teammate's implementation work. Live provider validation remains a separate acceptance check. **Person A is the frontend teammate. Person B is the project owner working with Codex on the backend.** Person B owns server behavior and shared schemas; Person A owns fixture-driven UI and reports needed changes before altering the interface.

Read with [project-plan.md](project-plan.md). Public runtime schemas and TypeScript types are exported by `@afterlife/shared`; contract version `1.0.0`. Coordinate changes to these schemas before changing either side of the interface.

**Repository boundaries**

```text
apps/web/                 Person A: console, world page, OBS scene
apps/server/              Person B: HTTP API, Twitch, engine, narrator, worker
packages/shared/          Shared types and runtime schemas; Person B maintains
docs/afterlife/           Plan, contract, verification notes
```

The server owns all canonical world state and all vote resolution. The UI displays snapshots, sends authorized creator commands, and animates differences. Runtime credentials stay on the server.

**Routes and surfaces**

| Surface             | Purpose                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `/studio/:worldId`  | Authenticated creator controls and connection/setup status               |
| `/world/:worldId`   | Read-only spectator page with current scene and event chronicle          |
| `/overlay/:worldId` | Read-only OBS layout with concise scene text, choices, and world changes |

Public payloads contain game state, counts, and intentionally displayed credits. They exclude tokens, raw chat, credentials, and private creator controls. A public URL never authorizes mutations. World IDs and round IDs are opaque strings.

**Snapshot example**

The example below represents an open episode-two decision after a persisted betrayal. Names, limits, and initial stats are proposed fixture values. The shared runtime schema uses explicit enums and required fields; nullable values are stated deliberately.

```json
{
  "worldId": "world_demo",
  "revision": 17,
  "name": "Westbridge",
  "mode": "active",
  "episode": {
    "id": "episode_2",
    "number": 2,
    "status": "active"
  },
  "factions": [
    { "id": "red", "name": "Red Kingdom", "supplies": 60, "morale": 60 },
    { "id": "blue", "name": "Blue Kingdom", "supplies": 40, "morale": 55 }
  ],
  "relationship": {
    "trust": -20,
    "grievance": "The Westbridge treaty was broken.",
    "causeEventId": "event_betrayal"
  },
  "locations": [
    { "id": "red_keep", "name": "Red Keep", "status": "stable" },
    { "id": "blue_keep", "name": "Blue Keep", "status": "preparing" },
    { "id": "westbridge", "name": "Westbridge", "status": "closed" },
    { "id": "forest", "name": "Whispering Wood", "status": "stable" }
  ],
  "scene": {
    "id": "scene_reckoning",
    "title": "Blue demands an answer",
    "narration": "Blue's envoy returns to the bridge where the treaty was broken.",
    "causeEventIds": ["event_betrayal", "event_preparations"],
    "choices": [
      { "id": "pay_reparations", "number": 1, "label": "Offer reparations" },
      { "id": "fortify_bridge", "number": 2, "label": "Fortify the bridge" },
      { "id": "open_talks", "number": 3, "label": "Open peace talks" }
    ],
    "round": {
      "id": "round_2",
      "status": "open",
      "openedAt": "2026-11-01T10:00:00Z",
      "closesAt": "2026-11-01T10:00:45Z",
      "tally": { "pay_reparations": 2, "fortify_bridge": 3, "open_talks": 1 },
      "totalVoters": 6,
      "winningChoiceId": null,
      "outcome": null
    }
  },
  "recap": {
    "previously": "The community broke its treaty with Blue.",
    "whileAway": "Blue used the quiet hours to prepare a response.",
    "causeEventIds": ["event_betrayal", "event_preparations"]
  },
  "recentEvents": [
    {
      "id": "event_preparations",
      "sequence": 3,
      "episodeNumber": null,
      "kind": "offline_development",
      "summary": "Blue prepares retaliation.",
      "causeEventIds": ["event_betrayal"],
      "effectiveAt": "2026-11-01T09:00:00Z",
      "processedAt": "2026-11-01T09:00:01Z"
    }
  ],
  "narratorStatus": "idle",
  "twitch": { "connection": "connected", "broadcast": "live" },
  "rehearsal": false
}
```

Rules:

- `revision` increases whenever the published view changes. Ignore older snapshots and reload the latest state after reconnecting.
- `mode` is `ready | active | resting`. This game lifecycle is distinct from Twitch broadcast presence.
- `episode` and `scene` can be null for a fresh world.
- `round.status` is `prepared | open | paused | resolved | deferred`; timestamps are nullable until applicable.
- `outcome` is null or `choice_selected | tied | no_votes`.
- `narratorStatus` is `idle | working | fallback`.
- `twitch.connection` is `disconnected | connecting | connected | reconnecting | unauthorized`; `broadcast` is `live | offline | unknown`.
- Stats are bounded integers: supplies/morale 0–100, trust -100–100.
- All times use UTC ISO 8601. Use the server deadline for vote eligibility.
- A compact event list is included in the snapshot; the history endpoint provides older events.

Eight generated fixtures are available in [fixtures/](fixtures/README.md): fresh, prepared, voting, disconnected, resolved betrayal, resting, while away, and returning. They are produced through the real domain service using a fixed clock and normalized opaque IDs. All are explicitly marked `rehearsal: true`; they are sample data for frontend development and do not represent real Twitch activity. Run `npm run fixtures` to regenerate and `npm run fixtures:check` to detect drift.

**Shared imports and optional metadata**

```ts
import {
  SNAPSHOT_EVENT,
  worldSnapshotSchema,
  type WorldSnapshot,
} from "@afterlife/shared";

// Use the same parser for fetched JSON and world.snapshot event data.
const snapshot: WorldSnapshot = worldSnapshotSchema.parse(receivedJson);
```

Run `npm install` at the repository root and build `@afterlife/shared` before starting a frontend development server. Root build/typecheck/test commands build the shared workspace first. The package exports browser-compatible ESM and declaration files; it contains no server code or credentials.

`Scene` may include `encounterId` (`treaty`, `resource_crisis`, or `retaliation`) and `leaderReactions: [{ factionId, text }]`. `recap` may include `generationStatus` (`generated` or `fallback`) and up to three `contributionCredits: [{ displayName, factionId, choiceId, sourceEventId, summary }]`. These fields are optional for compatibility with already stored worlds. Display accurate credits when provided; do not infer a viewer's previous vote from their current faction.

The exported request schemas are `createWorldCommandSchema`, `creatorCommandSchema`, and `openRoundCommandSchema`, plus `rehearsalChatCommandSchema` for the opt-in practice route. `historyPageSchema` validates paginated history; `apiErrorSchema` validates errors. Opaque IDs need not be UUIDs. Import types rather than duplicating interfaces in the frontend.

**HTTP interface**

All state-changing creator requests require an authenticated session tied to the world's broadcaster. Use a request ID for idempotent retries. Check world, episode, and round ownership/state on the server.

| Method and path                                 | Contract                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `GET /auth/twitch`                              | Start broadcaster authorization                                                 |
| `GET /auth/twitch/callback`                     | Validate OAuth state, establish session, return to studio                       |
| `POST /auth/logout`                             | End creator session                                                             |
| `GET /api/me`                                   | Current creator identity and owned world IDs; no provider tokens                |
| `POST /api/worlds`                              | Create or return the creator's channel world                                    |
| `GET /api/worlds/:id`                           | Current public snapshot                                                         |
| `GET /api/worlds/:id/history?before=<sequence>` | Ordered events and next cursor                                                  |
| `GET /api/worlds/:id/stream`                    | Server-sent snapshot events                                                     |
| `POST /api/worlds/:id/episodes/start`           | Catch up due resting ticks, start the next episode, prepare recap               |
| `POST /api/worlds/:id/episodes/:episodeId/end`  | Persist episode closure and enter resting mode                                  |
| `POST /api/worlds/:id/scenes/prepare`           | Prepare one eligible dilemma; may return 202 while narration completes          |
| `POST /api/worlds/:id/rounds/:roundId/open`     | Open a prepared round and establish its server deadline                         |
| `POST /api/worlds/:id/rounds/:roundId/close`    | Freeze votes and resolve once; a retry returns the same result                  |
| `POST /api/worlds/:id/rounds/:roundId/resume`   | Explicitly resume a paused round after chat reconnects                          |
| `POST /api/worlds/:id/rehearsal/chat`           | Opt-in, owner-authenticated synthetic join/vote input for rehearsal worlds only |

Use small bodies such as `{ "requestId": "unique-action-id" }`; round opening may also specify `durationSeconds`, an integer from 10 to 300 (default 45). Return a snapshot on completed mutations, or `{ "status": "pending" }` when a prepared narrative is still being produced.

Mutations use same-origin, HTTP-only session cookies. In frontend development, proxy `/api` and `/auth` to the backend and set `PUBLIC_ORIGIN` to the browser-facing frontend origin. Do not send owner IDs or provider tokens from the frontend.

Return 401 for no creator session, 403 for the wrong world owner, 409 for incompatible current state, and 422 for invalid input. Error shape: `{ "error": { "code": "...", "message": "..." } }`.

There is no public HTTP vote endpoint in live mode. Live votes enter through authenticated Twitch event data. A development adapter can supply rehearsal input only to clearly separated rehearsal worlds.

**Practice participation without provider credentials**

With `ALLOW_REHEARSAL=true`, a creator can send a bounded practice command to `POST /api/worlds/:id/rehearsal/chat`. It requires the normal creator session, checks ownership, and rejects every world with `rehearsal: false`. The route is absent when rehearsal is disabled. Local rehearsal sign-in remains available through `POST /auth/rehearsal` on localhost.

```json
{ "requestId": "practice-join-red-1", "viewer": "red", "text": "!join red" }
```

Use `viewer: "red"` or `"blue"` to select one of two fixed synthetic participants; display names are always `Rehearsal Red` and `Rehearsal Blue`. After joining and opening a round, send a fresh request ID with `text: "!vote 1"`, `"!vote 2"`, or `"!vote 3"`. A later valid vote from the same synthetic participant replaces its previous choice. Retries with the same request ID are deduplicated. The server supplies the timestamp, synthetic identity, and message ID. Arbitrary user IDs, display names, extra body fields, and free-form text are rejected.

Validate this request with `rehearsalChatCommandSchema`. Every response remains marked `rehearsal: true`. Keep a visible rehearsal label; these inputs never constitute real Twitch participation evidence. Live worlds accept viewer commands only from Twitch.

**Realtime**

Emit `world.snapshot` events containing the latest public snapshot, including the updated revision. That event covers tally, scene, connection, and world changes. Prefer complete snapshots for the first version; use small update messages later only if needed.

A reconnect reloads `GET /api/worlds/:id` and resumes listening. Persisted server state wins over UI state. Briefly batch tally publications if necessary; acceptance of a vote remains immediate on the backend. A polling read may temporarily support frontend integration, but the integrated demo should show timely updates.

**Voting**

- `!join red` and `!join blue` persist membership using Twitch user ID, with the latest display name stored for presentation.
- Require membership before a counted vote. Membership switches apply between rounds; reject switches during an open round.
- `!vote 1|2|3` maps to the pinned choice order of the current open round. A scene has one to three eligible choices, with consecutive positions starting at 1. Impossible resource actions are omitted before opening; commands for an absent position are ignored. Tally keys exactly match the available choice IDs.
- One effective vote per Twitch account per round; a later valid vote replaces the earlier vote.
- Deduplicate Twitch message IDs. Do not trust a username supplied through a browser request.
- Count a vote only when it arrives before the server deadline and its Twitch timestamp falls within that round's open window. Old queued events cannot become votes for a later round.
- Ties and zero votes produce “The council holds its position.” Record that outcome without changing faction facts.
- Freeze the tally, choose the result, apply effects, and append the canonical event in one transaction.
- A repeated close request or provider notification cannot apply the result twice.
- If connectivity is lost, pause acceptance and the round. When the creator resumes, preserve counted votes and the remaining duration; reject messages from the paused interval.
- If an episode ends during an open round, mark that round deferred and keep its history. Present the same dilemma in the next episode with a new round ID and fresh voting. Never silently turn it into a winning choice.

**World rules and memory proof**

Use a small action registry owned by the backend. Proposed demonstration seed: each faction starts with 50 supplies and 60 morale; trust starts at 40; Westbridge is open; a treaty exists in the initial world history.

| Action                             | Canonical effect                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Honor the treaty                   | Move 5 supplies from Red to Blue; trust +10                                                                      |
| Break the treaty                   | Move 10 supplies from Blue to Red; trust -60; close Westbridge; create a Blue grievance caused by this event     |
| Hold position                      | Record the outcome without changing faction facts                                                                |
| Resting development after betrayal | Once per eligible tick, advance the grievance's preparation stage and apply bounded morale changes               |
| Offer reparations                  | Transfer an allowed amount; improve trust; explicitly update grievance status according to the action definition |
| Fortify / open talks               | Apply bounded, predefined changes and retain or update the grievance as specified                                |

For the sample snapshot, one betrayal yields Red 60 supplies, Blue 40, and trust -20; a recorded resting tick accounts for Blue's morale changing to 55.

These are initial game-design values to tune in Phase 0. All actions validate their preconditions, resource availability, and entity references before committing. Keep effects deterministic even when narration varies.

Store `worlds`, `episodes`, `rounds`, `votes`, `memberships`, and `world_events`. An event records a unique idempotency key, sequence, factual effect, actor/source, and prior cause IDs. Preserve the final vote and faction-at-vote for each participant. This lets later episodes recall an actual contribution even if that viewer changes factions. Give the narrator only the few relevant participant records; display credits only for viewers who joined the game. Update the current snapshot and event log transactionally. An AI summary never overwrites canonical events.

**Narrator boundary**

Input: current faction/location facts; chosen action or eligible encounter families; recent and unresolved cause events; a fixed roster of entity IDs; a small set of relevant, recorded participant contributions when appropriate.

Structured response:

```text
sceneTitle
narration
leaderReactions[{ factionId, text }]
referencedEventIds[]
eligibleEncounterId
choiceLabels[{ actionId, label }]
```

The AI may choose only an eligible encounter ID and label only the one to three action IDs the engine supplied. Validate the schema, IDs, length, and references. Use a smaller recap schema containing `previously`, `whileAway`, and `referencedEventIds` for recap requests. Check the most important continuity claims against scenario expectations; schema adherence alone does not establish truthful history.

Apply completed narration to the matching episode/scene and source event only. Late responses cannot rewrite a newer scene. Make bounded requests per scene/recap, keep output short, and use a configured model with verified Structured Outputs support. Keep model choice configurable; no specific account access or price is assumed.

Persist accepted wording. On timeout, refusal, invalid response, or failed continuity check, use factual fallback narration for that committed event. Retrying narration must never reapply its world effects. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)

**Resting ticks**

The server worker, not the frontend, advances a resting world. Use unique keys derived from world ID, resting-period ID, and tick index. Default interval: six hours; default maximum: three ticks per resting period.

The episode-start transaction must finish eligible catch-up and switch the world out of resting mode before accepting new live decisions. A worker competing with that transaction must not apply a fourth tick or a tick after the episode has begun.

Rehearsal can run the same operation with a controlled clock and visible rehearsal flag. Store scheduled and actual processing times. A network disconnection alone does not prove a Twitch stream ended; confirm presence before treating a missing notification as an offline transition.

**First integration exercise**

By the end of Oct 30, Person A's page should consume Person B's real persisted snapshot and show a development choice changing trust and the event chronicle. By Oct 31, repeat the change through genuine Twitch chat. By Nov 1 morning, repeat it across a backend restart and a new episode with a recorded resting-world consequence.
