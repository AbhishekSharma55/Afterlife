import test from "node:test";
import assert from "node:assert/strict";
import { WorldService, DomainError } from "../src/domain/world-service.js";
import { MemoryWorldRepository } from "../src/db/memory-repository.js";
function setup() {
  let now = Date.parse("2026-10-30T00:00:00Z");
  const repository = new MemoryWorldRepository();
  const service = new WorldService(repository, {
    now: () => now,
    offlineIntervalMs: 1000,
  });
  return {
    service,
    repository,
    advance: (n: number) => (now += n),
    now: () => new Date(now).toISOString(),
  };
}
async function opened(ctx: ReturnType<typeof setup>) {
  const { service: s } = ctx;
  const world = await s.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await s.setTwitchState(world.worldId, { connection: "connected" });
  const id = world.worldId;
  await s.startEpisode(id, "owner", "start");
  const scene = await s.prepareScene(id, "owner", "prepare");
  const round = scene.scene!.round.id;
  await s.openRound(id, "owner", round, "open");
  return { id, round };
}
async function chat(
  ctx: ReturnType<typeof setup>,
  id: string,
  user: string,
  text: string,
  messageId = crypto.randomUUID(),
) {
  return ctx.service.handleChat(id, {
    messageId,
    userId: user,
    displayName: user,
    text,
    timestamp: ctx.now(),
  });
}
test("betrayal remains canonical across new service and causes offline retaliation in episode two", async () => {
  const ctx = setup();
  const { id, round } = await opened(ctx);
  await chat(ctx, id, "alice", "!join red");
  await chat(ctx, id, "alice", "!vote 2");
  const result = await ctx.service.closeRound(id, "owner", round, "close");
  assert.equal(result.relationship.trust, -20);
  assert.equal(result.factions[0].supplies, 60);
  const cause = result.relationship.causeEventId;
  assert.ok(cause);
  await ctx.service.endEpisode(id, "owner", result.episode!.id, "end");
  ctx.advance(1000);
  const resumed = new WorldService(ctx.repository, {
    now: () => Date.parse(ctx.now()),
    offlineIntervalMs: 1000,
  });
  await resumed.tickWorld(id);
  await resumed.startEpisode(id, "owner", "start2");
  const second = await resumed.prepareScene(id, "owner", "prepare2");
  assert.equal(second.episode!.number, 2);
  assert.equal(second.relationship.trust, -20);
  assert.ok(second.scene!.causeEventIds.includes(cause!));
  assert.equal(second.scene!.choices[0].id, "pay_reparations");
  const history = await resumed.history(id);
  assert.ok(
    history.events.some(
      (e) =>
        e.kind === "offline_development" && e.causeEventIds.includes(cause!),
    ),
  );
});
test("one effective vote per identity, replacements, delivery deduplication and membership requirements", async () => {
  const ctx = setup();
  const { id } = await opened(ctx);
  await chat(ctx, id, "ghost", "!vote 2");
  await chat(ctx, id, "alice", "!join red");
  await chat(ctx, id, "alice", "!vote 2", "same-message");
  await chat(ctx, id, "alice", "!vote 1");
  await chat(ctx, id, "alice", "!vote 2", "same-message");
  const s = await ctx.service.getWorld(id);
  assert.equal(s.scene!.round.totalVoters, 1);
  assert.equal(s.scene!.round.tally.honor_treaty, 1);
  assert.equal(s.scene!.round.tally.break_treaty, 0);
});
test("concurrent resolutions commit effects exactly once and request IDs cannot cross operations", async () => {
  const ctx = setup();
  const { id, round } = await opened(ctx);
  await chat(ctx, id, "alice", "!join red");
  await chat(ctx, id, "alice", "!vote 2");
  await Promise.all([
    ctx.service.closeRound(id, "owner", round, "close-a"),
    ctx.service.closeRound(id, "owner", round, "close-b"),
  ]);
  assert.equal((await ctx.service.getWorld(id)).relationship.trust, -20);
  assert.equal(
    (await ctx.service.history(id)).events.filter(
      (e) => e.kind === "decision_resolved",
    ).length,
    1,
  );
  await assert.rejects(
    ctx.service.endEpisode(id, "owner", "bad", "close-a"),
    (e: unknown) => e instanceof DomainError && e.code === "REQUEST_ID_REUSED",
  );
});
test("late and stale votes are rejected; tie and empty votes hold position", async () => {
  const ctx = setup();
  const { id, round } = await opened(ctx);
  await chat(ctx, id, "alice", "!join red");
  ctx.advance(45000);
  await chat(ctx, id, "alice", "!vote 2");
  const s = await ctx.service.closeRound(id, "owner", round, "close");
  assert.equal(s.scene!.round.outcome, "no_votes");
  assert.equal(s.relationship.trust, 40);
  await ctx.service.prepareScene(id, "owner", "prepare2");
  const r = (await ctx.service.getWorld(id)).scene!.round.id;
  await ctx.service.openRound(id, "owner", r, "open2");
  await ctx.service.handleChat(id, {
    messageId: "old",
    userId: "alice",
    displayName: "alice",
    text: "!vote 2",
    timestamp: "2026-10-30T00:00:00Z",
  });
  assert.equal((await ctx.service.getWorld(id)).scene!.round.totalVoters, 0);
  await chat(ctx, id, "bob", "!join blue");
  await chat(ctx, id, "alice", "!vote 1");
  await chat(ctx, id, "bob", "!vote 2");
  const tie = await ctx.service.closeRound(id, "owner", r, "close2");
  assert.equal(tie.scene!.round.outcome, "tied");
  assert.equal(tie.relationship.trust, 40);
});
test("resting ticks are capped and concurrent catchup/episode start never duplicates a tick", async () => {
  const ctx = setup();
  const { id } = await opened(ctx);
  const s = await ctx.service.getWorld(id);
  await ctx.service.endEpisode(id, "owner", s.episode!.id, "end");
  ctx.advance(100000);
  await Promise.all([
    ctx.service.tickWorld(id),
    ctx.service.tickWorld(id),
    ctx.service.startEpisode(id, "owner", "start2"),
  ]);
  const events = (await ctx.service.history(id)).events.filter(
    (e) => e.kind === "offline_development",
  );
  assert.equal(events.length, 3);
  await ctx.service.tickWorld(id);
  assert.equal(
    (await ctx.service.history(id)).events.filter(
      (e) => e.kind === "offline_development",
    ).length,
    3,
  );
});
test("owner boundaries and transaction rollback protect canonical state", async () => {
  const ctx = setup();
  const { id } = await opened(ctx);
  const before = await ctx.service.getWorld(id);
  await assert.rejects(
    ctx.service.prepareScene(id, "intruder", "attack"),
    (e: unknown) => e instanceof DomainError && e.status === 403,
  );
  await assert.rejects(
    ctx.repository.transact(id, (w) => {
      w.snapshot.relationship.trust = -99;
      throw new Error("rollback");
    }),
  );
  assert.deepEqual(await ctx.service.getWorld(id), before);
});
test("connection loss preserves votes and resumes only on an explicit connected command", async () => {
  const ctx = setup();
  const { id, round } = await opened(ctx);
  await chat(ctx, id, "alice", "!join red");
  await chat(ctx, id, "alice", "!vote 2");
  ctx.advance(5000);
  const paused = await ctx.service.setTwitchState(id, {
    connection: "reconnecting",
  });
  assert.equal(paused.scene!.round.status, "paused");
  await assert.rejects(
    ctx.service.resumeRound(id, "owner", round, "resume-disconnected"),
  );
  ctx.advance(10000);
  await ctx.service.setTwitchState(id, { connection: "connected" });
  const resumed = await ctx.service.resumeRound(id, "owner", round, "resume");
  assert.equal(resumed.scene!.round.totalVoters, 1);
  assert.equal(
    Date.parse(resumed.scene!.round.closesAt!) - Date.parse(ctx.now()),
    40000,
  );
});
test("deadlines resolve without a creator request; offline presence defers unfinished decisions", async () => {
  const ctx = setup();
  const { id } = await opened(ctx);
  ctx.advance(45000);
  await ctx.service.resolveDueRounds();
  assert.equal(
    (await ctx.service.getWorld(id)).scene!.round.status,
    "resolved",
  );
  await ctx.service.prepareScene(id, "owner", "prepare2");
  const r = (await ctx.service.getWorld(id)).scene!.round.id;
  await ctx.service.openRound(id, "owner", r, "open2");
  await ctx.service.setTwitchState(id, { broadcast: "offline" });
  const offline = await ctx.service.getWorld(id);
  assert.equal(offline.mode, "resting");
  assert.equal(offline.scene!.round.status, "deferred");
  await ctx.service.startEpisode(id, "owner", "next");
  const next = await ctx.service.getWorld(id);
  assert.notEqual(next.scene!.round.id, r);
  assert.equal(next.scene!.round.totalVoters, 0);
});
test("narration rejects invented history and ignores responses after voting opens", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  await ctx.service.startEpisode(id, "owner", "start");
  const prepared = await ctx.service.prepareScene(id, "owner", "prepare");
  const sceneId = prepared.scene!.id;
  await assert.rejects(
    ctx.service.applyNarration(id, sceneId, {
      narration: "Invented history",
      referencedEventIds: ["invented"],
    }),
  );
  await ctx.service.applyNarration(id, sceneId, {
    narration: "A faithful description of the fragile treaty.",
  });
  const round = prepared.scene!.round.id;
  await ctx.service.openRound(id, "owner", round, "open");
  const before = await ctx.service.getWorld(id);
  await ctx.service.applyNarration(id, sceneId, {
    narration: "A late old response",
  });
  assert.deepEqual(await ctx.service.getWorld(id), before);
  await ctx.service.closeRound(id, "owner", round, "close");
  const resolved = await ctx.service.getWorld(id);
  await ctx.service.applyNarration(id, sceneId, {
    narration: "An even later response",
  });
  assert.deepEqual(await ctx.service.getWorld(id), resolved);
});

