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
