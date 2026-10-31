import { randomUUID } from "node:crypto";
import {
  DomainError,
  type ChatMessage,
  type FactionId,
  type StoredWorld,
  type WorldRepository,
  type WorldSnapshot,
  type WorldEvent,
  type ContributionCredit,
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
  private actionEligible(w: StoredWorld, action: string) {
    const red = w.snapshot.factions.find((f) => f.id === "red")!;
    const blue = w.snapshot.factions.find((f) => f.id === "blue")!;
    switch (action) {
      case "share_surplus":
        return (
          Math.abs(red.supplies - blue.supplies) >= 10 &&
          Math.max(red.supplies, blue.supplies) >= 10 &&
          Math.min(red.supplies, blue.supplies) <= 90
        );
      case "forage_forest":
        return red.supplies < 100 || blue.supplies < 100;
      case "honor_treaty":
        return red.supplies >= 5 && blue.supplies <= 95;
      case "break_treaty":
        return blue.supplies >= 10 && red.supplies <= 90;
      case "pay_reparations":
        return (
          Boolean(w.snapshot.relationship.grievance) &&
          red.supplies >= 8 &&
          blue.supplies <= 92
        );
      case "open_talks":
        return (
          Boolean(w.snapshot.relationship.grievance) &&
          red.supplies >= 3 &&
          blue.supplies <= 97
        );
      case "fortify_bridge":
        return Boolean(w.snapshot.relationship.grievance) && red.supplies >= 5;
      case "hold_position":
        return true;
      default:
        return false;
    }
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
      if (!source) {
        const before = w.snapshot.factions.map((f) => f.supplies);
        for (const f of w.snapshot.factions)
          f.supplies = bounded(f.supplies - 2);
        if (w.snapshot.factions.some((f, i) => f.supplies !== before[i]))
          w.lastResourceEventId = e.id;
      }
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
      delete w.snapshot.recap.generationStatus;
      w.snapshot.recap.contributionCredits = [];
      if (deferred) {
        deferred.choices = deferred.choices
          .filter((c) => this.actionEligible(w, c.id))
          .map((c, i) => ({ ...c, number: i + 1 }));
        if (!deferred.choices.length)
          deferred.choices = [
            { id: "hold_position", number: 1, label: "Hold position" },
          ];
        deferred.id = randomUUID();
        delete deferred.leaderReactions;
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
      w.snapshot.recap.whileAway = "";
    });
  }
  async prepareScene(id: string, ownerId: string, requestId: string) {
    return this.command(id, ownerId, requestId, "prepare", (w) => {
      if (w.snapshot.mode !== "active")
        fail("EPISODE_REQUIRED", "Start an episode first.");
      if (w.snapshot.scene && w.snapshot.scene.round.status !== "resolved")
        fail("ROUND_PENDING", "Finish the current decision first.");
      const red = w.snapshot.factions.find((f) => f.id === "red")!;
      const blue = w.snapshot.factions.find((f) => f.id === "blue")!;
      const crisis = Math.min(red.supplies, blue.supplies) <= 20;
      const retaliation = Boolean(w.snapshot.relationship.grievance);
      const encounterId = crisis
        ? "resource_crisis"
        : retaliation
          ? "retaliation"
          : "treaty";
      const candidates = crisis
        ? [
            ["share_surplus", "Share surplus supplies"],
            ["forage_forest", "Forage in Whispering Wood"],
            ["hold_position", "Hold position"],
          ]
        : retaliation
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
      const choices = candidates.filter(([action]) =>
        this.actionEligible(w, action),
      );
      if (!choices.length) choices.push(["hold_position", "Hold position"]);
      w.snapshot.scene = {
        id: randomUUID(),
        encounterId,
        title: crisis
          ? "The stores are running low"
          : retaliation
            ? "Blue demands an answer"
            : "The Westbridge treaty",
        narration: crisis
          ? "Supplies are running low. Will the kingdoms share their stores, search the forest, or wait?"
          : retaliation
            ? "Blue returns to the bridge where the community broke its treaty."
            : "A fragile treaty joins Red and Blue. Will the community honor it?",
        causeEventIds: crisis
          ? [
              ...new Set(
                [
                  w.lastResourceEventId,
                  w.snapshot.relationship.causeEventId,
                ].filter((id): id is string => Boolean(id)),
              ),
            ]
          : w.snapshot.relationship.causeEventId
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
      // A live world without chat would spend its voting window with nobody able to vote.
      if (!w.snapshot.rehearsal && w.snapshot.twitch.connection !== "connected")
        fail("CHAT_DISCONNECTED", "Reconnect chat before opening voting.");
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
        // Chat can arrive out of order: an older message never replaces a newer vote.
        // Equal timestamps keep delivery order (the later delivery wins).
        if (old.at !== undefined && time < old.at) return this.snapshot(w);
        r.tally[old.choiceId]--;
        Object.assign(old, {
          choiceId: choice.id,
          displayName: message.displayName,
          at: time,
        });
      } else {
        votes.push({
          userId: message.userId,
          choiceId: choice.id,
          faction: member.faction,
          displayName: message.displayName,
          at: time,
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
      const beforeSupplies = [red.supplies, blue.supplies];
      const knownActions = [
        "break_treaty",
        "honor_treaty",
        "pay_reparations",
        "open_talks",
        "fortify_bridge",
        "share_surplus",
        "forage_forest",
        "hold_position",
      ];
      if (
        action &&
        (!knownActions.includes(action) ||
          !scene!.choices.some((c) => c.id === action))
      )
        fail(
          "INVALID_ACTION",
          "The selected action is not valid for this scene.",
          422,
        );
      if (action && !this.actionEligible(w, action))
        fail(
          "ACTION_UNAVAILABLE",
          "The selected action no longer satisfies its world preconditions.",
        );
      const transfer = (amount: number) => {
        if (red.supplies < amount || blue.supplies + amount > 100)
          fail("INSUFFICIENT_SUPPLIES", "The transfer is no longer possible.");
        red.supplies -= amount;
        blue.supplies += amount;
      };
      const causes = scene!.causeEventIds;
      let summary = "The council holds its position.";
      if (action === "share_surplus") {
        const donor = red.supplies > blue.supplies ? red : blue;
        const receiver = donor === red ? blue : red;
        if (
          donor.supplies - receiver.supplies < 10 ||
          donor.supplies < 10 ||
          receiver.supplies > 90
        )
          fail(
            "INSUFFICIENT_SUPPLIES",
            "There is no eligible surplus to share.",
          );
        donor.supplies -= 10;
        receiver.supplies += 10;
        donor.morale = bounded(donor.morale - 2);
        receiver.morale = bounded(receiver.morale + 5);
        w.snapshot.relationship.trust = bounded(
          w.snapshot.relationship.trust + 8,
          -100,
          100,
        );
        summary = `${donor.name} shares ten supplies with ${receiver.name}.`;
      } else if (action === "forage_forest") {
        if (red.supplies === 100 && blue.supplies === 100)
          fail("RESOURCE_CAPACITY", "The kingdoms already have full stores.");
        for (const faction of [red, blue]) {
          faction.supplies = bounded(faction.supplies + 8);
          faction.morale = bounded(faction.morale - 3);
        }
        w.snapshot.locations.find((l) => l.id === "forest")!.status =
          "foraging";
        summary =
          "The kingdoms forage in Whispering Wood, replenishing supplies at a cost to morale.";
      } else if (action === "break_treaty") {
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
        // The grievance was Blue's only reason to prepare retaliation.
        const keep = w.snapshot.locations.find((l) => l.id === "blue_keep")!;
        if (keep.status === "preparing") keep.status = "stable";
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
      w.contributionHistory ??= {};
      w.contributionHistory[e.id] = clone(w.votes[r!.id] ?? []);
      if (
        red.supplies !== beforeSupplies[0] ||
        blue.supplies !== beforeSupplies[1]
      )
        w.lastResourceEventId = e.id;
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
        w.snapshot.recap.whileAway = "";
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
      leaderReactions?: { factionId: FactionId; text: string }[];
    },
    fallback = false,
  ) {
    const s = await this.repository.transact(id, (w) => {
      const scene = w.snapshot.scene;
      if (
        !scene ||
        scene.id !== sceneId ||
        scene.round.status !== "prepared" ||
        scene.leaderReactions !== undefined
      )
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
      if (result.leaderReactions) {
        if (
          result.leaderReactions.length > 2 ||
          new Set(result.leaderReactions.map((r) => r.factionId)).size !==
            result.leaderReactions.length ||
          result.leaderReactions.some(
            (r) =>
              !["red", "blue"].includes(r.factionId) ||
              typeof r.text !== "string" ||
              !r.text.trim() ||
              r.text.length > 300,
          )
        )
          fail(
            "INVALID_LEADER_REACTION",
            "Leader reactions must reference known factions once each.",
            422,
          );
        scene.leaderReactions = clone(result.leaderReactions);
      }
      scene.leaderReactions ??= [];
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
  private recordedContributions(w: StoredWorld): ContributionCredit[] {
    return w.events.flatMap((event) =>
      (w.contributionHistory?.[event.id] ?? []).map((vote) => ({
        displayName: vote.displayName,
        factionId: vote.faction,
        choiceId: vote.choiceId,
        sourceEventId: event.id,
        summary: `${vote.displayName} voted for ${vote.choiceId.replaceAll("_", " ")} in episode ${event.episodeNumber}. ${event.summary}`,
      })),
    );
  }
  async getNarratorMemory(id: string) {
    const w = await this.repository.get(id);
    if (!w) fail("WORLD_NOT_FOUND", "World not found.", 404);
    const world = w!;
    const number = world.snapshot.episode?.number ?? 0;
    const previousEpisodeEvents = world.events
      .filter((e) => e.episodeNumber === number - 1)
      .slice(-20);
    const previousEnd = world.events.findLast(
      (e) =>
        e.kind === "episode_ended" &&
        e.episodeNumber !== null &&
        e.episodeNumber < number,
    );
    const currentStart = world.events.findLast(
      (e) => e.kind === "episode_started" && e.episodeNumber === number,
    );
    const offlineEvents = world.events.filter(
      (e) =>
        e.kind === "offline_development" &&
        e.sequence > (previousEnd?.sequence ?? 0) &&
        (!currentStart || e.sequence < currentStart.sequence),
    );
    const causeIds = new Set(
      [
        world.snapshot.relationship.causeEventId,
        ...(world.snapshot.scene?.causeEventIds ?? []),
      ].filter(Boolean),
    );
    const relevant = [
      ...new Map(
        [
          ...world.events.slice(-5),
          ...world.events.filter((e) => causeIds.has(e.id)),
          ...previousEpisodeEvents,
          ...offlineEvents,
        ].map((e) => [e.id, e]),
      ).values(),
    ].sort((a, b) => a.sequence - b.sequence);
    const contributions = this.recordedContributions(world)
      .filter((c) => relevant.some((e) => e.id === c.sourceEventId))
      .slice(-3);
    return {
      events: clone(relevant),
      contributions,
      previousEpisodeEvents: clone(previousEpisodeEvents),
      offlineEvents: clone(offlineEvents),
      episodeId: world.snapshot.episode?.id ?? null,
      revision: world.snapshot.revision,
      facts: this.snapshot(world),
      fallbackPreviously:
        previousEpisodeEvents.findLast((e) => e.kind === "decision_resolved")
          ?.summary ??
        world.events[0]?.summary ??
        "",
      fallbackWhileAway: offlineEvents.at(-1)?.summary ?? "",
    };
  }
  async applyRecap(
    id: string,
    episodeId: string,
    result: {
      previously: string;
      whileAway: string;
      referencedEventIds: string[];
      contributionCredits: ContributionCredit[];
    },
    fallback = false,
  ) {
    const s = await this.repository.transact(id, (w) => {
      if (
        w.snapshot.mode !== "active" ||
        w.snapshot.episode?.id !== episodeId ||
        w.snapshot.recap.generationStatus !== undefined
      )
        return this.snapshot(w);
      if (
        typeof result.previously !== "string" ||
        typeof result.whileAway !== "string" ||
        result.previously.length > 1200 ||
        result.whileAway.length > 800
      )
        fail("INVALID_RECAP", "Recaps must be concise.", 422);
      const refs = new Set(result.referencedEventIds);
      if (
        result.referencedEventIds.some(
          (ref) => !w.events.some((e) => e.id === ref),
        )
      )
        fail(
          "INVALID_REFERENCE",
          "Recap references an unknown historical event.",
          422,
        );
      const canonical = this.recordedContributions(w);
      if (
        result.contributionCredits.length > 3 ||
        result.contributionCredits.some(
          (c) =>
            !refs.has(c.sourceEventId) ||
            !canonical.some(
              (real) =>
                real.displayName === c.displayName &&
                real.factionId === c.factionId &&
                real.choiceId === c.choiceId &&
                real.sourceEventId === c.sourceEventId &&
                real.summary === c.summary,
            ),
        )
      )
        fail(
          "INVALID_CONTRIBUTION",
          "Recap credits must match recorded votes.",
          422,
        );
      const seen = new Set<string>();
      const credits = result.contributionCredits.filter((c) => {
        const key = JSON.stringify([
          c.displayName,
          c.factionId,
          c.choiceId,
          c.sourceEventId,
        ]);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      w.snapshot.recap = {
        previously: result.previously,
        whileAway: result.whileAway,
        causeEventIds: [...refs],
        contributionCredits: clone(credits),
        generationStatus: fallback ? "fallback" : "generated",
      };
      w.snapshot.revision++;
      return this.snapshot(w);
    });
    this.publish(s);
    return s;
  }
}