async function chooseAction(
  ctx: ReturnType<typeof setup>,
  id: string,
  action: string,
  tag: string,
) {
  const prepared = await ctx.service.prepareScene(
    id,
    "owner",
    "prepare-" + tag,
  );
  const choice = prepared.scene!.choices.find((c) => c.id === action);
  assert.ok(choice, `Expected eligible action ${action}`);
  const round = prepared.scene!.round.id;
  await ctx.service.openRound(id, "owner", round, "open-" + tag);
  await chat(ctx, id, "player", "!join red");
  await chat(ctx, id, "player", `!vote ${choice.number}`);
  return ctx.service.closeRound(id, "owner", round, "close-" + tag);
}

test("shortage follows its exact resource event and foraging recovers supplies without erasing a betrayal", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  await ctx.service.startEpisode(id, "owner", "start");
  await ctx.repository.transact(id, (w) => {
    w.snapshot.factions.find((f) => f.id === "blue")!.supplies = 30;
  });
  const betrayal = await chooseAction(ctx, id, "break_treaty", "betrayal");
  const cause = betrayal.relationship.causeEventId!;
  const crisis = await ctx.service.prepareScene(id, "owner", "crisis");
  assert.equal(crisis.scene!.encounterId, "resource_crisis");
  assert.ok(crisis.scene!.causeEventIds.includes(cause));
  assert.equal(
    crisis.relationship.grievance,
    "The Westbridge treaty was broken.",
  );
  const forage = crisis.scene!.choices.find((c) => c.id === "forage_forest")!;
  const round = crisis.scene!.round.id;
  await ctx.service.openRound(id, "owner", round, "open-crisis");
  await chat(ctx, id, "player", `!vote ${forage.number}`);
  const recovered = await ctx.service.closeRound(id, "owner", round, "recover");
  assert.deepEqual(
    recovered.factions.map((f) => f.supplies),
    [68, 28],
  );
  assert.deepEqual(
    recovered.factions.map((f) => f.morale),
    [57, 57],
  );
  assert.equal(recovered.relationship.causeEventId, cause);
  const retaliation = await ctx.service.prepareScene(
    id,
    "owner",
    "retaliation",
  );
  assert.equal(retaliation.scene!.encounterId, "retaliation");
  assert.deepEqual(retaliation.scene!.causeEventIds, [cause]);
});

