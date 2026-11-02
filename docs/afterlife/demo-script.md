# AFTERLIFE — demo video script

**Read-aloud file:** [demo-voiceover.txt](demo-voiceover.txt). Read only the quoted narration below; the screen directions are for recording/editing. The voiceover is approximately 318 words. Aim for 2:40–2:50, leaving room below the official three-minute maximum. Timestamps are editing targets, not a timer that should override the actual screen state.

## Current deployment and existing footage

- The app is live at **https://afterlife.34-205-137-206.sslip.io/studio**, backed by persistent PostgreSQL on AWS. Sign in with the original streamer Twitch account. The local backend was stopped during cutover; AWS is the active installation.
- Current saved world: Westbridge. Public links: [studio](https://afterlife.34-205-137-206.sslip.io/studio/0864f1ea-ae09-4669-a5ae-a0c14e06f20d), [viewer](https://afterlife.34-205-137-206.sslip.io/world/0864f1ea-ae09-4669-a5ae-a0c14e06f20d), [OBS overlay](https://afterlife.34-205-137-206.sslip.io/overlay/0864f1ea-ae09-4669-a5ae-a0c14e06f20d). Use the studio's Stream setup links if the selected world changes.
- The cloud offline clock is the normal **six hours per update**. Earlier local pilot footage used an explicit **60-second** process override. The one-minute narration below applies only to that accelerated footage; keep its caption. For a cloud-only recording with a real six-hour gap, replace it with “The backend keeps running while the kingdom rests. Six hours later, Blue begins preparing retaliation because of the broken treaty. We're cutting out the wait.” Do not claim a one-minute cloud update.
- The user-requested reset preceded the verified local pilot. The current world has since completed Episodes 1 and 2 and is **resting after Episode 2**. Deployment preserved it. The script below describes the episode-one-to-two demonstration, not the next action on this existing world. Use the actual captured pilot footage or deliberately prepare a separate recording world; do not reset the saved world implicitly.
- **Pilot verified (November 2):** two distinct real Twitch accounts voted for betrayal in Episode 1. The canonical betrayal is event **#4**; Episode 2 references it. Background retaliation events were processed before Episode 2 began, and its generated recap carries two contribution credits. Screenshots and verification summaries are saved locally under `.afterlife/evidence/`. Capture actual screen footage for the video; screenshots are supporting evidence.
- Cloud HTTPS, browser pages, SSE, persistence after restart, and an accepted generated narration request passed. A completed cloud Twitch sign-in/chat check still needs the streamer. See [deployment operations](../../infra/aws/README.md).

## Before pressing record

1. Use two Twitch accounts total: your main streamer account in a normal browser and the second account in another browser or a private window. Both open **the main account’s channel chat**. Only the main account needs to sign in to AFTERLIFE.
2. In the studio wait for Chat connected. Start the next episode. If the deferred treaty is already prepared, go directly to voting; otherwise click Prepare dilemma. Confirm choice 2 is Break the treaty. If the title is rewritten by AI, follow the actual choice meanings.
3. Send `!join red` from the main account and `!join blue` from the second account before opening voting. Use a two-minute voting window to allow switching accounts; the final video need not show the full wait because you can close voting early.
4. Open the viewer page and overlay in their own tabs. Capture 1920×1080 where possible, hide bookmarks/unrelated tabs and notifications, and make chat text large enough to read. Do not record secret configuration or OAuth callback URLs while they contain authorization codes.
5. Record screen clips first, then read the voiceover over the edited footage if switching accounts while speaking is awkward. Capture the live chat-to-tally moment continuously; use explicit cuts for the longer offline wait.
6. Before recording the AI paragraph, verify actual generated narration/recap in this world. Earlier direct-provider checks generated both, but one scene attempt fell back. If the current take shows Factual narration, use the alternate sentence below and show the status honestly.

## Read this, and show this

### 00:00–00:15 — Open with the kingdom

**SHOW:** Show the public viewer page, with the kingdom map, Red/Blue factions, and the current dilemma visible. Add a small title: AFTERLIFE — The stream ends. The world remembers. Start on the product.

**READ:**

> Your viewers make one choice tonight. Next stream, the kingdom still remembers it. This is AFTERLIFE: a persistent story world for Twitch, where the community's decisions become the history of the next episode.

### 00:15–00:35 — Show how viewers participate

**SHOW:** Cut to the creator studio, then a readable side-by-side view of Twitch chat and the public world page. Show !join red from the main account and !join blue from the second account, both in the main account’s channel. Reveal the treaty choices. Open a two-minute vote; close it early after capturing the actions below.

**READ:**

> The streamer controls the episode from this studio. Viewers join Red or Blue directly in Twitch chat, then vote on a dilemma. Here, the community must decide whether to honor the Westbridge treaty, break it, or hold position.

### 00:35–00:55 — Prove real chat changes the tally

**SHOW:** Keep both Twitch usernames and the tally readable. Main account sends !vote 1; second account sends !vote 2; main account changes to !vote 2. Capture the split vote becoming two votes for Break the treaty while total voters stays two. Close voting early in the studio. Use genuine chat footage; keep the send-to-update moment uncut.

**READ:**

> These are two separate Twitch accounts. Watch the live tally as their messages arrive. When one viewer changes their vote, the total stays at two. Each account has one effective vote. The community has chosen to break the treaty.

### 00:55–01:10 — Show the committed consequence

**SHOW:** Hold on the resolved result, the closed Westbridge marker, lower trust, and the new betrayal entry in the Chronicle. Highlight the event’s sequence number. Use the actual values displayed in the recording; do not add invented vote counts or resource effects.

**READ:**

> The bridge closes, trust falls, and the betrayal enters the Chronicle. This is a recorded world event. Its consequences will carry forward after this episode ends.

### 01:10–01:30 — Show the world developing between episodes

**SHOW:** In the studio click End episode, then Yes, end episode. Briefly show the resting state. For the accelerated local take, keep the backend running and wait at least 60 seconds for Blue’s retaliation-preparation event to appear. The live cloud clock is six hours; use the appropriate footage and caption. Capture that new Chronicle entry before starting the next episode. Cut out the wait and display BOTH captions: Local demo: offline clock accelerated to 60 seconds per update (normal: 6 hours), and One minute later — wait shortened.

**READ:**

> Now the streamer ends the episode. For this demonstration, we've accelerated offline updates to one minute. The backend keeps running while the kingdom rests. Blue begins preparing retaliation because of the broken treaty. We're cutting out the wait.

### 01:30–01:50 — Deliver the memory payoff

**SHOW:** Start the next episode and click Prepare dilemma if offered. Show Previously in your kingdom and While you were away, then the retaliation scene. Click the betrayal sentence inside the gold The world remembers panel (the whole sentence is a button), or the #4 citation in the recap, so its Chronicle entry is revealed. Keep the original event number readable. Show the new choices: reparations, fortification, and talks. Do not resolve this second vote; preserve the payoff for recording.

**READ:**

> When the next episode starts, the recap brings that history back. Blue remembers the betrayal and demands a response. This memory link points to the exact event, and the world offers reparations, fortification, or peace talks. Viewers inherit the consequences of their earlier choice.

### 01:50–02:10 — Show the streamer-ready presentation

**SHOW:** Show generated narration or leader reactions only if they are present; keep the actual narration-status badge visible. Cut to the OBS overlay at 1920×1080. Ideally composite it above gameplay or your normal stream scene in OBS; if showing it in a browser, describe it only as the overlay page. Add a small architecture caption: Twitch chat → validated world rules → PostgreSQL → viewer + OBS. Optional caption for the current configuration: Narrator: DeepSeek V4.1 Flash via OpenRouter.

**READ:**

> AI adds narration, leader reactions, and recaps using the saved facts and events. Validated game rules control the actual changes, and PostgreSQL preserves the world. The public viewer page and OBS overlay follow those changes through live updates.

### 02:10–02:30 — Explain and demonstrate Codex’s contribution

**SHOW:** Show a clean excerpt of the actual Codex build/review thread and the relevant code or test diff. Suggested evidence: apps/server/src/domain/world-service.ts, apps/web/test/regressions.test.tsx, and the successful checks on merged PR #4. Pan through one concrete fix/test rather than scrolling rapidly. Crop out unrelated chats, email, .env, credentials, tokens, and browser settings.

**READ:**

> We built AFTERLIFE with OpenAI Codex. Codex helped implement the persistent world engine, Twitch integration, and shared frontend contract. We also used it to investigate bugs, add regression tests, and verify the complete two-episode rehearsal.

### 02:30–02:45 — Close on the remembered world

**SHOW:** Return to the real retaliation scene and its remembered betrayal. Finish with the AFTERLIFE name and tagline. Keep the product visible behind the closing text. Add the repository link if useful, without showing secret configuration.

**READ:**

> AFTERLIFE gives streamers an ongoing community story and viewers a reason to return. They helped shape this world. Next stream, they find out what it remembers.

## If this take uses factual fallback

Replace the first sentence of the 01:50 paragraph with:

> “The episode recap is AI-generated from saved history. This scene is using the factual fallback, so the story can continue when a generated response cannot be accepted.”

For the recorded local Episode 2 take, the stored recap was generated and the scene fell back. Then continue: “Validated game rules control the actual changes…” Keep the factual-status badge visible. Do not describe fallback text as a generated response or text narration as spoken AI audio.

## Recording checkpoints

- Two real account names and genuine `!join` / `!vote` messages are visible in the same Twitch channel.
- Changing one account’s vote preserves the total voter count of two.
- The resolved betrayal closes the bridge, changes trust, and creates a Chronicle event.
- An actual background tick creates the retaliation-preparation event **before** the next episode starts. Keep the server running; wait for the event instead of assuming 60 seconds was sufficient.
- The next scene/recap links back to the same recorded betrayal. Click that cause link.
- The video shows how Codex was used, with real implementation/test evidence.
- The exported video is at most three minutes. Target under 2:50. The official requirements ask for a working Twitch demo and Codex usage; upload the final video publicly to YouTube for the submission.

If chat messages never appear in AFTERLIFE, pause the recording and diagnose the connection. Do not replace the live segment with fixtures or synthetic viewers while calling it real Twitch participation. If you use fixture or rehearsal footage as supplemental material, retain its labels and identify it as such.

**Verified official sources (November 2, 2026 IST):** [submission requirements](https://twitchcon-codex.devpost.com/) — maximum three-minute publicly visible YouTube video showing the project working on Twitch and how Codex was used; [judging criteria](https://twitchcon-codex.devpost.com/) — innovation, potential impact, implementation/Codex use, and design. These local script files do not upload or enter anything on Devpost.
