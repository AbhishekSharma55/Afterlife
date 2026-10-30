**AFTERLIFE frontend fixtures**

These snapshots are generated through the backend domain service and validated by `@afterlife/shared`. All are labeled `rehearsal: true`. They use a fixed clock and stable opaque IDs, so the same source state generates the same JSON.

| File                     | UI state to build                                                  |
| ------------------------ | ------------------------------------------------------------------ |
| `fresh.json`             | A newly created world, with no episode or scene                    |
| `prepared.json`          | Episode one, a dilemma ready to open                               |
| `voting.json`            | An open round with two distinct viewer votes                       |
| `disconnected.json`      | The same round paused by a connection interruption                 |
| `resolved-betrayal.json` | The community breaks the treaty; trust drops and Westbridge closes |
| `resting.json`           | Episode one has ended and the world is resting                     |
| `while-away.json`        | A single six-hour development advances Blue's preparations         |
| `returning.json`         | Episode two presents a consequence linked to the saved betrayal    |

These are alternative snapshots from one story, not independent worlds. Shared IDs link the episode-one betrayal to episode-two cause references. Event pagination may be needed for older referenced history in a real running world.

From the repository root:

```sh
npm run fixtures
npm run fixtures:check
```

Consume each file as a public `WorldSnapshot` and validate it with `worldSnapshotSchema`. The generator never calls Twitch or OpenAI and does not create real participation evidence. Test vote logic against the backend and real Twitch integration separately.

The current frontend fixture flow covers the betrayal/retaliation storyline. Resource-crisis and further narrative variants are covered by domain tests and may be added here as the product evolves.