test("surplus is shared symmetrically with conserved supplies and bounded morale and trust", async () => {
  for (const donor of ["red", "blue"]) {
    const ctx = setup();
    const w = await ctx.service.createWorld("owner");
    // Live worlds open voting only while chat is connected.
    await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
    const id = w.worldId;
    await ctx.service.startEpisode(id, "owner", "start");
    await ctx.repository.transact(id, (w) => {
      for (const f of w.snapshot.factions) {
        f.supplies = f.id === donor ? 90 : 5;
        f.morale = f.id === donor ? 1 : 99;
      }
      w.snapshot.relationship.trust = 99;
    });
    const result = await chooseAction(ctx, id, "share_surplus", "share");
    assert.equal(result.factions.find((f) => f.id === donor)!.supplies, 80);
    assert.equal(result.factions.find((f) => f.id !== donor)!.supplies, 15);
    assert.equal(
      result.factions.reduce((sum, f) => sum + f.supplies, 0),
      95,
    );
    assert.equal(result.factions.find((f) => f.id === donor)!.morale, 0);
    assert.equal(result.factions.find((f) => f.id !== donor)!.morale, 100);
    assert.equal(result.relationship.trust, 100);
    assert.equal(result.relationship.grievance, null);
  }
});

test("a depleted world remains playable; foraging obeys capacity and depleted morale bounds", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  await ctx.service.startEpisode(id, "owner", "start");
  await ctx.repository.transact(id, (w) => {
    for (const f of w.snapshot.factions) {
      f.supplies = 0;
      f.morale = 1;
    }
  });
  const scene = await ctx.service.prepareScene(id, "owner", "prepare");
  assert.deepEqual(
    scene.scene!.choices.map((c) => c.id),
    ["forage_forest", "hold_position"],
  );
  assert.deepEqual(
    scene.scene!.choices.map((c) => c.number),
    [1, 2],
  );
  await ctx.service.openRound(id, "owner", scene.scene!.round.id, "open");
  await chat(ctx, id, "player", "!join blue");
  await chat(ctx, id, "player", "!vote 1");
  const result = await ctx.service.closeRound(
    id,
    "owner",
    scene.scene!.round.id,
    "close",
  );
  assert.deepEqual(
    result.factions.map((f) => f.supplies),
    [8, 8],
  );
  assert.deepEqual(
    result.factions.map((f) => f.morale),
    [0, 0],
  );
  const next = await ctx.service.prepareScene(id, "owner", "prepare-next");
  const source = (await ctx.service.history(id)).events.findLast(
    (e) => e.kind === "decision_resolved",
  )!;
  assert.deepEqual(next.scene!.causeEventIds, [source.id]);
});

