import { randomUUID } from "node:crypto";
import {
  DomainError,
  type ChatMessage,
  type FactionId,
  type StoredWorld,
  type WorldRepository,
  type WorldSnapshot,
  type WorldEvent,
} from "./types.js";
export { DomainError } from "./types.js";
const fail = (code: string, message: string, status = 409): never => {
  throw new DomainError(status, code, message);
};
const bounded = (n: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, n));
const clone = <T>(v: T): T => structuredClone(v);
export class WorldService {
  private listeners = new Map<string, Set<(snapshot: WorldSnapshot) => void>>();
  private now: () => number;
  private interval: number;
  private cap: number;
  constructor(
    public repository: WorldRepository,
    options: {
      now?: () => number;
      offlineIntervalMs?: number;
      maxOfflineTicks?: number;
    } = {},
  ) {
    this.now = options.now ?? Date.now;
    this.interval = options.offlineIntervalMs ?? 21600000;
    this.cap = options.maxOfflineTicks ?? 3;
    if (
      this.interval <= 0 ||
      !Number.isFinite(this.interval) ||
      this.cap < 0 ||
      !Number.isInteger(this.cap)
    )
      throw new Error("Invalid offline settings");
  }
  subscribe(id: string, fn: (snapshot: WorldSnapshot) => void) {
    const set = this.listeners.get(id) ?? new Set();
    set.add(fn);
    this.listeners.set(id, set);
    return () => {
      set.delete(fn);
      if (!set.size) this.listeners.delete(id);
    };
  }
  private publish(s: WorldSnapshot) {
    for (const f of this.listeners.get(s.worldId) ?? [])
      try {
        f(clone(s));
      } catch {}
  }
  private snapshot(w: StoredWorld) {
    w.snapshot.recentEvents = w.events.slice(-20);
    return clone(w.snapshot);
  }
  private record(
    w: StoredWorld,
    kind: string,
    summary: string,
    causes: string[] = [],
    effectiveAt = this.now(),
  ): WorldEvent {
    const event = {
      id: randomUUID(),
      sequence: w.events.length + 1,
      episodeNumber:
        w.snapshot.mode === "active"
          ? (w.snapshot.episode?.number ?? null)
          : null,
      kind,
      summary,
      causeEventIds: causes,
      effectiveAt: new Date(effectiveAt).toISOString(),
      processedAt: new Date(this.now()).toISOString(),
    };
    w.events.push(event);
    w.snapshot.revision++;
    return event;
  }
  private owner(w: StoredWorld, ownerId: string) {
    if (w.ownerId !== ownerId)
      fail("FORBIDDEN", "Only the broadcaster can control this world.", 403);
  }
  private async command(
    id: string,
    ownerId: string,
    requestId: string,
    operation: string,
    fn: (w: StoredWorld) => void,
  ) {
    if (!requestId || requestId.length > 128)
      fail(
        "INVALID_REQUEST_ID",
        "A requestId of at most 128 characters is required.",
        422,
      );
    const result = await this.repository.transact(id, (w) => {
      this.owner(w, ownerId);
      const saved = w.requests[requestId];
      if (saved) {
        if (saved.operation !== operation)
          fail(
            "REQUEST_ID_REUSED",
            "Use a different requestId for a different action.",
          );
        return clone(saved.snapshot);
      }
      fn(w);
      const s = this.snapshot(w);
      w.requests[requestId] = { operation, snapshot: s };
      return s;
    });
    this.publish(result);
    return result;
  }
  async createWorld(ownerId: string, name = "Westbridge", rehearsal = false) {
    if (!ownerId || !name.trim() || name.length > 80)
      fail("INVALID_WORLD", "Valid owner and world name required.", 422);
    const id = randomUUID();
    const w: StoredWorld = {
      ownerId,
      snapshot: {
        worldId: id,
        revision: 0,
        name: name.trim(),
        mode: "ready",
        episode: null,
        factions: [
          { id: "red", name: "Red Kingdom", supplies: 50, morale: 60 },
          { id: "blue", name: "Blue Kingdom", supplies: 50, morale: 60 },
        ],
        relationship: { trust: 40, grievance: null, causeEventId: null },
        locations: [
          { id: "red_keep", name: "Red Keep", status: "stable" },
          { id: "blue_keep", name: "Blue Keep", status: "stable" },
          { id: "westbridge", name: "Westbridge", status: "open" },
          { id: "forest", name: "Whispering Wood", status: "stable" },
        ],
        scene: null,
        recap: {
          previously: "A fragile treaty joins Red and Blue.",
          whileAway: "",
          causeEventIds: [],
        },
        recentEvents: [],
        narratorStatus: "fallback",
        twitch: { connection: "disconnected", broadcast: "unknown" },
        rehearsal,
      },
      events: [],
      memberships: {},
      votes: {},
      processedMessages: [],
      requests: {},
      resting: null,
    };
    this.record(w, "world_created", "Red and Blue sign the Westbridge treaty.");
    const created = await this.repository.create(w);
    return this.snapshot(created);
  }
  async getWorld(id: string) {
    const w = await this.repository.get(id);
    if (!w) fail("WORLD_NOT_FOUND", "World not found.", 404);
    return this.snapshot(w!);
  }
  async getSnapshot(id: string) {
    return this.getWorld(id);
  }
  async getOwnerId(id: string) {
    const w = await this.repository.get(id);
    if (!w) fail("WORLD_NOT_FOUND", "World not found.", 404);
    return w!.ownerId;
  }
  async listOwnedWorlds(ownerId: string) {
    return (await this.repository.list())
      .filter((w) => w.ownerId === ownerId)
      .map((w) => this.snapshot(w));
  }
  async history(id: string, before?: number) {
    const w = await this.repository.get(id);
    if (!w) fail("WORLD_NOT_FOUND", "World not found.", 404);
    const events = w!.events
      .filter((e) => before === undefined || e.sequence < before)
      .slice(-50);
    return {
      events,
      nextCursor:
        events.length && events[0].sequence > 1 ? events[0].sequence : null,
    };
  }
  private catchUp(w: StoredWorld) {
    if (w.snapshot.mode !== "resting" || !w.resting) return;
    const due = Math.min(
      this.cap,
      Math.floor((this.now() - w.resting.since) / this.interval),
    );
    while (w.resting.ticks < due) {
      w.resting.ticks++;
      const source = w.snapshot.relationship.causeEventId;
      const blue = w.snapshot.factions.find((f) => f.id === "blue")!;
      blue.morale = bounded(blue.morale - 5);
      if (source)
        w.snapshot.locations.find((l) => l.id === "blue_keep")!.status =
          "preparing";
      const e = this.record(
        w,
        "offline_development",
        source
          ? "Blue prepares retaliation for the broken treaty."
          : "The kingdoms consume supplies during the quiet hours.",
        source ? [source] : [],
        w.resting.since + w.resting.ticks * this.interval,
      );
      if (!source)
        for (const f of w.snapshot.factions)
          f.supplies = bounded(f.supplies - 2);
      w.snapshot.recap.whileAway = e.summary;
      w.snapshot.recap.causeEventIds = [
        ...new Set([...w.snapshot.recap.causeEventIds, e.id]),
      ];
    }
  }
  async tickWorld(id: string) {
    const s = await this.repository.transact(id, (w) => {
      this.catchUp(w);
      return this.snapshot(w);
    });
    this.publish(s);
    return s;
  }
  async tickAll() {
    for (const w of await this.repository.list())
      if (w.snapshot.mode === "resting")
        await this.tickWorld(w.snapshot.worldId);
  }
  async startEpisode(id: string, ownerId: string, requestId: string) {
    return this.command(id, ownerId, requestId, "start", (w) => {
      if (w.snapshot.mode === "active")
        fail("EPISODE_ACTIVE", "An episode is already active.");
      this.catchUp(w);
      const deferred =
        w.snapshot.scene?.round.status === "deferred"
          ? clone(w.snapshot.scene)
          : null;
      w.snapshot.mode = "active";
      w.resting = null;
      w.snapshot.episode = {
        id: randomUUID(),
        number: (w.snapshot.episode?.number ?? 0) + 1,
        status: "active",
      };
      if (deferred) {
        deferred.id = randomUUID();
        deferred.round = {
          ...deferred.round,
          id: randomUUID(),
          status: "prepared",
          openedAt: null,
          closesAt: null,
          tally: Object.fromEntries(deferred.choices.map((c) => [c.id, 0])),
          totalVoters: 0,
        };
        w.snapshot.scene = deferred;
        w.votes[deferred.round.id] = [];
      } else w.snapshot.scene = null;
      this.record(
        w,
        "episode_started",
        `Episode ${w.snapshot.episode.number} begins.`,
      );
    });
  }
  async endEpisode(
    id: string,
    ownerId: string,
    episodeId: string,
    requestId: string,
  ) {
    return this.command(id, ownerId, requestId, "end:" + episodeId, (w) => {
      if (w.snapshot.mode !== "active" || w.snapshot.episode?.id !== episodeId)
        fail("EPISODE_MISMATCH", "This episode is not active.");
      if (
        w.snapshot.scene &&
        ["open", "paused", "prepared"].includes(w.snapshot.scene.round.status)
      )
        w.snapshot.scene.round.status = "deferred";
      w.snapshot.episode!.status = "ended";
      this.record(
        w,
        "episode_ended",
        `Episode ${w.snapshot.episode!.number} ends.`,
      );
      w.snapshot.mode = "resting";
      w.resting = { id: randomUUID(), since: this.now(), ticks: 0 };
    });
  }
  async prepareScene(id: string, ownerId: string, requestId: string) {
    return this.command(id, ownerId, requestId, "prepare", (w) => {
      if (w.snapshot.mode !== "active")
        fail("EPISODE_REQUIRED", "Start an episode first.");
      if (w.snapshot.scene && w.snapshot.scene.round.status !== "resolved")
        fail("ROUND_PENDING", "Finish the current decision first.");
      const retaliation = Boolean(w.snapshot.relationship.grievance);
      const candidates = retaliation
        ? [
            ["pay_reparations", "Offer reparations"],
            ["fortify_bridge", "Fortify the bridge"],
            ["open_talks", "Open peace talks"],
          ]
        : [
            ["honor_treaty", "Honor the treaty"],
            ["break_treaty", "Break the treaty"],
            ["hold_position", "Hold position"],
          ];
      const red = w.snapshot.factions.find((f) => f.id === "red")!;
      const blue = w.snapshot.factions.find((f) => f.id === "blue")!;
      const choices = candidates.filter(([action]) => {
        if (action === "honor_treaty")
          return red.supplies >= 5 && blue.supplies <= 95;
        if (action === "break_treaty")
          return blue.supplies >= 10 && red.supplies <= 90;
        if (action === "pay_reparations")
          return red.supplies >= 8 && blue.supplies <= 92;
        if (action === "open_talks")
          return red.supplies >= 3 && blue.supplies <= 97;
        if (action === "fortify_bridge") return red.supplies >= 5;
        return true;
      });
      if (!choices.length) choices.push(["hold_position", "Hold position"]);
      w.snapshot.scene = {
        id: randomUUID(),
        title: retaliation ? "Blue demands an answer" : "The Westbridge treaty",
        narration: retaliation
          ? "Blue returns to the bridge where the community broke its treaty."
          : "Supplies are scarce. Will the community honor the treaty with Blue?",
        causeEventIds: w.snapshot.relationship.causeEventId
          ? [w.snapshot.relationship.causeEventId]
          : [],
        choices: choices.map(([id, label], i) => ({
          id,
          number: i + 1,
          label,
        })),
        round: {
          id: randomUUID(),
          status: "prepared",
          openedAt: null,
          closesAt: null,
          tally: Object.fromEntries(choices.map(([id]) => [id, 0])),
          totalVoters: 0,
          winningChoiceId: null,
          outcome: null,
        },
      };
      w.votes[w.snapshot.scene.round.id] = [];
      w.snapshot.revision++;
    });
  }
  async openRound(
    id: string,
    ownerId: string,
    roundId: string,
    requestId: string,
    durationSeconds = 45,
  ) {
    if (
      !Number.isInteger(durationSeconds) ||
      durationSeconds < 5 ||
      durationSeconds > 300
    )
      fail("INVALID_DURATION", "Duration must be 5–300 seconds.", 422);
    return this.command(id, ownerId, requestId, "open:" + roundId, (w) => {
      const r = w.snapshot.scene?.round;
      if (
        w.snapshot.mode !== "active" ||
        r?.id !== roundId ||
        r.status !== "prepared"
      )
        fail("ROUND_NOT_PREPARED", "The round is not prepared.");
      r!.status = "open";
      r!.openedAt = new Date(this.now()).toISOString();
      r!.closesAt = new Date(this.now() + durationSeconds * 1000).toISOString();
      w.snapshot.revision++;
    });
  }
  async handleChat(id: string, message: ChatMessage) {
    const s = await this.repository.transact(id, (w) => {
      if (w.processedMessages.includes(message.messageId))
        return this.snapshot(w);
      const time = Date.parse(message.timestamp);
      if (
        !message.messageId ||
        !message.userId ||
        !Number.isFinite(time) ||
        time > this.now() + 5000 ||
        time < this.now() - 600000
      )
        return this.snapshot(w);
      w.processedMessages.push(message.messageId);
      if (w.processedMessages.length > 10000) w.processedMessages.shift();
      const join = /^!join\s+(red|blue)\s*$/i.exec(message.text);
      if (join) {
        if (
          ["open", "paused"].includes(w.snapshot.scene?.round.status ?? "") &&
          w.memberships[message.userId]
        )
          return this.snapshot(w);
        w.memberships[message.userId] = {
          faction: join[1].toLowerCase() as FactionId,
          displayName: message.displayName,
        };
        w.snapshot.revision++;
        return this.snapshot(w);
      }
      const vote = /^!vote\s+([123])\s*$/i.exec(message.text);
      const r = w.snapshot.scene?.round;
      const member = w.memberships[message.userId];
      if (
        !vote ||
        !member ||
        w.snapshot.mode !== "active" ||
        !r ||
        r.status !== "open" ||
        this.now() >= Date.parse(r.closesAt!) ||
        time < Date.parse(r.openedAt!) ||
        time >= Date.parse(r.closesAt!)
      )
        return this.snapshot(w);
      const choice = w.snapshot.scene!.choices.find(
        (c) => c.number === Number(vote[1]),
      );
      if (!choice) return this.snapshot(w);
      const votes = w.votes[r.id];
      const old = votes.find((v) => v.userId === message.userId);
      if (old) {
        r.tally[old.choiceId]--;
        Object.assign(old, {
          choiceId: choice.id,
          displayName: message.displayName,
        });
      } else {
        votes.push({
          userId: message.userId,
          choiceId: choice.id,
          faction: member.faction,
          displayName: message.displayName,
        });
        r.totalVoters++;
      }
      r.tally[choice.id]++;
      w.snapshot.revision++;
      return this.snapshot(w);
    });
    this.publish(s);
    return s;
  }
  async closeRound(
    id: string,
    ownerId: string,
    roundId: string,
    requestId: string,
  ) {
    return this.command(id, ownerId, requestId, "close:" + roundId, (w) => {
      const scene = w.snapshot.scene;
      const r = scene?.round;
      if (r?.id !== roundId)
        fail("ROUND_MISMATCH", "This is not the current round.");
      if (r!.status === "resolved") return;
      if (
        w.snapshot.mode !== "active" ||
        !["open", "paused"].includes(r!.status)
      )
        fail("ROUND_NOT_OPEN", "Open the round before resolving it.");
      r!.status = "resolved";
      const top = Math.max(...Object.values(r!.tally));
      const winners = Object.entries(r!.tally).filter(
        ([, count]) => count === top,
      );
      const action =
        r!.totalVoters > 0 && winners.length === 1 ? winners[0][0] : null;
      r!.winningChoiceId = action;
      r!.outcome = !r!.totalVoters
        ? "no_votes"
        : action
          ? "choice_selected"
          : "tied";
      const red = w.snapshot.factions.find((f) => f.id === "red")!;
      const blue = w.snapshot.factions.find((f) => f.id === "blue")!;
      const transfer = (amount: number) => {
        if (red.supplies < amount || blue.supplies + amount > 100)
          fail("INSUFFICIENT_SUPPLIES", "The transfer is no longer possible.");
        red.supplies -= amount;
        blue.supplies += amount;
      };
      const causes = scene!.causeEventIds;
      let summary = "The council holds its position.";
      if (action === "break_treaty") {
        if (blue.supplies < 10 || red.supplies > 90)
          fail(
            "INSUFFICIENT_SUPPLIES",
            "The treaty cannot be broken with these supplies.",
          );
        blue.supplies -= 10;
        red.supplies += 10;
        w.snapshot.relationship.trust = bounded(
          w.snapshot.relationship.trust - 60,
          -100,
          100,
        );
        w.snapshot.locations.find((l) => l.id === "westbridge")!.status =
          "closed";
        summary = "The community breaks the Westbridge treaty with Blue.";
      } else if (action === "honor_treaty") {
        transfer(5);
        w.snapshot.relationship.trust = bounded(
          w.snapshot.relationship.trust + 10,
          -100,
          100,
        );
        summary = "The community honors the Westbridge treaty.";
      } else if (action === "pay_reparations") {
        transfer(8);
        w.snapshot.relationship.trust = bounded(
          w.snapshot.relationship.trust + 20,
          -100,
          100,
        );
        w.snapshot.relationship.grievance = null;
        w.snapshot.relationship.causeEventId = null;
        w.snapshot.locations.find((l) => l.id === "westbridge")!.status =
          "open";
        summary =
          "The community pays reparations and resolves the treaty grievance.";
      } else if (action === "open_talks") {
        transfer(3);
        w.snapshot.relationship.trust = bounded(
          w.snapshot.relationship.trust + 10,
          -100,
          100,
        );
        summary = "The community opens talks with Blue.";
      } else if (action === "fortify_bridge") {
        if (red.supplies < 5)
          fail("INSUFFICIENT_SUPPLIES", "Red needs supplies to fortify.");
        red.supplies -= 5;
        red.morale = bounded(red.morale + 5);
        w.snapshot.relationship.trust = bounded(
          w.snapshot.relationship.trust - 5,
          -100,
          100,
        );
        summary = "Red fortifies Westbridge while Blue remembers the betrayal.";
      }
      const e = this.record(w, "decision_resolved", summary, causes);
      if (action === "break_treaty") {
        w.snapshot.relationship.grievance = "The Westbridge treaty was broken.";
        w.snapshot.relationship.causeEventId = e.id;
      }
      w.snapshot.recap.previously = summary;
      w.snapshot.recap.causeEventIds = [e.id];
      scene!.narration = summary;
    });
  }
  async setTwitchState(id: string, patch: Partial<WorldSnapshot["twitch"]>) {
    const s = await this.repository.transact(id, (w) => {
      const now = this.now();
      Object.assign(w.snapshot.twitch, patch);
      const r = w.snapshot.scene?.round;
      if (
        patch.connection &&
        patch.connection !== "connected" &&
        r?.status === "open"
      ) {
        w.pausedRound = {
          id: r.id,
          remainingMs: Math.max(0, Date.parse(r.closesAt!) - now),
        };
        r.status = "paused";
      }
      if (patch.broadcast === "offline" && w.snapshot.mode === "active") {
        if (r && ["open", "paused", "prepared"].includes(r.status))
          r.status = "deferred";
        if (w.snapshot.episode) w.snapshot.episode!.status = "ended";
        this.record(
          w,
          "episode_ended",
          "The broadcast ends; the kingdom rests.",
        );
        w.snapshot.mode = "resting";
        w.resting = { id: randomUUID(), since: now, ticks: 0 };
      }
      w.snapshot.revision++;
      return this.snapshot(w);
    });
    this.publish(s);
    return s;
  }
  async setTwitchStatus(id: string, patch: Partial<WorldSnapshot["twitch"]>) {
    return this.setTwitchState(id, patch);
  }
  async resumeRound(
    id: string,
    ownerId: string,
    roundId: string,
    requestId: string,
  ) {
    return this.command(id, ownerId, requestId, "resume:" + roundId, (w) => {
      const r = w.snapshot.scene?.round;
      if (
        w.snapshot.mode !== "active" ||
        r?.id !== roundId ||
        r.status !== "paused" ||
        w.pausedRound?.id !== roundId
      )
        fail("ROUND_NOT_PAUSED", "This round is not paused.");
      if (w.snapshot.twitch.connection !== "connected")
        fail("CHAT_DISCONNECTED", "Reconnect chat before resuming.");
      r!.status = "open";
      r!.openedAt = new Date(this.now()).toISOString();
      r!.closesAt = new Date(
        this.now() + w.pausedRound!.remainingMs,
      ).toISOString();
      delete w.pausedRound;
      w.snapshot.revision++;
    });
  }
  async resolveDueRounds() {
    for (const w of await this.repository.list()) {
      const r = w.snapshot.scene?.round;
      if (
        w.snapshot.mode === "active" &&
        r?.status === "open" &&
        Date.parse(r.closesAt!) <= this.now()
      ) {
        try {
          await this.closeRound(
            w.snapshot.worldId,
            w.ownerId,
            r.id,
            "timeout:" + r.id,
          );
        } catch (e) {
          if (!(e instanceof DomainError && e.status === 409)) throw e;
        }
      }
    }
  }
  async applyNarration(
    id: string,
    sceneId: string,
    result: {
      narration: string;
      title?: string;
      sceneTitle?: string;
      choiceLabels?: { actionId: string; label: string }[];
      referencedEventIds?: string[];
    },
    fallback = false,
  ) {
    const s = await this.repository.transact(id, (w) => {
      const scene = w.snapshot.scene;
      if (!scene || scene.id !== sceneId || scene.round.status !== "prepared")
        return this.snapshot(w);
      if (
        typeof result.narration !== "string" ||
        !result.narration.trim() ||
        result.narration.length > 2000
      )
        fail("INVALID_NARRATION", "Narration must be concise.", 422);
      for (const ref of result.referencedEventIds ?? [])
        if (!w.events.some((e) => e.id === ref))
          fail(
            "INVALID_REFERENCE",
            "Narration references an unknown historical event.",
            422,
          );
      for (const label of result.choiceLabels ?? []) {
        const choice = scene.choices.find((c) => c.id === label.actionId);
        if (
          !choice ||
          typeof label.label !== "string" ||
          !label.label.trim() ||
          label.label.length > 120
        )
          fail("INVALID_CHOICE", "Narration changed a canonical choice.", 422);
        choice!.label = label.label;
      }
      scene.narration = result.narration;
      const title = result.sceneTitle ?? result.title;
      if (title) {
        if (title.length > 120)
          fail("INVALID_TITLE", "Scene title is too long.", 422);
        scene.title = title;
      }
      w.snapshot.narratorStatus = fallback ? "fallback" : "idle";
      w.snapshot.revision++;
      return this.snapshot(w);
    });
    this.publish(s);
    return s;
  }
}
