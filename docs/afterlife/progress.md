**Current checkpoint — November 2, 2026**

AFTERLIFE is deployed at [the public AWS studio](https://afterlife.34-205-137-206.sslip.io/studio). Backend, frontend, and integration changes are merged; application revision `575a6ca` is deployed. Merged PR #4 fixes all eight audited bugs plus the Windows asset-path issue and the stale generation guard. Its [CI passed](https://github.com/AbhishekSharma55/Afterlife/actions/runs/41224311656). The earlier [bug list](bug-list.md) retains the findings and fix status.

**Verified product flow**

Two distinct real Twitch accounts joined Red and Blue and voted to break the Westbridge treaty in the local persistent installation. Their two votes created canonical betrayal event #4, closed the bridge, and reduced trust to −20. Real background-worker retaliation events appeared while the world rested, before Episode 2 began. Episode 2 recalled that same event and retained both recorded viewer contributions. Its recap was generated; its scene used the factual fallback. The user subsequently ended Episode 2. Deployment preserved that resting world rather than resetting the recording.

Local provider checks generated both a scene and a recap through OpenRouter. The AWS provider smoke also generated an accepted scene with `deepseek/deepseek-v4.1-flash` (HTTP 200) without mutating the world. Generation can still fall back; only label actual accepted output as generated. The selected model/provider remains controlled by environment settings. Switching to direct OpenAI before evaluation is still planned, not completed.

**Public deployment**

A dedicated EC2 `t3.small` runs the full application, PostgreSQL 17, and Caddy. The generated hostname uses a stable Elastic IP and publicly trusted automatic HTTPS. CloudFront distribution creation was blocked by AWS account verification; the user authorized the working generated-hostname alternative. The existing unrelated EC2 instance was untouched.

The migration preserved Westbridge Episode 2, twelve history events, two memberships, recorded votes, bridge state, and trust. A controlled backend restart preserved the canonical world document. The original local database and pre-cutover SQL backup remain available; the local backend is stopped and AWS is authoritative.

The public checks passed HTTPS/redirects, studio/viewer/overlay routes, JSON API errors, disabled rehearsal authentication, and secure OAuth state cookies. Chromium reported no JavaScript errors or horizontal overflow on the checked desktop/mobile/overlay surfaces; the overlay background was transparent. Public SSE delivered a snapshot and two heartbeats. The first encrypted private S3 backup completed; a daily systemd backup timer is enabled, with fourteen-day retention.

The user confirmed saving the public Twitch callback. A completed cloud sign-in/chat exchange still needs the streamer to sign in. Public route checks and local Twitch participation do not establish that final cloud acceptance step. See [AWS operations](../../infra/aws/README.md) for deployment commands, restart behavior, costs, backups, and private inventory locations.

**Implementation and limits**

Persistent canonical world engine, causal history and memory links, faction membership, one effective vote per viewer, atomic idempotency, bounded offline progression, grounded recaps/reactions, creator-authenticated commands, Twitch EventSub, browser-bound OAuth, token refresh, reconnection handling, and shared DTO schemas are implemented. The server serves React studio/viewer/OBS pages, API, auth, and SSE on one origin.

World persistence is one locked PostgreSQL JSONB aggregate per world. OAuth sessions and Twitch tokens remain memory-only, so restart requires sign-in and reconnect while canonical facts persist. The cloud deployment uses one instance and normal six-hour offline updates; it has no multi-instance coordination or automatic database failover. Backups exist; replacement-host restore has not yet been rehearsed.

**Remaining acceptance and submission**

1. Sign in on the public hostname with the original streamer account. Confirm chat connects and repeat a real two-account voting check on the public app when ready. Verify vote replacement and connection pause/resume in the final take; do not infer them from screenshots of a final tally.
2. Check the actual OBS compositor above stream content and record the final demo. The [read-aloud script and screen directions](demo-script.md) are prepared; existing one-minute offline footage must retain its acceleration caption. The live cloud clock is six hours.
3. Switch to the intended OpenAI evaluation model when its key is ready; verify actual accepted scene/recap output on that deployed configuration.
4. Finalize the video, submission write-up, screenshots, repository/judge access, and official requirements. No video upload or Devpost submission has been performed by this deployment task.

The generated recap can expose raw event UUIDs in prose; this is a known presentation limitation. Canonical references and contribution credits remain separate validated fields.

**Verification evidence**

Application build/typecheck/unit/browser/persistent rehearsal checks passed in the merged implementation; current PR CI includes PostgreSQL. The deployment task changed infrastructure and documentation rather than application behavior. It additionally exercised the real AWS HTTPS/SSE/browser surfaces, a state-preserving backend restart, a successful cloud model invocation, and the initial S3 backup. Local screenshots and deployment summaries are ignored under `.afterlife/`; no credentials, SQL dumps, or runtime secret files belong in Git.

**Scheduler and quota**

The existing runner remains gated by `.afterlife/WAITING_FOR_INPUT`; do not add duplicate or recursive jobs or mark the whole hackathon complete because deployment passed. Preserve `.afterlife/STOP` if present. Foreground work holds the shared runner lock; AWS containers continue independently of this local scheduler.

Check quota only with `node scripts/check-usage.mjs`; never print or commit `check_usage.js`, credentials, or runner logs/config. Stop initiating tasks at 85% window usage or 95% weekly usage. The recorded submission deadline is November 2 at 22:00 UTC (November 3 at 03:30 IST); recheck official requirements before submitting.
