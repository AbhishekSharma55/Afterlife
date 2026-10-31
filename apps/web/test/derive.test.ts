import { describe, expect, it } from "vitest";
import {
  leadingChoiceIds,
  locationStatusLabel,
  outcomeHeadline,
  referencedEventIds,
  snapshotDelta,
  studioStep,
  trustStanding,
  votePercent,
} from "../src/lib/derive";
import { getFixture } from "../src/lib/fixtures";

describe("studioStep", () => {
  it("follows the backend lifecycle through the fixture story", () => {
    expect(studioStep(getFixture("fresh"))).toMatchObject({
      kind: "start",
      episodeNumber: 1,
    });
    expect(studioStep(getFixture("prepared")).kind).toBe("open");
    expect(studioStep(getFixture("voting")).kind).toBe("voting");
    expect(studioStep(getFixture("disconnected")).kind).toBe("paused");
    expect(studioStep(getFixture("resolved-betrayal")).kind).toBe("resolved");
    expect(studioStep(getFixture("resting"))).toMatchObject({
      kind: "start",
      episodeNumber: 2,
    });
    expect(studioStep(getFixture("returning")).kind).toBe("open");
  });
});

describe("voting helpers", () => {
  it("reports the winner and percentages of a resolved betrayal", () => {
    const scene = getFixture("resolved-betrayal").scene!;
    expect(outcomeHeadline(scene)).toBe(
      "The community chose: Break the treaty",
    );
    expect(votePercent(scene.round, "break_treaty")).toBe(100);
    expect(votePercent(scene.round, "honor_treaty")).toBe(0);
  });

  it("names no leader before the first vote and every tied leader after", () => {
    const round = structuredClone(getFixture("prepared").scene!.round);
    expect(leadingChoiceIds(round)).toEqual([]);
    round.tally = { honor_treaty: 2, break_treaty: 2, hold_position: 1 };
    round.totalVoters = 5;
    expect(leadingChoiceIds(round)).toEqual(["honor_treaty", "break_treaty"]);
  });

  it("describes ties and empty rounds as holding position", () => {
    const scene = structuredClone(getFixture("resolved-betrayal").scene!);
    scene.round.outcome = "tied";
    scene.round.winningChoiceId = null;
    expect(outcomeHeadline(scene)).toMatch(/tie/i);
    scene.round.outcome = "no_votes";
    expect(outcomeHeadline(scene)).toMatch(/no votes/i);
  });
});

describe("world facts", () => {
  it("labels trust bands at their boundaries", () => {
    expect(trustStanding(100).label).toBe("Allied");
    expect(trustStanding(40).label).toBe("Cordial");
    expect(trustStanding(0).label).toBe("Uneasy");
    expect(trustStanding(-20).label).toBe("Hostile");
    expect(trustStanding(-60).tone).toBe("war");
  });

  it("gives every seeded location status a readable label", () => {
    for (const status of ["stable", "open", "closed", "preparing", "foraging"])
      expect(locationStatusLabel(status)).not.toMatch(/_/);
    expect(locationStatusLabel("preparing", true)).toBe("Preparing");
    expect(locationStatusLabel("under_siege")).toBe("Under siege");
  });

  it("captures the betrayal's changes between two revisions", () => {
    const delta = snapshotDelta(
      getFixture("voting"),
      getFixture("resolved-betrayal"),
    )!;
    expect(delta.trust).toBe(-60);
    expect(delta.factions.red).toEqual({ supplies: 10, morale: 0 });
    expect(delta.factions.blue).toEqual({ supplies: -10, morale: 0 });
    expect(delta.locations.westbridge).toEqual({ from: "open", to: "closed" });
    expect(
      snapshotDelta(getFixture("voting"), getFixture("voting")),
    ).toBeNull();
  });

  it("collects every event the episode-two scene and recap cite", () => {
    const returning = getFixture("returning");
    const ids = referencedEventIds(returning);
    const known = new Set(returning.recentEvents.map((event) => event.id));
    expect(ids).toContain(returning.relationship.causeEventId);
    expect(ids.every((id) => known.has(id))).toBe(true);
  });
});

describe("fixtures", () => {
  it("moves an open round's deadline into the future for preview only", () => {
    const now = Date.parse("2026-11-01T12:00:00Z");
    const round = getFixture("voting", now).scene!.round;
    expect(Date.parse(round.closesAt!)).toBeGreaterThan(now);
    expect(Date.parse(round.openedAt!)).toBeLessThanOrEqual(now);
    const original = getFixture("voting").scene!.round;
    expect(Date.parse(round.closesAt!) - Date.parse(round.openedAt!)).toBe(
      Date.parse(original.closesAt!) - Date.parse(original.openedAt!),
    );
  });
});