test("reparations settle a grievance explicitly while talks and fortification keep it unresolved", async () => {
  for (const [action, redSupplies, blueSupplies, trust, cleared] of [
    ["pay_reparations", 52, 48, 0, true],
    ["open_talks", 57, 43, -10, false],
    ["fortify_bridge", 55, 40, -25, false],
  ] as const) {
    const ctx = setup();
    const w = await ctx.service.createWorld("owner");
    // Live worlds open voting only while chat is connected.
    await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
    const id = w.worldId;
    await ctx.service.startEpisode(id, "owner", "start");
    const betrayal = await chooseAction(ctx, id, "break_treaty", "betrayal");
    const cause = betrayal.relationship.causeEventId;
    const resolved = await chooseAction(ctx, id, action, action);
    assert.deepEqual(
      resolved.factions.map((f) => f.supplies),
      [redSupplies, blueSupplies],
    );
    assert.equal(resolved.relationship.trust, trust);
    assert.equal(resolved.relationship.causeEventId, cleared ? null : cause);
    assert.equal(
      resolved.locations.find((l) => l.id === "westbridge")!.status,
      cleared ? "open" : "closed",
    );
    assert.ok(
      (await ctx.service.history(id)).events
        .findLast((e) => e.kind === "decision_resolved")!
        .causeEventIds.includes(cause!),
    );
  }
});

test("deferred choices are revalidated after resting consumption changes eligibility", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  await ctx.service.startEpisode(id, "owner", "start");
  await ctx.repository.transact(id, (w) => {
    w.snapshot.factions[0].supplies = 21;
    w.snapshot.factions[1].supplies = 94;
  });
  const original = await ctx.service.prepareScene(id, "owner", "prepare");
  assert.ok(original.scene!.choices.some((c) => c.id === "honor_treaty"));
  await ctx.service.endEpisode(id, "owner", original.episode!.id, "end");
  await ctx.repository.transact(id, (w) => {
    w.snapshot.factions[0].supplies = 5;
  });
  ctx.advance(1000);
  const next = await ctx.service.startEpisode(id, "owner", "next");
  assert.equal(next.factions[0].supplies, 3);
  assert.ok(!next.scene!.choices.some((c) => c.id === "honor_treaty"));
  assert.deepEqual(
    next.scene!.choices.map((c) => c.number),
    next.scene!.choices.map((_, i) => i + 1),
  );
});

