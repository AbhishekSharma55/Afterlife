# AFTERLIFE

**The stream ends. The world remembers.**

AFTERLIFE is a persistent kingdom story for Twitch. Viewers join factions and vote on decisions. The world records their choices, develops between episodes, and brings earlier alliances, betrayals, and unfinished conflicts into future streams.

**Status:** planning complete; application implementation has not started.

**Team ownership**

| Role | Owner | Responsibilities |
| --- | --- | --- |
| Person A — frontend | Frontend teammate | World interface, creator console, map, voting display, recaps, OBS scene, visual QA, and demo presentation |
| Person B — backend | Project owner working with Codex | Database, world engine, Twitch integration, persistent history, AI narration, offline updates, shared schemas, and deployment |

The approximate technical-responsibility split is 40% frontend/presentation and 60% backend/AI/integration.

**Start here**

- [Project plan and phase checkpoints](docs/afterlife/project-plan.md)
- [Frontend/backend integration contract](docs/afterlife/integration-contract.md)

The first milestone is a kingdom that survives a backend restart. The defining demonstration is a decision in episode one causing a remembered consequence in episode two.

The proposed implementation uses TypeScript, React/Vite, a Node backend, PostgreSQL, Twitch EventSub, and the OpenAI Responses API. Setup commands will be added with the implementation.

**Repository contents**

- `docs/afterlife/`: current AFTERLIFE plan and shared interface proposal.
- `codex/`: participant-provided hackathon overview, rules, and resources.
- `research/`: earlier competition research and a dated event-data snapshot. The Raid Parcel recommendation in this folder is historical; AFTERLIFE is the selected project.

Official dates and requirements should be rechecked on the [hackathon website](https://twitchcon-codex.devpost.com/) before submission.
