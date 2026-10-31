# AFTERLIFE

**The stream ends. The world remembers.**

AFTERLIFE is a persistent kingdom story for Twitch. Viewers join factions and vote on decisions. The world records their choices, develops between episodes, and brings earlier alliances, betrayals, and unfinished conflicts into future streams.

**Status:** persistent backend, rehearsal workflow, shared frontend schemas/fixtures, story continuity, and deployment packaging are implemented on the backend feature branch. Frontend implementation remains with the frontend teammate. Live-provider acceptance is deferred by request.

**Team ownership**

| Role | Owner | Responsibilities |
| --- | --- | --- |
| Person A — frontend | Frontend teammate | World interface, creator console, map, voting display, recaps, OBS scene, visual QA, and demo presentation |
| Person B — backend | Backend teammate | Database, world engine, Twitch integration, persistent history, AI narration, offline updates, shared schemas, and deployment |

The approximate technical-responsibility split is 40% frontend/presentation and 60% backend/AI/integration.

**Start here**

- [Project plan and phase checkpoints](docs/afterlife/project-plan.md)
- [Frontend/backend integration contract](docs/afterlife/integration-contract.md)

The first milestone is a kingdom that survives a backend restart. The defining demonstration is a decision in episode one causing a remembered consequence in episode two.

The implementation uses TypeScript, a Node/Fastify backend, PostgreSQL, Twitch EventSub, and the OpenAI Responses API. React/Vite is the planned frontend.

**Backend development**

Requires Node 24+. Run `npm ci`, then `npm run typecheck` and `npm test`. `npm run build` builds the server. For local rehearsal without provider credentials or a database, run `DATABASE_URL= ALLOW_REHEARSAL=true npm run dev`. The empty database URL overrides any value in `.env` and explicitly uses temporary in-memory storage. Production requires PostgreSQL through `DATABASE_URL`.

Copy `.env.example` to `.env` for server configuration; root `npm run dev` and `npm start` load it. Never commit keys. Configure `PUBLIC_ORIGIN` to match the frontend origin and proxy `/api` and `/auth` through the frontend dev server for cookie authentication.

Local rehearsal: `POST /auth/rehearsal`, retain its session cookie, then `POST /api/worlds` with `{}`. The response supplies the world ID. Start an episode with `POST /api/worlds/:id/episodes/start` and a unique `requestId`. Public state is available at `GET /api/worlds/:id`; SSE at `GET /api/worlds/:id/stream`. This repository currently serves backend routes only; `/studio` is reserved for the teammate's frontend.

Set `TEST_DATABASE_URL` to a disposable PostgreSQL database to include the persistence/concurrency test. Without it that one test is explicitly skipped. CI supplies PostgreSQL automatically.

Run `TEST_DATABASE_URL=... npm run smoke:rehearsal` against a dedicated disposable database for the full backend rehearsal. It builds and starts a real backend process, submits two synthetic viewers' betrayal votes over HTTP, waits for an actual 60-second background development, restarts the process, and checks episode-two history and recall. Allow roughly 75–90 seconds. It uses no Twitch/OpenAI credentials and does not establish live-provider acceptance. See the [deployment guide](docs/afterlife/deployment.md) for isolation requirements and remaining verification.

See [backend progress and remaining work](docs/afterlife/progress.md) and [autonomous runner controls](docs/afterlife/autonomous-runs.md).

**Repository contents**

- `docs/afterlife/`: current AFTERLIFE plan and shared interface proposal.
- `codex/`: participant-provided hackathon overview, rules, and resources.
- `research/`: earlier competition research and a dated event-data snapshot. The Raid Parcel recommendation in this folder is historical; AFTERLIFE is the selected project.

Official dates and requirements should be rechecked on the [hackathon website](https://twitchcon-codex.devpost.com/) before submission.

Frontend consumers can import `worldSnapshotSchema` and public DTO types from `@afterlife/shared`. See [eight generated rehearsal snapshots](docs/afterlife/fixtures/README.md); run `npm run fixtures:check` to verify fixture consistency. Owner-only synthetic chat is available at `POST /api/worlds/:id/rehearsal/chat` only with explicit rehearsal enabled; the contract lists its payload.

[Deployment guide](docs/afterlife/deployment.md) describes the backend-only container and persistent PostgreSQL setup.
