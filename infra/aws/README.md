# AFTERLIFE on AWS

Live studio: https://afterlife.34-205-137-206.sslip.io/studio

Viewer: https://afterlife.34-205-137-206.sslip.io/world/0864f1ea-ae09-4669-a5ae-a0c14e06f20d

The Twitch application has this registered redirect URL:
`https://afterlife.34-205-137-206.sslip.io/auth/twitch/callback`.
Sign in with the original streamer account to open its existing kingdom.

The deployment runs the application, PostgreSQL 17, and Caddy on one Amazon Linux 2023 EC2 `t3.small` in `us-east-1`. Caddy obtains and renews the public TLS certificate, redirects HTTP to HTTPS, and forwards SSE without buffering. The Elastic IP keeps the generated sslip.io hostname stable. CloudFront distribution creation was blocked by AWS account verification, so the working deployment uses direct HTTPS. The generated hostname depends on the external sslip.io DNS service; a domain you control can replace it later.

Only TCP 80 and 443 are public. PostgreSQL and the backend port stay on the private container network. Administrative commands use AWS Systems Manager rather than SSH. The instance requires IMDSv2. Runtime API keys and the generated database password live in AWS Secrets Manager and private host environment files, outside the image and repository. All deployment resources are separate from the account's existing stopped `vox-assist-backend` instance.

## What was verified

On November 2, 2026:

- Public HTTPS, HTTP redirect, application health, studio/viewer/overlay routes, and JSON API errors passed.
- Chromium rendered the public studio, a 390px viewer, and the 1920×1080 transparent overlay without JavaScript errors or horizontal overflow.
- Public SSE delivered the initial world snapshot and two heartbeats through Caddy.
- The existing Westbridge world was migrated, preserving Episode 2, twelve history events, two memberships, the recorded votes, the closed bridge, and trust of −20. It was resting after the user ended Episode 2; deployment did not reset it.
- A controlled backend restart preserved the canonical stored world. Sign-in and Twitch connection must be re-established after restart because credentials and browser sessions are in memory.
- An actual cloud OpenRouter request using `deepseek/deepseek-v4.1-flash` returned HTTP 200 and accepted generated narration. This isolated smoke did not alter the world. Earlier local checks also generated scenes and recaps; factual fallback remains possible.
- The first private S3 PostgreSQL backup completed, and the daily systemd backup timer was enabled and active.

Public callback construction and secure OAuth state cookies were checked. The user confirmed saving the callback in Twitch. Completing public sign-in and real chat participation still requires the streamer; these browser checks do not claim a completed cloud OAuth exchange or an OBS broadcast.

## Local prerequisites and inventory

Run commands from the repository root with Node 24+, Docker, the AWS CLI, and an authenticated AWS session. If authentication expires, use `aws login` and complete the browser login. These helpers use the CLI's selected profile; set `AWS_PROFILE` consistently when using a named profile.

Private IDs and migration status are in `.afterlife/aws/resources.json`; pinned ECR image tags are in `.afterlife/aws/images.json`. Preserve a private copy of this inventory for maintenance. It is ignored by Git. Do not remove it and re-run provisioning against the same account: the helpers use it to identify resources they own.

`provision.mjs` checks that the active account matches the saved inventory. Initial provisioning creates a dedicated instance/profile/security group, private encrypted/versioned S3 bucket, secret, and immutable ECR repository in the existing default VPC. Configuration is reapplied on retries. The current instance has an encrypted 32GB gp3 root volume retained on termination. This is a small single-instance deployment; no multi-instance session coordination or database failover is claimed.

## First deployment workflow

This has already been completed for the live app. Do not repeat the cutover against an active cloud world.

```sh
node infra/aws/provision.mjs provision
node infra/aws/direct-https.mjs
```

Wait until Systems Manager reports the new instance online and user-data has installed Docker/Compose. Build the application from the current Git revision, then publish and stage its images:

```sh
revision=$(git rev-parse --short HEAD)
docker build -t "afterlife-aws:$revision" .
node infra/aws/publish.mjs --new-release
node infra/aws/stage.mjs
node infra/aws/remote.mjs .afterlife/aws/remote-stage.sh
```

`publish.mjs` pulls PostgreSQL/Caddy and copies the images into the private ECR repository under immutable release tags. `stage.mjs` uploads only explicitly named runtime configuration files and image metadata; it configures the backup upload permission and retention policy. No application `.env` is included in the deployment bundle.

