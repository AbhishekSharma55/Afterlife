**AFTERLIFE — frontend/backend integration contract, draft v1**

Prepared on 30 October 2026 to let two people build in parallel. This is a proposed interface to agree during Phase 0, not an implemented API. **Person A is the frontend teammate. Person B is the project owner working with Codex on the backend.** Person B owns server behavior and shared schemas; Person A owns fixture-driven UI and reports needed changes before altering the interface.

Read with [project-plan.md](project-plan.md). Freeze the first usable payload shape before substantial UI work.

**Repository boundaries**

```text
apps/web/                 Person A: console, world page, OBS scene
apps/server/              Person B: HTTP API, Twitch, engine, narrator, worker
packages/shared/          Shared types and runtime schemas; Person B maintains
docs/afterlife/           Plan, contract, verification notes
```

The server owns all canonical world state and all vote resolution. The UI displays snapshots, sends authorized creator commands, and animates differences. Runtime credentials stay on the server.

**Routes and surfaces**

| Surface | Purpose |
| --- | --- |
| `/studio/:worldId` | Authenticated creator controls and connection/setup status |
| `/world/:worldId` | Read-only spectator page with current scene and event chronicle |
| `/overlay/:worldId` | Read-only OBS layout with concise scene text, choices, and world changes |

Public payloads contain game state, counts, and intentionally displayed credits. They exclude tokens, raw chat, credentials, and private creator controls. A public URL never authorizes mutations. World IDs and round IDs are opaque strings.

**Snapshot example**

The example below represents an open episode-two decision after a persisted betrayal. Names, limits, and initial stats are proposed fixture values. The final runtime schema should use explicit enums and required fields; nullable values are stated deliberately.

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

Person A builds six fixtures from this schema: fresh, voting, resolved betrayal, resting, returning, and disconnected. Fixtures are rehearsal inputs and do not masquerade as real Twitch activity.

**HTTP interface**

All state-changing creator requests require an authenticated session tied to the world's broadcaster. Use a request ID for idempotent retries. Check world, episode, and round ownership/state on the server.

| Method and path | Contract |
| --- | --- |
| `GET /auth/twitch` | Start broadcaster authorization |
| `GET /auth/twitch/callback` | Validate OAuth state, establish session, return to studio |
| `POST /auth/logout` | End creator session |
| `GET /api/me` | Current creator identity and owned world IDs; no provider tokens |
| `POST /api/worlds` | Create or return the creator's channel world |
| `GET /api/worlds/:id` | Current public snapshot |
| `GET /api/worlds/:id/history?before=<sequence>` | Ordered events and next cursor |
| `GET /api/worlds/:id/stream` | Server-sent snapshot events |
| `POST /api/worlds/:id/episodes/start` | Catch up due resting ticks, start the next episode, prepare recap |
| `POST /api/worlds/:id/episodes/:episodeId/end` | Persist episode closure and enter resting mode |
| `POST /api/worlds/:id/scenes/prepare` | Prepare one eligible dilemma; may return 202 while narration completes |
| `POST /api/worlds/:id/rounds/:roundId/open` | Open a prepared round and establish its server deadline |
| `POST /api/worlds/:id/rounds/:roundId/close` | Freeze votes and resolve once; a retry returns the same result |

Use small bodies such as `{ "requestId": "unique-action-id" }`; round opening may also specify an allowed duration. Return a snapshot on completed mutations, or `{ "status": "pending" }` when a prepared narrative is still being produced.

Return 401 for no creator session, 403 for the wrong world owner, 409 for incompatible current state, and 422 for invalid input. Error shape: `{ "error": { "code": "...", "message": "..." } }`.

There is no public HTTP vote endpoint in live mode. Live votes enter through authenticated Twitch event data. A development adapter can supply rehearsal input only to clearly separated rehearsal worlds.

**Realtime**

Emit `world.snapshot` events containing the latest public snapshot, including the updated revision. That event covers tally, scene, connection, and world changes. Prefer complete snapshots for the first version; use small update messages later only if needed.

A reconnect reloads `GET /api/worlds/:id` and resumes listening. Persisted server state wins over UI state. Briefly batch tally publications if necessary; acceptance of a vote remains immediate on the backend. A polling read may temporarily support frontend integration, but the integrated demo should show timely updates.

**Voting**

- `!join red` and `!join blue` persist membership using Twitch user ID, with the latest display name stored for presentation.
- Require membership before a counted vote. Membership switches apply between rounds; reject switches during an open round.
- `!vote 1|2|3` maps to the pinned choice order of the current open round.
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

| Action | Canonical effect |
| --- | --- |
| Honor the treaty | Move 5 supplies from Red to Blue; trust +10 |
| Break the treaty | Move 10 supplies from Blue to Red; trust -60; close Westbridge; create a Blue grievance caused by this event |
| Hold position | Record the outcome without changing faction facts |
| Resting development after betrayal | Once per eligible tick, advance the grievance's preparation stage and apply bounded morale changes |
| Offer reparations | Transfer an allowed amount; improve trust; explicitly update grievance status according to the action definition |
| Fortify / open talks | Apply bounded, predefined changes and retain or update the grievance as specified |

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

The AI may choose only an eligible encounter ID and label only the action IDs the engine supplied. Validate the schema, IDs, length, and references. Use a smaller recap schema containing `previously`, `whileAway`, and `referencedEventIds` for recap requests. Check the most important continuity claims against scenario expectations; schema adherence alone does not establish truthful history.

Apply completed narration to the matching episode/scene and source event only. Late responses cannot rewrite a newer scene. Make bounded requests per scene/recap, keep output short, and use a configured model with verified Structured Outputs support. Keep model choice configurable; no specific account access or price is assumed.

Persist accepted wording. On timeout, refusal, invalid response, or failed continuity check, use factual fallback narration for that committed event. Retrying narration must never reapply its world effects. [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)

**Resting ticks**

The server worker, not the frontend, advances a resting world. Use unique keys derived from world ID, resting-period ID, and tick index. Default interval: six hours; default maximum: three ticks per resting period.

The episode-start transaction must finish eligible catch-up and switch the world out of resting mode before accepting new live decisions. A worker competing with that transaction must not apply a fourth tick or a tick after the episode has begun.

Rehearsal can run the same operation with a controlled clock and visible rehearsal flag. Store scheduled and actual processing times. A network disconnection alone does not prove a Twitch stream ended; confirm presence before treating a missing notification as an offline transition.

**First integration exercise**

By the end of Oct 30, Person A's page should consume Person B's real persisted snapshot and show a development choice changing trust and the event chronicle. By Oct 31, repeat the change through genuine Twitch chat. By Nov 1 morning, repeat it across a backend restart and a new episode with a recorded resting-world consequence.

