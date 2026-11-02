# AFTERLIFE — demo video script

**SHOW** tells you what to put on screen. **READ** is what you say over it. Record the screen clips first, then add your voice afterward if that is easier. The [voiceover-only file](demo-voiceover.txt) contains the same nine spoken paragraphs.

Aim for **2:40–2:50**. Timestamps refer to the edited video; trim loading waits and window switching as needed.

## Before recording

- **Studio:** [Open Westbridge](https://afterlife.34-205-137-206.sslip.io/studio/0864f1ea-ae09-4669-a5ae-a0c14e06f20d), sign in with your main Twitch account, and check **Chat connected**.
- **Chat A:** [Open your channel chat](https://www.twitch.tv/popout/star_x_gaming/chat) with your main account.
- **Chat B:** Open that **same chat link** in a private window or second browser with your second account. Both accounts send messages to **star_x_gaming's channel**.
- Keep your Codex conversation and PR #4 ready for the Codex section. Hide unrelated tabs and notifications.

Westbridge was reset to be ready for Episode 1. If you have advanced it since then, these directions do not reset it again. This recording shows memory between episodes; the live six-hour offline clock is unchanged.

### 00:00–00:21 — Introduce AFTERLIFE

**SHOW:**

1. Open the [busy-chat image](demo-assets/twitch-chat-simulated.png) full-screen. Show it for the opening sentence, keeping **SIMULATED ACTIVITY** visible.
2. Switch to **Studio**. Scroll until the **kingdom map and Red/Blue cards** are visible together.
3. Leave that screen still while you finish this paragraph. You do not need to click anything yet.

**READ:**

> Imagine you're watching a Twitch stream, and chat decides to betray an entire kingdom. Everyone's laughing, the stream ends... but what happens when you come back tomorrow? That's the idea behind AFTERLIFE. It's a world your viewers help shape, and it remembers what they did.

### 00:21–00:40 — Show how viewers join

**SHOW:**

1. In **Studio**, scroll to the top and click **Start episode 1**.
2. Click **Prepare dilemma**. Wait for the treaty choices to appear; trim the loading wait from the video.
3. Switch to **Chat A** and send `!join red`.
4. Switch to **Chat B** and send `!join blue`.
5. Return to **Studio**. Scroll to the three choices and leave them visible. Check that **Break the treaty** is option **2** before the next section.

**READ:**

> Let me show you. We have two kingdoms, Red and Blue, who've agreed to a treaty. The streamer runs the episode from this studio, while viewers pick a side and vote right in Twitch chat. They can keep the peace, or break the treaty.

### 00:40–00:58 — Show real votes arriving

**SHOW:**

Arrange two windows: **Studio on the left**, **Twitch chat on the right**. Keep the Studio visible while you switch the right-hand window between Chat A and Chat B.

1. In Studio's top controls, select **2 min** and click **Open voting**. Scroll back to the choices so their vote counts are visible.
2. In **Chat A**, send `!vote 1`. Wait until Studio shows **one vote for Honor the treaty**.
3. In **Chat B**, send `!vote 2`. Wait until Studio shows **one vote on each choice, two voters total**.
4. In **Chat A**, send `!vote 2`. Show the tally change to **two votes for Break the treaty**, with the total still **two voters**.
5. In Studio, scroll to the top controls and click **Close voting early**. If the timer has ended, the button may say **Count votes now**.

Keep the actual message-to-tally updates visible. Trim the pauses spent switching windows.

**READ:**

> I'm using two separate Twitch accounts here. As I send their votes, you can see the numbers changing on screen. And if someone changes their mind, their new vote replaces the old one. Here, both viewers have decided to break the treaty.

### 00:58–01:10 — Show the consequences

**SHOW:**

1. Make **Studio full-screen** again.
2. Show the banner **The community chose: Break the treaty**.
3. Scroll to the map and trust meter. Pause on **Westbridge: Closed** and the reduced trust value.
4. Scroll down to **Recent history**. Show the new treaty-breaking entry and remember its event number.

Leave this result in place. Do not prepare another dilemma before ending Episode 1.

**READ:**

> Now look at the map. The bridge has closed, trust has dropped, and the betrayal is saved in the world's history. We've given Blue something to remember.

### 01:10–01:27 — End the first episode

**SHOW:**

1. In **Studio**, scroll to the top controls.
2. Click **End episode 1**, then **Yes, end episode**.
3. Leave **Resting between episodes** and **Start episode 2** visible for a few seconds.

You can move directly to the next section. This version demonstrates saved memory between episodes and needs no offline wait.

**READ:**

> I'll end the episode here. That closes this part of the story, but it doesn't erase what happened. Let's come back and start Episode Two to see what the world has kept.

### 01:27–01:48 — Reveal what Episode 2 remembers

**SHOW:**

1. Click **Start episode 2**. Wait for the recap to finish loading.
2. Click **Prepare dilemma** if that button appears.
3. Scroll to the new dilemma. Show the choices about **reparations, fortification, and peace talks**.
4. Find the gold **The world remembers** panel. Click the **sentence about breaking the treaty** inside it.
5. The original betrayal will be revealed in **Recent history**. Hold on that entry so the audience can recognise the event from the previous episode.

Leave Episode 2's vote unopened. You will return to this screen for the final line.

**READ:**

> When we start Episode Two, Blue still remembers. The recap brings us back to what happened, and now we have to decide how to respond: pay for the damage, fortify the bridge, or try peace talks. I can click this memory to see the original betrayal. Yesterday's choice has become today's problem.

### 01:48–02:06 — Show the recap and overlay

**SHOW:**

1. In **Studio**, scroll to **Previously in your kingdom** and show the recap text.
2. Scroll back to **Stream setup**, near the top of the page.
3. Under **OBS overlay**, click **Open**.
4. Show the overlay page full-screen for the rest of this paragraph. You do not need to set up OBS on camera.

Keep the actual narration-status badge visible. Use the fallback wording below if this take has no generated recap or character reactions.

**READ:**

> AI helps tell that story through recaps and character reactions. The actual changes follow the game's rules, and the history is saved in a database. There's also a viewer page and an overlay the streamer can add to OBS.

### 02:06–02:25 — Show your work with Codex

**SHOW:**

1. Switch to your **real Codex conversation**. Show your request to investigate frontend/backend bugs and a useful part of the response. Hold it still long enough to read.
2. Switch to [merged PR #4](https://github.com/AbhishekSharma55/Afterlife/pull/4), open **Files changed**, and show a regression test in `apps/web/test/regressions.test.tsx`.
3. Hold that test on screen while you finish the paragraph. Two readable screens are enough; you do not need to scroll through the entire conversation or PR.

Keep keys, `.env`, and unrelated conversations out of the recording.

**READ:**

> My teammate focused on the frontend, and I worked on the backend with Codex. We used Codex to build the world logic, connect Twitch chat, and test what survives between episodes. It also helped us find bugs and add tests for the fixes.

### 02:25–02:45 — Close on the remembered world

**SHOW:**

1. Return to **Studio**.
2. Scroll to the Episode 2 dilemma so **The world remembers** is visible.
3. Leave the screen still while you say the final paragraph.
4. Finish on that same screen with: **“The stream ends. The world remembers.”** You can add the AFTERLIFE name and tagline in your video editor.

**READ:**

> That's AFTERLIFE. You come back to see what happened to the world you helped create... and whether Blue has forgiven you yet. The stream ends. The world remembers.

## If this take uses factual narration only

For the recap/overlay section, replace its spoken paragraph with:

> Here you can read the story so far. This take is using the built-in narration fallback. The world history is saved in a database, and there's also a viewer page and an overlay the streamer can add to OBS.

## Before uploading

Watch the finished video once. Keep the real Twitch demo and Codex explanation within the **first three minutes**. The busy opening screenshot retains its simulated-activity label; the voting section uses your actual two-account footage. Upload to **YouTube**, set **Public or Unlisted**, use **no password**, and paste the URL into the submission form.