Set provider/Twitch values in the ignored local `.env`. `configure-runtime.mjs` copies only the expected provider and Twitch fields into Secrets Manager, with the cloud origin, private database URL, rehearsal disabled, and the normal six-hour offline interval. It removes its temporary secret request file afterward. It does not print keys.

```sh
node infra/aws/configure-runtime.mjs
```

Register the generated callback in Twitch before signing in. Initial migration then deliberately stops the existing local backend, backs up its PostgreSQL world table locally, and uploads that snapshot privately:

```sh
node infra/aws/cutover.mjs --cutover
node infra/aws/remote.mjs .afterlife/aws/remote-deploy.sh
node infra/aws/verify-public.mjs
```

The cutover helper expects this project's `afterlife-local-postgres` container and `.afterlife/local-app.pid`. It is not a general database migration tool. It refuses to replace an already captured initial migration. The remote deploy script imports only into an empty world store, records `migration.done`, and refuses to overwrite an existing unmarked world table. Future deploys preserve the cloud database.

`verify-public.mjs` is an initial migration acceptance check: it compares the live world to the captured migration summary. After the user advances the world, those equality assertions should no longer be expected to pass. Its browser/SSE checks produce private local screenshots and a verification summary.

## Redeploying or changing models

For an application update, build/publish/stage using the commands above with `--new-release`, then run the generated remote stage script. Keep `resources.json` and the host's migration marker. Never rerun the initial cutover or replace the populated PostgreSQL directory.

For a provider change, edit only the intended values in local `.env` (see [provider setup](../../docs/afterlife/ai-providers.md)), then regenerate cloud configuration and apply it:

```sh
node infra/aws/configure-runtime.mjs
node infra/aws/remote.mjs .afterlife/aws/remote-deploy.sh
```

Applying configuration can recreate the backend. Do it between episodes and sign in again afterward. Normal offline progression uses six hours per update, capped at three resting updates. The earlier one-minute pilot was a labeled local process override; it is not the cloud setting.

`remote.mjs` sends the supplied shell script to this instance through Systems Manager and saves the command ID and bounded output locally. Use reviewed scripts that never print credentials. For example, a maintenance script can run `cd /srv/afterlife` followed by `docker compose ps` or `systemctl status afterlife-backup.timer`. Avoid commands that dump runtime environment or rendered Compose secrets.

## Storage, backups, and recovery

PostgreSQL data is bind-mounted at `/srv/afterlife/postgres` on the encrypted EBS volume. Caddy certificate data also persists on that volume. Containers restart automatically when Docker starts. Recreating the backend does not erase worlds; its memory-only OAuth sessions/Twitch tokens are lost on restart.

A daily systemd timer runs `backup.sh` at 03:17 UTC, with up to ten minutes of randomized delay. It makes a compressed `pg_dump`, uploads it to the private encrypted S3 `backups/` prefix, and deletes the temporary local file only after a successful upload. Backups expire after fourteen days; noncurrent backup versions expire after one day. A first backup was verified in S3. Restore has not been rehearsed on a replacement instance yet.

The original pre-cutover SQL backup and original local PostgreSQL volume also remain on the development machine. Its backend is stopped so AWS is the active installation. Do not start two installations as if they shared world data.

For recovery, preserve the EBS volume and private inventory, stop writers, and restore a selected SQL backup into a separate empty database before switching traffic. A destructive restore of the live database requires a deliberate maintenance decision. Stopping the instance or deleting containers does not remove S3 backups. Do not delete the PostgreSQL directory, secret, EBS volume, or backups as part of ordinary deployment.

## Costs and ownership

The verified `us-east-1` Linux `t3.small` compute rate at deployment was $0.0208/hour (about $15.18 per 730-hour month). EBS, public IPv4, Secrets Manager, ECR/S3, network traffic, and AI requests add charges. The instance uses standard CPU credits to avoid unlimited-credit surplus charges. It stays running independently of the development computer; there is no automatic shutdown scheduled.

Teardown is a separate explicit action. Use the private inventory to remove only AFTERLIFE resources, and decide how long to retain the database volume and backups before deleting anything. The abandoned CloudFront VPC origin was submitted for deletion; no CloudFront distribution was created.
