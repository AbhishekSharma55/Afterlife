**AFTERLIFE backend container deployment**

This packages the backend and its shared schema workspace. It does not deploy a frontend or create any external hosting resources.

**Requirements**

Docker with BuildKit and Compose v2; a host that can run a continuously running Node service and PostgreSQL; outbound HTTPS/WebSocket access to Twitch and the selected OpenAI endpoint. The image builds from Node 24 and runs the application as the unprivileged `node` user. PostgreSQL 17 uses a named volume.

**Prepare local configuration**

1. Copy `.env.example` to `.env.compose.local`, which is ignored by Git.
2. Add `POSTGRES_PASSWORD` with your own generated secret. For example, `openssl rand -hex 32` produces a password without URI-reserved punctuation. Do not use a default or shared deployment password.
3. Set `DATABASE_URL=postgresql://afterlife:YOUR_PASSWORD@postgres:5432/afterlife`. The hostname is `postgres` inside Compose. If the password contains URI-reserved characters, percent-encode it in the URL; `POSTGRES_PASSWORD` remains the original unencoded value.
4. Set `PUBLIC_ORIGIN` and `TWITCH_REDIRECT_URI` to the exact origin/callback that the browser will use. For local testing, use `http://localhost:4310` and `http://localhost:4310/auth/twitch/callback`. Register that callback in the Twitch application.
5. Supply `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `OPENAI_API_KEY`, and `OPENAI_MODEL` as needed. A missing OpenAI configuration uses factual fallback narration; a missing Twitch configuration does not establish real Twitch integration.

Compose fails if the password or database URL is missing. It forces persistent database mode and disables the developer rehearsal login. For isolated in-memory rehearsal, use the documented local Node workflow instead.

For a published installation, keep `OFFLINE_INTERVAL_MS=21600000` (six hours). Persistent mode enforces a minimum of 60000 ms; the shorter interval is for explicitly labeled local rehearsal. The resting-period cap remains three updates.

Start with:

```sh
docker compose --env-file .env.compose.local config --quiet
docker compose --env-file .env.compose.local up --build -d
curl --fail http://localhost:4310/health
```

`BACKEND_PORT` and `POSTGRES_PORT` can change the host ports. Update browser origin/callback configuration if the backend host port changes. To use another environment-file path, set `AFTERLIFE_ENV_FILE` as well as passing that file through `--env-file`.

**Persistence and lifecycle**

The application migrates its world store on startup. Current persistence is one row-locked JSONB aggregate per world, retaining canonical facts, events, votes, memberships, and idempotency records in the same database transaction. Recreating the backend does not reset those records.

```sh
docker compose --env-file .env.compose.local restart backend
```

`docker compose down` stops/removes containers while retaining the database volume. `docker compose down -v` deletes the volume and its worlds; use it only when deliberately destroying that installation's data. Keep a database backup before changing schema or replacing a populated volume.

The background worker needs an awake backend process. If it was unavailable, bounded resting-world catch-up runs after recovery. OAuth browser sessions and Twitch tokens remain process-memory-only in this increment: creators must sign in again after a backend restart, and stale live connection state is reset. No cross-restart credential recovery is claimed.

**Public hosting**

The Compose ports bind to localhost. For an external deployment, place an HTTPS reverse proxy or managed ingress in front of the backend, preserve streaming responses for `/api/worlds/:id/stream`, and allow the backend's outgoing Twitch WebSocket. Set `PUBLIC_ORIGIN` to the final HTTPS origin and register its exact OAuth callback. Use managed environment/secret settings rather than baking credentials into an image.

`/health` is application liveness. A successful response does not prove that Twitch authorization or a live model invocation has been tested. Record those acceptance checks separately on the deployed configuration.

**Provider-free local rehearsal**

For a temporary world that is discarded when the process stops:

```sh
npm ci
DATABASE_URL= ALLOW_REHEARSAL=true npm run dev
```

`DATABASE_URL=` deliberately overrides any database URL loaded from `.env`. Keep the default localhost binding for rehearsal sign-in. Do not enable rehearsal authentication behind a public reverse proxy. A creator signs in with `POST /auth/rehearsal`, keeps the session cookie, and creates the rehearsal world with `POST /api/worlds` and `{}`. The [integration contract](integration-contract.md) documents creator commands and both fixed synthetic participants. Keep the visible rehearsal label in any frontend or recording.

For the durable two-episode backend acceptance exercise, use a dedicated disposable PostgreSQL database:

```sh
TEST_DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DISPOSABLE_DATABASE npm run smoke:rehearsal
```

Supply that URL through your local shell or secret settings; do not commit it. The command builds the backend and starts its own Node process on a local port. It sends actual HTTP requests, makes two synthetic participants join and choose betrayal, ends the episode, waits for a real 60-second worker tick, and restarts the backend process. It then checks the persisted betrayal, offline consequence, lost creator session, episode-two recall and cause links. Allow roughly 75–90 seconds. No live Twitch or OpenAI configuration is passed to the subprocess.

Use a database with an entirely empty `afterlife_worlds` store. Startup reconciles connection status for all stored worlds, so the smoke refuses to run against a populated store and removes only the world it creates. It creates the backend table if needed; it does not remove the database, containers, or volumes. This exercise runs the built Node server with PostgreSQL and does not test the backend container or a public deployment.

**Remaining external acceptance**

Live-provider validation is deferred by user choice. Before claiming a complete live deployment, record these checks on the actual hosting configuration:

- Deploy the backend and durable database to an awake host; verify HTTPS, public snapshot/SSE delivery, and state after a real service restart or redeploy.
- Sign in through the registered Twitch callback, then have two distinct real Twitch accounts join and vote. Confirm vote replacement and reconnect/pause/resume behavior. Synthetic rehearsal participants do not satisfy this check.
- With a configured model, verify one accepted scene and recap through the provider. Injected tests cover invalid output and grounded fallbacks; they do not prove account access, model availability, or deployment latency.
- Integrate the teammate's frontend and run the creator/viewer pilot, including OBS readability and the visible link from episode two to the original betrayal.

Provider tokens and creator sessions deliberately require sign-in after restart. Canonical world persistence and credential recovery are separate observations.

**Builds behind a session HTTPS proxy**

The Dockerfile accepts an optional BuildKit `proxy_ca` secret. Mount the environment's trusted CA bundle when dependency downloads require it:

```sh
docker build --secret id=proxy_ca,src=/path/to/trusted-ca-bundle.pem -t afterlife-backend .
```

Keep TLS verification enabled. Preserve the session's configured proxy settings. For Compose builds, supply the same `proxy_ca` build secret through a local Compose override. For runtime HTTPS through that proxy, mount the public CA bundle read-only and set `NODE_EXTRA_CA_CERTS` to its container path; keep that environment-specific override out of the image.

**Verification status**

On 30 October 2026, the real HTTP rehearsal passed against disposable PostgreSQL: two synthetic viewers chose betrayal, a scheduled 60-second tick changed the resting world, the backend process stopped with SIGTERM and restarted, and episode two retained the causal event links and recorded viewer credits. This used factual fallback narration with no live provider credentials.

The rebuilt Node 24 Docker image passed the same complete rehearsal inside the container as the unprivileged `node` user, using its packaged production dependencies and a disposable PostgreSQL container. Its default command also served `/health` with PostgreSQL configured and rehearsal disabled. Compose configuration validation passed in the earlier checkpoint. Only task-owned disposable containers and their volumes were removed. Current test totals are recorded in [progress.md](progress.md). No public deployment, live model response, or real Twitch broadcast is claimed.