test("returning memory credits exact recorded choices and original faction without exposing user IDs", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  await ctx.service.startEpisode(id, "owner", "start");
  const resolved = await chooseAction(ctx, id, "break_treaty", "betrayal");
  const eventId = resolved.relationship.causeEventId!;
  await chat(ctx, id, "player", "!join blue");
  await ctx.service.endEpisode(id, "owner", resolved.episode!.id, "end");
  ctx.advance(1000);
  const next = await ctx.service.startEpisode(id, "owner", "start2");
  const memory = await ctx.service.getNarratorMemory(id);
  assert.equal(memory.contributions.length, 1);
  const credit = memory.contributions[0];
  assert.equal(credit.factionId, "red");
  assert.equal(credit.choiceId, "break_treaty");
  assert.equal(credit.sourceEventId, eventId);
  assert.equal("userId" in credit, false);
  assert.ok(memory.previousEpisodeEvents.some((e) => e.id === eventId));
  assert.equal(memory.offlineEvents.length, 1);
  const recap = {
    previously: memory.fallbackPreviously,
    whileAway: memory.fallbackWhileAway,
    referencedEventIds: [eventId, ...memory.offlineEvents.map((e) => e.id)],
    contributionCredits: [credit],
  };
  await assert.rejects(
    ctx.service.applyRecap(id, next.episode!.id, {
      ...recap,
      contributionCredits: [{ ...credit, choiceId: "honor_treaty" }],
    }),
  );
  await assert.rejects(
    ctx.service.applyRecap(id, next.episode!.id, {
      ...recap,
      contributionCredits: [{ ...credit, summary: "player led the invasion" }],
    }),
  );
  const accepted = await ctx.service.applyRecap(id, next.episode!.id, recap);
  assert.equal(accepted.recap.generationStatus, "generated");
  assert.deepEqual(accepted.recap.contributionCredits, [credit]);
  const repeated = await ctx.service.applyRecap(id, next.episode!.id, {
    ...recap,
    previously: "A different interpretation",
  });
  assert.deepEqual(repeated, accepted);
  const publicSnapshot = await ctx.service.getWorld(id);
  assert.equal("contributionHistory" in publicSnapshot, false);
});

test("previous offline developments do not leak into a later absence with no elapsed ticks", async () => {
  const ctx = setup();
  const { id } = await opened(ctx);
  const first = await ctx.service.getWorld(id);
  await ctx.service.endEpisode(id, "owner", first.episode!.id, "end1");
  ctx.advance(1000);
  await ctx.service.startEpisode(id, "owner", "start2");
  assert.ok((await ctx.service.getNarratorMemory(id)).offlineEvents.length);
  const second = await ctx.service.getWorld(id);
  await ctx.service.endEpisode(id, "owner", second.episode!.id, "end2");
  const third = await ctx.service.startEpisode(id, "owner", "start3");
  assert.equal(third.recap.whileAway, "");
  const memory = await ctx.service.getNarratorMemory(id);
  assert.deepEqual(memory.offlineEvents, []);
  assert.equal(memory.fallbackWhileAway, "");
  const before = await ctx.service.getWorld(id);
  await ctx.service.applyRecap(id, second.episode!.id, {
    previously: "stale",
    whileAway: "stale",
    referencedEventIds: [],
    contributionCredits: [],
  });
  assert.deepEqual(await ctx.service.getWorld(id), before);
});

test("leader reactions are validated, persist once, and cannot change canonical world facts", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  await ctx.service.startEpisode(id, "owner", "start");
  const scene = await ctx.service.prepareScene(id, "owner", "prepare");
  const sceneId = scene.scene!.id;
  await assert.rejects(
    ctx.service.applyNarration(id, sceneId, {
      narration: "Peace is fragile.",
      leaderReactions: [
        { factionId: "red", text: "A" },
        { factionId: "red", text: "B" },
      ],
    }),
  );
  const accepted = await ctx.service.applyNarration(id, sceneId, {
    narration: "Peace is fragile.",
    leaderReactions: [{ factionId: "blue", text: "Our treaty must stand." }],
  });
  assert.deepEqual(accepted.scene!.leaderReactions, [
    { factionId: "blue", text: "Our treaty must stand." },
  ]);
  assert.equal(accepted.relationship.trust, 40);
  const repeat = await ctx.service.applyNarration(id, sceneId, {
    narration: "A replacement",
  });
  assert.deepEqual(repeat, accepted);
});

