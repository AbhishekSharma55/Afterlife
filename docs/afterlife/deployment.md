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

**Builds behind a session HTTPS proxy**

The Dockerfile accepts an optional BuildKit `proxy_ca` secret. Mount the environment's trusted CA bundle when dependency downloads require it:

```sh
docker build --secret id=proxy_ca,src=/path/to/trusted-ca-bundle.pem -t afterlife-backend .
```

Keep TLS verification enabled. Preserve the session's configured proxy settings. For Compose builds, supply the same `proxy_ca` build secret through a local Compose override. For runtime HTTPS through that proxy, mount the public CA bundle read-only and set `NODE_EXTRA_CA_CERTS` to its container path; keep that environment-specific override out of the image.

**Verification status**

On 30 October 2026, the Node 24 Docker image built successfully, including both workspace builds and production dependency pruning. Compose configuration validation passed. A runtime container smoke test was not run: the host ran out of disk space during packaging. The temporary image and only its newly created build-cache records were removed to recover space. Existing Node/PostgreSQL integration tests are documented separately in the progress notes. No external deployment or real Twitch broadcast is claimed.
