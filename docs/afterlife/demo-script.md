# AFTERLIFE — simple screen-recording guide

**Record the screen first. Add your voice afterward.** Read [demo-voiceover.txt](demo-voiceover.txt): it has nine paragraphs. Each paragraph goes with one numbered clip below.

The finished video should be about **2:40–2:50**. You can take longer to perform the actions, then trim loading waits and window switching.

## Before you record

Open these four things:

| Name used below | Open this |
| --- | --- |
| **Studio** | [Your Westbridge studio](https://afterlife.34-205-137-206.sslip.io/studio/0864f1ea-ae09-4669-a5ae-a0c14e06f20d), signed in with your main Twitch account. |
| **Chat A** | [Your channel chat](https://www.twitch.tv/popout/star_x_gaming/chat), signed in with your main account. |
| **Chat B** | The **same chat link**, in a private window or second browser, signed in with your second account. |
| **Codex** | One real Codex conversation about building or testing AFTERLIFE. |

Both accounts use **star_x_gaming's channel chat**. Refresh the Studio and check **Chat connected** before recording. Hide unrelated tabs/notifications and use 1920×1080 if possible.

Westbridge was reset at your request. At that checkpoint, it was ready to **Start episode 1**. These directions do not reset it again if you have since advanced it.

## The nine clips, in order

| Clip / approximate time | Voiceover paragraph begins… | Exactly what to put on screen |
| --- | --- | --- |
| **1 · 0:00–0:21** | “Imagine you're watching a Twitch stream…” | Show the [busy-chat image](demo-assets/twitch-chat-simulated.png) for **five seconds**, keeping its **SIMULATED ACTIVITY** label visible. Then switch to **Studio** and show the **map and Red/Blue cards**. Hold still. |
| **2 · 0:21–0:40** | “Let me show you…” | In **Studio**, click **Start episode 1**, then **Prepare dilemma**. Wait for the treaty choices. Show **Chat A** sending `!join red`, then **Chat B** sending `!join blue`. Return to Studio and show the three choices. |
| **3 · 0:40–0:58** | “I'm using two separate Twitch accounts…” | Show **Studio on the left** and **Twitch chat on the right**. Record the vote sequence in the small checklist below. Keep the chat messages and tally readable. |
| **4 · 0:58–1:10** | “Now look at the map…” | Make **Studio full-screen**. Show **The community chose: Break the treaty**. Scroll to **Westbridge: Closed** and the lower trust value. Then show the treaty-breaking entry in **Recent history**. Remember its event number. |
| **5 · 1:10–1:27** | “I'll end the episode here…” | In **Studio**, scroll to the top. Click **End episode 1**, then **Yes, end episode**. Hold on **Resting between episodes** and the **Start episode 2** button. |
| **6 · 1:27–1:48** | “When we start Episode Two…” | Click **Start episode 2**, then **Prepare dilemma** if offered. Show the new choices about **reparations, fortification, and peace talks**. Click the betrayal sentence inside **The world remembers**. Hold on the original event it reveals in **Recent history**. |
| **7 · 1:48–2:06** | “AI helps tell that story…” | Show **Previously in your kingdom** and the recap in **Studio**. Then scroll to **Stream setup → OBS overlay → Open**. Show the overlay page full-screen. Opening the browser page is enough; you do not need to configure OBS on camera. |
| **8 · 2:06–2:25** | “My teammate focused on the frontend…” | Switch to **Codex**. Show one real request about building the app or finding a bug. Then show the matching code/test change or successful check. Keep each screen still long enough to read. |
| **9 · 2:25–2:45** | “That's AFTERLIFE…” | Return to **Studio**. Hold on the Episode 2 dilemma and **The world remembers** panel. Finish your final line over that screen: **“The stream ends. The world remembers.”** |

**After Clip 4:** leave the resolved result on screen until you end Episode 1. Do not prepare another dilemma first.

**After Clip 6:** leave the second vote unopened. You can return to that same screen for Clip 9.

## Clip 3 — the exact vote sequence

First confirm **Break the treaty** is option **2**. The commands below assume that order.

Put Studio in one window on the **left half** of your screen. Put Twitch chat on the **right half**. Switch the right-hand window between Chat A and Chat B while keeping Studio visible.

| Do this | Where | Wait until you see this |
| --- | --- | --- |
| Select **2 min**, then click **Open voting**. Scroll back to the choices. | Studio | Voting is open. |
| Send `!vote 1`. | Chat A | One vote for **Honor the treaty**. |
| Send `!vote 2`. | Chat B | One vote for each choice; **two voters total**. |
| Send `!vote 2`. | Chat A | **Two votes for Break the treaty**, still two voters total. |
| Scroll to the top and click **Close voting early**. | Studio | The betrayal wins. If the timer has ended, the button may say **Count votes now**. |

Wait for each tally update before sending the next command. Keep the actual message-to-tally updates in the video. The busy-chat image is only for Clip 1; this clip uses your real Twitch accounts.

## Clip 8 — an easy Codex example to show

Use **one** example:

- A Codex request about the world remembering choices, followed by `apps/server/src/domain/world-service.ts`.
- A Codex bug-review exchange, followed by a matching test in `apps/web/test/regressions.test.tsx`.
- A Codex testing exchange, followed by the successful checks on [merged PR #4](https://github.com/AbhishekSharma55/Afterlife/pull/4).

Two readable screens are enough. Keep `.env`, keys, and unrelated conversations out of the recording.

## Two details for this take

**No offline wait is needed for this version.** Clip 5 ends Episode 1, and Clip 6 starts Episode 2 to show that the betrayal is remembered. The AWS offline clock remains six hours. The voiceover has been updated to remove the old one-minute claim; this take does not demonstrate an offline background tick.

**Show the actual narration status.** If this take has no generated recap or reactions, replace paragraph 7 with: “Here you can read the story so far. This take is using the built-in narration fallback. The world history is saved in a database, and there's also a viewer page and an overlay the streamer can add to OBS.”

## Finish the video

1. Put clips **1 → 9** in order.
2. Read the nine voiceover paragraphs over their matching clips. Speak naturally; you do not need to talk while operating both accounts.
3. Trim loading waits and window switching. Keep the real chat-to-tally updates visible.
4. Check that the Twitch demo and Codex explanation both fit within the **first three minutes**. Aim to finish under **2:50**.
5. Upload to **YouTube**, choose **Public or Unlisted**, use **no password**, and paste the URL into the submission form.