test("foraging caps a full neighbor while letting the depleted faction recover", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  // Live worlds open voting only while chat is connected.
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  await ctx.service.startEpisode(id, "owner", "start");
  await ctx.repository.transact(id, (w) => {
    w.snapshot.factions[0].supplies = 99;
    w.snapshot.factions[1].supplies = 1;
  });
  const recovered = await chooseAction(ctx, id, "forage_forest", "recover");
  assert.deepEqual(
    recovered.factions.map((f) => f.supplies),
    [100, 9],
  );
});

test("a recovered decision cannot silently execute an action whose resources have become unavailable", async () => {
  const ctx = setup();
  const { id, round } = await opened(ctx);
  await chat(ctx, id, "player", "!join red");
  await chat(ctx, id, "player", "!vote 1");
  await ctx.repository.transact(id, (w) => {
    w.snapshot.factions[0].supplies = 0;
  });
  const before = await ctx.service.getWorld(id);
  await assert.rejects(
    ctx.service.closeRound(id, "owner", round, "close"),
    (e: unknown) => e instanceof DomainError && e.code === "ACTION_UNAVAILABLE",
  );
  assert.deepEqual(await ctx.service.getWorld(id), before);
  assert.equal(
    (await ctx.service.history(id)).events.filter(
      (e) => e.kind === "decision_resolved",
    ).length,
    0,
  );
});

test("a delayed older vote cannot replace a newer one (BE-01)", async () => {
  const ctx = setup();
  const { id } = await opened(ctx);
  await chat(ctx, id, "alice", "!join red");
  const early = ctx.now();
  ctx.advance(1000);
  await chat(ctx, id, "alice", "!vote 2");
  // The earlier !vote 1 is delivered after the newer !vote 2.
  const s = await ctx.service.handleChat(id, {
    messageId: "late-delivery",
    userId: "alice",
    displayName: "alice",
    text: "!vote 1",
    timestamp: early,
  });
  assert.equal(s.scene!.round.totalVoters, 1);
  assert.equal(s.scene!.round.tally.break_treaty, 1);
  assert.equal(s.scene!.round.tally.honor_treaty, 0);
});

test("reparations also end Blue's retaliation preparations (BE-02)", async () => {
  const ctx = setup();
  const w = await ctx.service.createWorld("owner");
  await ctx.service.setTwitchState(w.worldId, { connection: "connected" });
  const id = w.worldId;
  const started = await ctx.service.startEpisode(id, "owner", "start");
  await chooseAction(ctx, id, "break_treaty", "betrayal");
  await ctx.service.endEpisode(id, "owner", started.episode!.id, "end");
  ctx.advance(1000);
  const returning = await ctx.service.startEpisode(id, "owner", "start-2");
  const keep = (s: typeof returning) =>
    s.locations.find((l) => l.id === "blue_keep")!.status;
  assert.equal(keep(returning), "preparing");
  const resolved = await chooseAction(ctx, id, "pay_reparations", "repair");
  assert.equal(resolved.relationship.grievance, null);
  assert.equal(keep(resolved), "stable");
});

test("a live world cannot open voting while chat is disconnected (BE-03)", async () => {
  const ctx = setup();
  const live = await ctx.service.createWorld("owner");
  await ctx.service.startEpisode(live.worldId, "owner", "start");
  const scene = await ctx.service.prepareScene(live.worldId, "owner", "prep");
  await assert.rejects(
    ctx.service.openRound(live.worldId, "owner", scene.scene!.round.id, "open"),
    (e: unknown) => e instanceof DomainError && e.code === "CHAT_DISCONNECTED",
  );
  assert.equal(
    (await ctx.service.getWorld(live.worldId)).scene!.round.status,
    "prepared",
  );

  // Rehearsal has no chat connection and stays playable.
  const practice = await ctx.service.createWorld("rehearser", "Practice", true);
  await ctx.service.startEpisode(practice.worldId, "rehearser", "start");
  const prepared = await ctx.service.prepareScene(
    practice.worldId,
    "rehearser",
    "prep",
  );
  const opened = await ctx.service.openRound(
    practice.worldId,
    "rehearser",
    prepared.scene!.round.id,
    "open",
  );
  assert.equal(opened.scene!.round.status, "open");
});
