import { worldSnapshotSchema, type WorldSnapshot } from "@afterlife/shared";

/** Backend-generated rehearsal snapshots, in story order. They are sample data, never live participation. */
export const FIXTURE_ORDER = [
  "fresh",
  "prepared",
  "voting",
  "disconnected",
  "resolved-betrayal",
  "resting",
  "while-away",
  "returning",
] as const;
export type FixtureName = (typeof FIXTURE_ORDER)[number];

export const FIXTURE_LABELS: Record<FixtureName, string> = {
  fresh: "Fresh world",
  prepared: "Dilemma prepared",
  voting: "Vote open",
  disconnected: "Chat interrupted",
  "resolved-betrayal": "Treaty broken",
  resting: "World resting",
  "while-away": "While you were away",
  returning: "Episode two returns",
};

const files = import.meta.glob<unknown>(
  "../../../../docs/afterlife/fixtures/*.json",
  {
    eager: true,
    import: "default",
  },
);

const fixtures = new Map<string, WorldSnapshot>();
for (const [path, json] of Object.entries(files)) {
  const name = path
    .split("/")
    .at(-1)!
    .replace(/\.json$/, "");
  fixtures.set(name, worldSnapshotSchema.parse(json));
}

export function isFixtureName(
  value: string | null | undefined,
): value is FixtureName {
  return !!value && (FIXTURE_ORDER as readonly string[]).includes(value);
}

export function getFixture(name: FixtureName, now = Date.now()): WorldSnapshot {
  const fixture = fixtures.get(name);
  if (!fixture)
    throw new Error(`Fixture ${name} is missing from docs/afterlife/fixtures.`);
  const snapshot = structuredClone(fixture);
  // Fixtures use a fixed clock, so an open round's deadline is long past. For preview only,
  // move the window so the countdown shows the round mid-vote; the duration is unchanged.
  const round = snapshot.scene?.round;
  if (round?.status === "open" && round.openedAt && round.closesAt) {
    const duration = Date.parse(round.closesAt) - Date.parse(round.openedAt);
    const opened = now - Math.min(10_000, duration / 4);
    round.openedAt = new Date(opened).toISOString();
    round.closesAt = new Date(opened + duration).toISOString();
  }
  return snapshot;
}
