**Recommendation: build Raid Parcel (working title).**  
**Pitch: “Chat builds the boss. The raid delivers it.”**

Research date: **28 October 2026, Asia/Kolkata**. This recommendation assumes a solo builder with roughly six calendar days remaining. Team capacity, available hours, and access to creators have not yet been confirmed. This is a project selection and competition strategy, not an implementation or a submission.

I read all three supplied files in `codex/`: `overview.txt`, `full_rules.txt`, and `resources.txt`. There is no `/context` directory in the current workspace. I then retrieved the live event overview, formal rules, judging criteria, dates, prizes, submission requirements, and latest announcement through the Devpost connector. I researched Twitch’s prior winners, publicly discoverable projects in this event, adjacent products, and official integration documentation.

The evidence supports a focused, entertaining Twitch experience with a visibly original interaction and convincing working footage. It does not support a claim that any idea guarantees first place. The complete current competitor field is unavailable: the event gallery is unpublished. Three independently published project pages were discoverable through search; those are examples, not a census.

**What the competition rewards**

The live criteria use a five-point scale and four equally weighted categories. The formal rules put Innovation/Idea first in the tiebreak order, followed by the remaining listed criteria. This makes a recognizable difference from existing products valuable, but cannot compensate for weak execution across the other categories. [Official criteria and rules, §6](https://twitchcon-codex.devpost.com/rules)

| Official criterion | Weight | Evidence our entry should provide |
| --- | --- | --- |
| Innovation/Idea | 25% | A community authors an encounter that becomes another community’s playable content through a Twitch raid. |
| Potential Impact | 25% | Creators and viewers actually use the experience; viewers understand their contribution and want another round. |
| Technological implementation | 25% | Real Twitch events change real game state reliably, with specific evidence of how Codex helped build and improve it. |
| Design | 25% | A new viewer understands the scene quickly, sees the consequences of chat decisions, and enjoys watching the streamer react. |

These are our proposed proofs, not predicted judge scores. There is no published separate prize for the most AI calls, most APIs, largest codebase, most features, or most complicated architecture. The latest organizer announcement explicitly says projects do not need every Twitch tool and directs builders to start from the intended experience. [Event overview](https://twitchcon-codex.devpost.com/) · [Organizer updates](https://twitchcon-codex.devpost.com/updates)

**Why the organizers are holding it**

The stated purpose is to use Codex to build useful or creative experiences for Twitch streamers and their communities. The five finalists are intended for a TwitchCon booth showcase. Twitch has previously described third-party development as essential to its communities. [Event overview](https://twitchcon-codex.devpost.com/) · [Twitch’s 2024 winners announcement](https://discuss.dev.twitch.com/t/streamer-tools-hackathon-2024-winners-and-runner-ups/61823)

My inference is that the event serves three connected goals:

1. **Twitch ecosystem development:** bring more people into building experiences that make live streams participatory.
2. **Codex adoption:** demonstrate that a creator or small team can turn an idea into working software. The live submission form also asks about skills learned and likelihood of using Codex again, which supports this interpretation.
3. **A public showcase:** produce understandable, entertaining examples that work well on a TwitchCon stage.

These are evidence-based interpretations, not knowledge of private sponsor motives or undisclosed scoring. Sponsor fit helps us choose an appropriate project; the published rubric remains the target. The legal sponsor being Amazon Advertising LLC is not evidence that judges want an advertising product. [Submission form](https://devpost.com/submit-to/31742-codex-x-twitchcon-hackathon/manage/submissions) · [Formal rules, §2](https://twitchcon-codex.devpost.com/rules)

**What the competitive research changed**

| Direction considered | Evidence found | Decision |
| --- | --- | --- |
| Two communities fight one another | PixelWars won Twitch’s 2024 Interactive Community Experiences category. | Head-to-head audience combat already has a strong precedent. |
| Cooperative escape room with information split between streamer and chat | HEIST is publicly listed as submitted to this event and describes that interaction. | A poor choice if our only distinction is a new theme. |
| Chat votes create an evolving story | Chat Relay Studio is publicly listed for this event and describes live voting and a story overlay. | A generic shared story overlay would face direct overlap. |
| Chat cooperates to save a ship through scan/shield/boost choices | SignalCrew is publicly listed for this event. | Cooperative resource voting alone is insufficient differentiation. |
| Persistent viewer world or RPG | Riftfarer advertises persistent Twitch worlds; Ravenfall and Chat Warriors cover viewer characters, progression, and cooperative combat. | Persistence, avatars, and boss fights alone do not establish novelty. |
| A raid triggers a boss | Automanyaco advertises a raid event that turns the raiding creator into a boss. Streamlabs also offers a Stream Boss widget. | “Raid arrives, boss appears” is already established. |
| Relay a game’s progress across channels | Save&Raid describes passing a save file and viewers between streamers. | Cross-channel continuity itself is also established. |
| Assistive event summaries for blind and low-vision creators | A University of Washington project documents this need and an early prototype. | Promising impact, but needs direct accessibility partner validation we have not established. |

Sources: [PixelWars and other 2024 winners](https://discuss.dev.twitch.com/t/streamer-tools-hackathon-2024-winners-and-runner-ups/61823), [HEIST](https://devpost.com/software/heist-2nxbmq), [Chat Relay Studio](https://devpost.com/software/chat-relay-studio), [SignalCrew](https://devpost.com/software/signalcrew), [Riftfarer](https://riftfarer.com/), [Ravenfall](https://www.ravenfall.stream/), [Chat Warriors](https://www.chatwarriors.com/), [Automanyaco’s raid boss blueprint](https://ko-fi.com/s/7836c13f15), [Stream Boss](https://streamlabs.com/stream-widgets/stream-boss), [Save&Raid](https://saveandraid.org/news/press-release-annual-twitch-charity-event-saveandraid-gearing-up-for-its-3rd-outing), [UW accessibility project](https://courses.cs.washington.edu/courses/cse513/25au/projects/streaming/).

The product pages above are descriptions by their authors, not independent verification that the products work as advertised. I did not run those projects or audit their code. The Automanyaco listing was available through indexed text; direct opening returned HTTP 403. The official winners announcement establishes historical award results, not the preferences of this event’s unnamed judges.

**The project we should make**

Raid Parcel turns a stream’s closing moments into a short act of creation, and gives a receiving community a shared activity when the raid arrives.

A typical session:

1. **Build:** Streamer A opens a short boss workshop. Chat chooses a visual body and an actual attack pattern through normal Twitch chat. Votes immediately change the preview.
2. **Seal:** A approves the finished encounter and chooses a recipient who has opted into the app. The boss card credits the creating community.
3. **Deliver:** A initiates a normal Twitch raid. A confirmed `channel.raid` event makes that exact encounter available to B. The app does not move viewers itself.
4. **Accept:** B sees the parcel and chooses when to start. It does not interrupt their current content automatically.
5. **Fight:** B plays a short browser arena encounter while viewers contribute a clearly visible cooperative ability, such as charging a shield. The creator’s movement handles quick reactions; chat decisions use generous windows.
6. **Remix:** After the encounter, B’s community changes one property and prepares the next parcel. Its history shows who created, defeated, and remixed it.

The intended memorable moment is concrete: **“That ridiculous attack we chose in one channel is now the thing another streamer has to dodge.”**

The proposed distinction is the complete **author → confirmed raid → play → remix** loop. A transferable encounter includes meaningful gameplay choices and its creator history. An animation, health bar, or renamed default enemy would not deliver that distinction.

I found precedents for the individual ingredients. I did not find an exact match for this full interaction in the sources reviewed. That is a qualified differentiation claim, not a claim of world-first invention. We should acknowledge adjacent tools honestly in the write-up.

The initial audience should be **small variety streamers who already raid one another**, rather than every Twitch category. Our value hypothesis is that creating a challenge gives departing viewers a reason to follow the handoff and gives the receiving community something to do together. Neither retention gains nor market demand has been measured yet. Participation remains free; a short play loop should work with a handful of viewers.

**The minimum build that can compete**

Prioritize these deliverables:

- One polished arena and a short fight, with a clear win/loss outcome.
- Three visual bodies, three distinct attack patterns, and one cooperative chat ability. Each available combination must remain playable.
- A workshop with visible previews and one counted choice per account per round.
- Streamer authorization, normal chat input, and real raid-event delivery between two opted-in channels.
- A recipient accept/start control, pause/reset, and a clear connection state.
- One preserved encounter record and one remix step.
- A browser game/control page plus a read-only OBS scene; both display the same authoritative match state.
- A clearly labeled rehearsal/replay mode so judges can explore the product outside a coordinated live session.

A demonstration must show at least one complete A-to-B delivery. A third live channel is unnecessary: showing B’s remix prepared for its next destination closes the product story.

Avoid expanding into an RPG, public matchmaking, a marketplace, account inventories, monetization, multiple arenas, or a large procedural world. Extra modules should wait until the original loop works and is enjoyable. Live generated code is also unnecessary. If free-text theme interpretation is added later, it should select validated components; the game should still work without a model service.

The event’s requirement is to build with Codex and connect to Twitch. The sources do not add a requirement to run an LLM during gameplay. Our Codex evidence should show substantive implementation, debugging, and verification work. [Project requirements and technology criterion](https://twitchcon-codex.devpost.com/rules)

**Feasibility and the technical traps**

The suggested implementation is a small TypeScript application: a browser game, a creator control interface, an OBS scene, one server, durable encounter records, and a Twitch adapter. This is an architectural proposal, not a measured estimate of development time.

| Finding from official documentation | Consequence for the design |
| --- | --- |
| Twitch supports chat messages through EventSub and recommends EventSub/API for modern chat integrations. | Use real chat events; choose and document the authorization approach during the first integration spike. |
| `channel.raid` reports source, destination, and viewer count. It does not enumerate individual raiders. | Transfer a channel’s encounter; do not claim to identify every incoming viewer or automatically divide them into teams. |
| Starting a raid and confirming a completed raid are different. | Trigger delivery from the raid notification, not the request to start a raid. Using Twitch’s normal raid UI is sufficient for the first version. |
| EventSub may deliver a notification more than once. | A duplicated event must not create a second parcel or restart a fight. |
| An ordinary WebSocket disconnection disables its subscriptions; Twitch also provides a managed reconnect procedure. | Preserve game state, show an interruption, and handle reconnection deliberately. Do not advertise recovery of events that were never received. |
| Extension review is currently expected to take 8–14 days. | Use a browser source for this deadline. |
| OBS can display a web page through Browser Source. | Make setup a URL and a short scene checklist; test the real OBS renderer. |

Sources: [Chat documentation](https://dev.twitch.tv/docs/chat/), [chat authentication and transports](https://dev.twitch.tv/docs/chat/authenticating/), [raid event payload](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelraid), [raid API](https://dev.twitch.tv/docs/api/reference/#start-a-raid), [EventSub duplicate delivery](https://dev.twitch.tv/docs/eventsub/), [WebSocket lifecycle](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [Extension lifecycle](https://dev.twitch.tv/docs/extensions/life-cycle/), [OBS Browser Source](https://obsproject.com/kb/browser-source).

Fast reaction controls should stay local to the creator’s browser. Chat chooses strategic support through longer, playtested windows; aiming or dodging through Twitch chat would make stream delay part of the control loop.

The largest risk is coordination: the distinguishing feature needs two live, authorized channels. Secure those accounts and schedule a real test early. Self-controlled accounts can prove integration, but they do not establish adoption by independent creators. Twitch app registration also requires a verified email and two-factor authentication. [App registration](https://dev.twitch.tv/docs/authentication/register-app/)

**Evidence that would make this a serious first-place attempt**

The following are proposed acceptance targets, not existing results or official thresholds:

| Target before submission | What it establishes |
| --- | --- |
| Two independent creators complete setup and one authentic raid handoff. | The product works outside the developer’s own happy path. |
| Five or more distinct viewers can participate in a short test. | The experience has at least modest community evidence. |
| A viewer can explain their action and its effect after one round. | Comprehensibility, rather than merely a polished screenshot. |
| A creator sets up the scene in roughly three minutes without developer intervention. | A credible ease-of-use claim. |
| The selected attack visibly survives the transfer unchanged. | Delivery of authored content rather than an unrelated raid animation. |
| Duplicate-event and reconnect tests preserve the encounter correctly. | Reliability under relevant integration failure modes. |
| A test at low participation and a separately labeled synthetic load test both behave sensibly. | The design does not depend on chat spam or a large audience. |
| At least one creator asks to play again or volunteers a concrete future use. | Early qualitative usefulness, without claiming proven retention. |

Record what actually happens, including failures and changes made afterward. Keep real viewer participation, developer-operated accounts, and simulated load separate in every claim. A small successful pilot is evidence; it is not a statistically reliable estimate of growth or retention.

For the Codex portion, preserve the primary build thread and collect two or three real examples: implementing the transferable encounter model, diagnosing duplicate delivery, and improving readability from a screenshot. Show the prompt, resulting change, and observed improvement. A session ID alone satisfies a form field but tells a weak technical story.

**The three-minute demo**

Target **2:45**, leaving margin beneath the formal video guidance.

| Time | Footage and message |
| --- | --- |
| 0:00–0:12 | Open with the complete hook: chat designs an attack, the boss arrives in another channel, the recipient reacts. |
| 0:12–0:30 | Explain the two-creator use case and show the actual workshop choices. |
| 0:30–1:10 | Show genuine Twitch chat changing the preview, then the authentic raid and parcel arrival. Compress waiting time with visible edits. |
| 1:10–1:45 | Show the recipient accepting, the chosen attack working, chat support, and a clear outcome. |
| 1:45–2:00 | Show one remix and the community history. |
| 2:00–2:25 | Show specific Codex development and debugging evidence. |
| 2:25–2:45 | Show simple setup, the real pilot result, and the finished product’s availability. |

Use readable footage of real Twitch operation. Mark replay or rehearsal footage when used. Do not imply that an edited sequence is one continuous take. The rules allow judges to evaluate the supplied materials without running the project, so the video must establish the complete value and working behavior. [Testing and video requirements, §4](https://twitchcon-codex.devpost.com/rules)

A suitable opening line is: **“Chat authors a playable boss, and a real Twitch raid delivers it to another streamer. Watch this community’s creation arrive and fight.”** Only use that line after the feature works as shown.

**Execution schedule**

| Date, IST | Deliverable and decision |
| --- | --- |
| Oct 28 | Confirm access to two channels, register the app, receive real chat and raid events, and prototype the fight. Validate that the interaction is understandable before investing in artwork. |
| Oct 29 | Complete the whole loop with simple visuals: build, seal, deliver, accept, fight, record result. |
| Oct 30 | Add the minimal visual and attack catalog, clear OBS presentation, and one remix. |
| Oct 31 | Test with creators/viewers; fix confusion, pacing, and integration failures. |
| Nov 1 | Freeze features, record authentic footage, finish setup instructions, and prepare an early submission. |
| Nov 2 | Verify clean setup, judge access, video visibility, required fields, and submitted status. Reserve time for defects. |

The live deadline field is **2026-11-02 22:00 UTC = November 2, 2:00 PM PST = November 3, 3:30 AM IST**. Set a personal submission target at least 24 hours earlier. The FAQ’s “9:00 PM UTC” conversion conflicts with that field and with November’s Pacific offset; do not use that FAQ conversion. [Official event](https://twitchcon-codex.devpost.com/)

There is another discrepancy: the connector’s structured judging dates indicate Nov 3–6 Pacific, while its formal rules and FAQ state Nov 5–15. Preserve testing availability through the later stated end, and seek an organizer clarification if an operational decision depends on the shorter window. This does not change the consistent submission deadline. The fetched values are preserved in `official-event-snapshot-2026-10-28.json`; future decisions should recheck live sources.

If two-channel access or the first real raid handoff is still unresolved after the early integration work, reassess this recommendation before spending the remaining days on polish. A single-channel workshop can still function, but removing delivery removes the main proposed competitive distinction. If the complete loop works but is hard to understand, simplify it before adding more content.

**Submission work that must survive the final rush**

The live form explicitly requests a repository URL, the principal Codex session ID, an explanation of the technology requirement, and an explanation of how streamers and viewers use the project. The required materials also include a description and a YouTube demonstration. Private repositories need the specified judge access. A deployed product is useful for judging, although the connector does not mark a website URL as mandatory. [Submission requirements](https://twitchcon-codex.devpost.com/) · [Submission form](https://devpost.com/submit-to/31742-codex-x-twitchcon-hackathon/manage/submissions)

The formal rule says: “Projects must be newly created during the Submission Period.” Preserve original work history and licensed asset provenance. Provide reproducible setup and a frozen submission version; review the full rules for eligibility and all obligations. No registration, rules acknowledgement, or submission has been performed during this research. [Formal rules, §§3–5](https://twitchcon-codex.devpost.com/rules)

**Decision:** choose Raid Parcel if we can secure and prove its two-channel loop immediately. It is my strongest current recommendation because it offers a clear authored contribution, a Twitch-specific handoff, visible streamer entertainment, and a small enough core to polish. First place will depend on how well that promise survives real use and how clearly the submission demonstrates it.

