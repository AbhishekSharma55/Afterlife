# AFTERLIFE — demo video script

**Read-aloud file:** [demo-voiceover.txt](demo-voiceover.txt). Read only the quoted narration below; the screen directions are for recording/editing. The voiceover is about 357 words. At 140–150 words per minute, aim for roughly 2:40–2:50. Time one full read before recording; leave room for pauses within the three-minute limit. Timestamps are editing targets, not a timer that should override the actual screen state.

## Current deployment and existing footage

- The app is live at **https://afterlife.34-205-137-206.sslip.io/studio**, backed by persistent PostgreSQL on AWS. Sign in with the original streamer Twitch account. The local backend was stopped during cutover; AWS is the active installation.
- Current saved world: Westbridge. Public links: [studio](https://afterlife.34-205-137-206.sslip.io/studio/0864f1ea-ae09-4669-a5ae-a0c14e06f20d), [viewer](https://afterlife.34-205-137-206.sslip.io/world/0864f1ea-ae09-4669-a5ae-a0c14e06f20d), [OBS overlay](https://afterlife.34-205-137-206.sslip.io/overlay/0864f1ea-ae09-4669-a5ae-a0c14e06f20d). Use the studio's Stream setup links if the selected world changes.
- The cloud offline clock is the normal **six hours per update**. Earlier local pilot footage used an explicit **60-second** process override. The read-aloud file uses the accelerated local footage. For cloud-only footage, use the alternate offline paragraph below. Keep the timing caption matched to the footage.
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

### 00:00–00:21 — Open with the kingdom

**SHOW:** Show the public viewer page, with the kingdom map, Red/Blue factions, and the current dilemma visible. Add a small title: AFTERLIFE — The stream ends. The world remembers. Start on the product.

**READ:**

> Imagine you're watching a Twitch stream, and chat decides to betray an entire kingdom. Everyone's laughing, the stream ends... but what happens when you come back tomorrow? That's the idea behind AFTERLIFE. It's a world your viewers help shape, and it remembers what they did.

### 00:21–00:40 — Show how viewers participate

**SHOW:** Cut to the creator studio, then a readable side-by-side view of Twitch chat and the public world page. Show !join red from the main account and !join blue from the second account, both in the main account’s channel. Reveal the treaty choices. Open a two-minute vote; close it early after capturing the actions below.

**READ:**

> Let me show you. We have two kingdoms, Red and Blue, who've agreed to a treaty. The streamer runs the episode from this studio, while viewers pick a side and vote right in Twitch chat. They can keep the peace, or break the treaty.

### 00:40–00:58 — Prove real chat changes the tally

**SHOW:** Keep both Twitch usernames and the tally readable. Main account sends !vote 1; second account sends !vote 2; main account changes to !vote 2. Capture the split vote becoming two votes for Break the treaty while total voters stays two. Close voting early in the studio. Use genuine chat footage; keep the send-to-update moment uncut.

**READ:**

> I'm using two separate Twitch accounts here. As I send their votes, you can see the numbers changing on screen. And if someone changes their mind, their new vote replaces the old one. Here, both viewers have decided to break the treaty.

### 00:58–01:10 — Show the committed consequence

**SHOW:** Hold on the resolved result, the closed Westbridge marker, lower trust, and the new betrayal entry in the Chronicle. Highlight the event’s sequence number. Use the actual values displayed in the recording; do not add invented vote counts or resource effects.

**READ:**

> Now look at the map. The bridge has closed, trust has dropped, and the betrayal is saved in the world's history. We've given Blue something to remember.

### 01:10–01:27 — Show the world developing between episodes

**SHOW:** In the studio click End episode, then Yes, end episode. Briefly show the resting state. For the accelerated local take, keep the backend running and wait at least 60 seconds for Blue’s retaliation-preparation event to appear. The live cloud clock is six hours; use the appropriate footage and caption. Capture that new Chronicle entry before starting the next episode. Cut out the wait and display BOTH captions: Local demo: offline clock accelerated to 60 seconds per update (normal: 6 hours), and One minute later — wait shortened.

**READ:**

> I'll end the episode here. For this local demo, we've sped things up so the world updates after a minute. We'll skip the wait. While the world is resting, Blue starts preparing retaliation because of that betrayal.

### 01:27–01:48 — Deliver the memory payoff

**SHOW:** Start the next episode and click Prepare dilemma if offered. Show Previously in your kingdom and While you were away, then the retaliation scene. Click the betrayal sentence inside the gold The world remembers panel (the whole sentence is a button), or the #4 citation in the recap, so its Chronicle entry is revealed. Keep the original event number readable. Show the new choices: reparations, fortification, and talks. Do not resolve this second vote; preserve the payoff for recording.

**READ:**

> When we start Episode Two, Blue still remembers. The recap brings us back to what happened, and now we have to decide how to respond: pay for the damage, fortify the bridge, or try peace talks. I can click this memory to see the original betrayal. Yesterday's choice has become today's problem.

### 01:48–02:06 — Show the streamer-ready presentation

**SHOW:** Show generated narration or leader reactions only if they are present; keep the actual narration-status badge visible. Cut to the OBS overlay at 1920×1080. Ideally composite it above gameplay or your normal stream scene in OBS; if showing it in a browser, describe it only as the overlay page. Add a small architecture caption: Twitch chat → validated world rules → PostgreSQL → viewer + OBS. Optional caption for the current configuration: Narrator: DeepSeek V4.1 Flash via OpenRouter.

**READ:**

> AI helps tell that story through recaps and character reactions. The actual changes follow the game's rules, and the history is saved in a database. There's also a viewer page and an overlay the streamer can add to OBS.

### 02:06–02:25 — Explain and demonstrate Codex’s contribution

**SHOW:** Show a clean excerpt of the actual Codex build/review thread and the relevant code or test diff. Suggested evidence: apps/server/src/domain/world-service.ts, apps/web/test/regressions.test.tsx, and the successful checks on merged PR #4. Pan through one concrete fix/test rather than scrolling rapidly. Crop out unrelated chats, email, .env, credentials, tokens, and browser settings.

**READ:**

> My teammate focused on the frontend, and I worked on the backend with Codex. We used Codex to build the world logic, connect Twitch chat, and test what survives between episodes. It also helped us find bugs and add tests for the fixes.

### 02:25–02:39 — Close on the remembered world

**SHOW:** Return to the real retaliation scene and its remembered betrayal. Finish with the AFTERLIFE name and tagline. Keep the product visible behind the closing text. Add the repository link if useful, without showing secret configuration.

**READ:**

> That's AFTERLIFE. You come back to see what happened to the world you helped create... and whether Blue has forgiven you yet. The stream ends. The world remembers.

## Read it like you're showing a friend

The voiceover file contains only the words to say. Read “Episode Two” naturally; pause briefly after “but what happens when you come back tomorrow?” and let the bridge change stay visible before moving on. You don't need a dramatic announcer voice. Speak as if one person is sitting next to you asking how it works. The opening and closing are the only places that need an extra beat.

The first-person actions describe the screen clips: say “I'll end the episode here” over the actual click, even if you record the voiceover afterward. Use the vote-replacement sentence only with footage of the vote changing. If your existing pilot footage shows only two final votes, replace the voting paragraph with:

> These are two separate Twitch accounts, and both viewers have voted to break the treaty. You can see their votes coming through from chat, and the result appearing here in the studio.

## For cloud-only footage

Replace the offline paragraph in the read-aloud file with this only if you captured the actual six-hour gap:

> I'll end the episode here. The world keeps running on AWS while the streamer is away. Six hours later, Blue starts preparing retaliation because of that betrayal. We've cut out the wait so you can see what happens next.

Show “Six hours later — wait shortened.” Keep the one-minute caption only on the accelerated local footage.

## Match the AI paragraph to the screen

The main paragraph describes the feature without claiming that every scene is generated. Show the generated recap for the recorded Episode Two take and keep the scene's “Factual narration” badge visible. If you want to explain that badge aloud, use this replacement:

> AI wrote this recap from the saved history. This scene is using the built-in fallback, so the story can continue even when the AI response isn't usable. The history stays saved, and the viewer page and OBS overlay keep up with the world.

Do not describe fallback text as generated output or text narration as spoken AI audio.

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
