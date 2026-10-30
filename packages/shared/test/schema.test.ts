import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { worldSnapshotSchema, type WorldSnapshot } from "../src/index.js";
const fixtures = new URL("../../../docs/afterlife/fixtures/", import.meta.url);
const load = async (name: string): Promise<WorldSnapshot> =>
  worldSnapshotSchema.parse(
    JSON.parse(await readFile(new URL(`${name}.json`, fixtures), "utf8")),
  );

test("every shipped frontend snapshot validates as the current public contract", async () => {
  const names = (await readdir(fixtures)).filter((name) =>
    name.endsWith(".json"),
  );
  assert.equal(names.length, 8);
  for (const name of names) {
    const snapshot = worldSnapshotSchema.parse(
      JSON.parse(await readFile(new URL(name, fixtures), "utf8")),
    );
    assert.equal(snapshot.rehearsal, true);
    assert.equal(snapshot.worldId, "world_fixture");
  }
});
test("fixtures preserve the betrayal and its exact cause across two episodes", async () => {
  const resolved = await load("resolved-betrayal");
  const returning = await load("returning");
  assert.equal(resolved.relationship.trust, -20);
  assert.equal(returning.relationship.trust, -20);
  assert.equal(returning.episode?.number, 2);
  assert.ok(
    returning.scene?.causeEventIds.includes(
      resolved.relationship.causeEventId!,
    ),
  );
  assert.equal(
    returning.locations.find((location) => location.id === "westbridge")
      ?.status,
    "closed",
  );
  assert.equal(
    returning.factions.find((faction) => faction.id === "blue")?.morale,
    55,
  );
});
test("invalid stats, hidden internal fields and inconsistent tallies are rejected", async () => {
  const snapshot = await load("voting");
  assert.equal(
    worldSnapshotSchema.safeParse({ ...snapshot, ownerId: "private-owner" })
      .success,
    false,
  );
  const invalid = structuredClone(snapshot);
  invalid.factions[0].supplies = -1;
  assert.equal(worldSnapshotSchema.safeParse(invalid).success, false);
  const badCount = structuredClone(snapshot);
  badCount.scene!.round.totalVoters++;
  assert.equal(worldSnapshotSchema.safeParse(badCount).success, false);
  const badChoice = structuredClone(snapshot);
  badChoice.scene!.round.tally.unknown = 0;
  assert.equal(worldSnapshotSchema.safeParse(badChoice).success, false);
});
test("active rounds require timestamps and resolved rounds require coherent outcomes", async () => {
  const voting = await load("voting");
  voting.scene!.round.closesAt = null;
  assert.equal(worldSnapshotSchema.safeParse(voting).success, false);
  const resolved = await load("resolved-betrayal");
  resolved.scene!.round.winningChoiceId = null;
  assert.equal(worldSnapshotSchema.safeParse(resolved).success, false);
});
test("optional narrative metadata remains compatible with earlier snapshots", async () => {
  const snapshot = await load("returning");
  delete snapshot.scene!.encounterId;
  delete snapshot.scene!.leaderReactions;
  delete snapshot.recap.contributionCredits;
  delete snapshot.recap.generationStatus;
  assert.equal(worldSnapshotSchema.safeParse(snapshot).success, true);
});
