# AFTERLIFE frontend

React + Vite + TypeScript client for AFTERLIFE: the creator studio, the public world page and the OBS overlay. It renders the backend's `WorldSnapshot` (from `@afterlife/shared`) and never computes world facts itself. The server owns all state and vote resolution.

## Surfaces

| Route               | Who uses it | What it shows                                                                                        |
| ------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `/`                 | Anyone      | Landing page and a gallery of every fixture state                                                    |
| `/studio`           | Broadcaster | Sign-in (Twitch, or local rehearsal), then opens the creator's world (one per broadcaster)           |
| `/studio/:worldId`  | Broadcaster | One clear "next step", vote controls, synthetic rehearsal viewers, overlay/viewer links, world state |
| `/world/:worldId`   | Viewers     | Recap, current dilemma with live tally, map, factions, trust, grievance, and the full chronicle      |
| `/overlay/:worldId` | OBS         | Transparent 1920×1080 stream layout: dilemma and votes, memory callout, realm strip, change toasts   |

Add `?fixture=<name>` to any world surface to render a backend-generated fixture instead of the live server (`fresh`, `prepared`, `voting`, `disconnected`, `resolved-betrayal`, `resting`, `while-away`, `returning`). Fixture pages show a switcher bar and disable studio controls. Add `?backdrop=1` to the overlay to preview it over a stand-in gameplay background.

## Run it

From the repository root (Node 24+):

```sh
npm install

# Terminal 1 — backend in rehearsal mode (in-memory, no Twitch/OpenAI credentials).
# PUBLIC_ORIGIN must be the browser-facing frontend origin so creator POSTs pass the origin check.
DATABASE_URL= ALLOW_REHEARSAL=true PUBLIC_ORIGIN=http://localhost:5173 npm run dev

# Terminal 2 — frontend on http://localhost:5173 (proxies /api and /auth to 127.0.0.1:4310)
npm run dev:web
```

Open `http://localhost:5173/studio`, choose **Rehearse locally**, name the kingdom, and follow the studio's next-step card. The two rehearsal viewers stand in for chat. Set `OFFLINE_INTERVAL_MS=20000` on the backend to see "while you were away" developments within seconds; the default is six hours.

Point the Vite proxy at another backend with `AFTERLIFE_BACKEND=http://host:port npm run dev:web`.

For real Twitch sign-in in development, set `TWITCH_REDIRECT_URI=http://localhost:5173/auth/twitch/callback` so the OAuth callback and its session cookie land on the frontend origin.

## Checks

```sh
npm run typecheck:web   # TypeScript, strict
npm run test:web        # Vitest: display logic plus every fixture on every surface
npm run build:web       # Production bundle in apps/web/dist
```

## OBS setup

Add a **Browser Source** with the overlay URL from the studio, width 1920, height 1080. The page background is transparent; layer it above gameplay. Content keeps to the edges: the badge top-left, the dilemma panel on the right, the realm strip bottom-left and the join reminder bottom-right.

## How it talks to the backend

- `GET /api/worlds/:id` loads the snapshot. `GET /api/worlds/:id/stream` (server-sent `world.snapshot` events) keeps it live. Every payload is validated with `worldSnapshotSchema`. Older revisions are ignored, and the page reloads the snapshot after any reconnect.
- Creator commands send a `requestId`. A command keeps its ID until it succeeds, so retrying after a network failure cannot apply it twice.
- Countdowns use the server clock, estimated from the HTTP `Date` header, so a viewer's wrong system clock does not skew the deadline.
- If a scene or recap cites an event outside the snapshot's recent window, the page fetches older history to show it.
- Rehearsal worlds are labeled on every surface, including the overlay, so practice footage is never mistaken for live participation.

## Integration notes for the backend

- **Production serving.** The plan serves the built frontend from the backend's origin. The server does not serve static files yet: it needs `apps/web/dist` as static assets plus an `index.html` fallback for `/studio/*`, `/world/*` and `/overlay/*`. The Docker image would also need to build the web workspace. Until then, any static host that proxies `/api` and `/auth` to the backend on the same origin works.
- The OAuth callback redirects to `/studio/:worldId` on whichever origin handled it. That origin must serve this app.

## Art and fonts

Background photographs are free-licensed from Unsplash; photographers and source links are listed in [public/art/CREDITS.md](public/art/CREDITS.md). The map, emblems and icons are original SVG. Fonts (Cinzel, Barlow, Barlow Condensed) are bundled from Fontsource under the SIL Open Font License, so the overlay renders the same offline in OBS.
