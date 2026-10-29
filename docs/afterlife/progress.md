**Backend checkpoint — 30 October 2026**

Branch: `feat/backend-foundation`. User's two main-branch commits through `f44a021` are included. Frontend files have not been created or changed.

Implemented: npm/TypeScript workspace; deterministic world engine; memberships and votes; history and grievances; transactional idempotency; episodes; bounded resting ticks and catch-up; automatic deadlines; pause/resume; PostgreSQL repository; Fastify owner-authenticated routes and public snapshots/SSE; rehearsal isolation; Twitch OAuth/EventSub adapters and refresh timer; structured narrator and factual fallback; runtime wiring and CI.

Persistence currently uses a row-locked JSONB aggregate per world, containing facts, event history, votes and idempotency records atomically. This differs from the initially proposed six normalized tables and keeps this increment small. Production requires PostgreSQL. Explicit in-memory rehearsal is temporary and clearly marked.

Verification: **27/27 tests pass**, including the real PostgreSQL test; typecheck and build pass. The combined meaningful tests cover domain outcomes, ownership and rollback, duplicate/concurrent resolution, deadlines, bounded offline ticks, stale narration, HTTP authorization, OAuth state, SSE, adapter failures and PostgreSQL restart persistence. Run `TEST_DATABASE_URL=... npm test` for all database checks. Typecheck and build are required before publishing. No real Twitch broadcast or live model response has been claimed.

Next independent increments:

1. Add generated frontend fixtures and stable shared schema exports; choices currently filter impossible actions, so consumers must support one to three choices. Align contract accordingly.
2. Add resource-crisis encounters and complete documented bounded action values.
3. Ground AI recaps and individual contribution recall; leader reactions currently exist in narrator output but need consistent public presentation. Add continuity evaluation scenarios, not only ID validation.
4. Persist or explicitly recover provider sessions securely; current sessions/tokens are memory-only and require re-sign-in after a server restart. Add refresh-on-401 and reconnect/revocation scenarios.
5. Exercise deployed configuration and runtime story across two actual episodes; test real Twitch and OpenAI only when credentials are provided through environment variables. No credentials are committed.
6. Document remaining deployment constraints and judge rehearsal, finish README walkthrough, and record honest acceptance evidence.

Automation: user cron entry installed with a one-minute heartbeat and a ten-minute quota-check interval. Existing authenticated CLI passed a read-only probe; cron resumption itself must be confirmed from `.afterlife/runner.log` and `session.log` after the foreground session releases its lock. User-provided checker remains local/ignored. Usage reserve: stop new work at 85% current window or 95% weekly usage. Keep progress current before stopping. Do not merge PRs or touch frontend implementation.

The foreground runner lock is held only during active work. Scheduler honors STOP, COMPLETE and WAITING_FOR_INPUT markers and stops launching at the submission deadline. If independent backend work remains, continue it in the next run rather than treating missing provider keys as an immediate blocker.
