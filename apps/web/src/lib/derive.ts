import type {
  FactionId,
  Round,
  Scene,
  WorldEvent,
  WorldSnapshot,
} from "@afterlife/shared";

/** Every event ID the current view cites, so the page can make sure it knows each one. */
export function referencedEventIds(snapshot: WorldSnapshot): string[] {
  const ids = new Set<string>();
  for (const id of snapshot.scene?.causeEventIds ?? []) ids.add(id);
  for (const id of snapshot.recap.causeEventIds) ids.add(id);
  if (snapshot.relationship.causeEventId)
    ids.add(snapshot.relationship.causeEventId);
  for (const credit of snapshot.recap.contributionCredits ?? [])
    ids.add(credit.sourceEventId);
  return [...ids];
}

export function faction(snapshot: WorldSnapshot, id: FactionId) {
  return snapshot.factions.find((entry) => entry.id === id)!;
}

export type TrustTone = "allied" | "cordial" | "uneasy" | "hostile" | "war";

export function trustStanding(trust: number): {
  label: string;
  tone: TrustTone;
} {
  if (trust >= 60) return { label: "Allied", tone: "allied" };
  if (trust >= 20) return { label: "Cordial", tone: "cordial" };
  if (trust > -20) return { label: "Uneasy", tone: "uneasy" };
  if (trust > -60) return { label: "Hostile", tone: "hostile" };
  return { label: "On the brink of war", tone: "war" };
}

const LOCATION_STATUS: Record<string, string> = {
  stable: "Stable",
  open: "Open",
  closed: "Closed",
  preparing: "Preparing retaliation",
  foraging: "Being foraged",
};

const LOCATION_STATUS_SHORT: Record<string, string> = {
  preparing: "Preparing",
  foraging: "Foraging",
};

export function locationStatusLabel(status: string, short = false): string {
  return (
    (short && LOCATION_STATUS_SHORT[status]) ||
    LOCATION_STATUS[status] ||
    humanize(status)
  );
}

/** Statuses that signal tension, used to draw attention on the map. */
export function locationIsTense(status: string): boolean {
  return status === "closed" || status === "preparing";
}

export function humanize(id: string): string {
  const words = id.replaceAll("_", " ").replaceAll("-", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type EventTone = "origin" | "episode" | "decision" | "offline" | "other";

export function eventKind(kind: string): { label: string; tone: EventTone } {
  switch (kind) {
    case "world_created":
      return { label: "Founding", tone: "origin" };
    case "episode_started":
      return { label: "Episode begins", tone: "episode" };
    case "episode_ended":
      return { label: "Episode ends", tone: "episode" };
    case "decision_resolved":
      return { label: "Decision", tone: "decision" };
    case "offline_development":
      return { label: "While resting", tone: "offline" };
    default:
      return { label: humanize(kind), tone: "other" };
  }
}

/** Events that carry story weight. Episode boundaries are bookkeeping, not memories worth citing. */
export function isStoryEvent(event: WorldEvent): boolean {
  return event.kind !== "episode_started" && event.kind !== "episode_ended";
}

export function eventWhen(event: WorldEvent): string {
  if (event.episodeNumber !== null) return `Episode ${event.episodeNumber}`;
  if (event.kind === "world_created") return "Before the story";
  return "Between episodes";
}

export function choiceLabel(scene: Scene | null, choiceId: string): string {
  return (
    scene?.choices.find((choice) => choice.id === choiceId)?.label ??
    humanize(choiceId)
  );
}

/** Choices ordered by votes; ties keep their pinned order. */
export function rankedChoices(scene: Scene) {
  return [...scene.choices].sort(
    (a, b) =>
      (scene.round.tally[b.id] ?? 0) - (scene.round.tally[a.id] ?? 0) ||
      a.number - b.number,
  );
}

export function votePercent(round: Round, choiceId: string): number {
  if (!round.totalVoters) return 0;
  return Math.round(((round.tally[choiceId] ?? 0) / round.totalVoters) * 100);
}

/** The choice(s) currently ahead, or none before the first vote. */
export function leadingChoiceIds(round: Round): string[] {
  const counts = Object.entries(round.tally);
  const top = Math.max(0, ...counts.map(([, count]) => count));
  if (!top) return [];
  return counts.filter(([, count]) => count === top).map(([id]) => id);
}

export function outcomeHeadline(scene: Scene): string | null {
  const { round } = scene;
  if (round.status !== "resolved") return null;
  if (round.outcome === "choice_selected" && round.winningChoiceId)
    return `The community chose: ${choiceLabel(scene, round.winningChoiceId)}`;
  if (round.outcome === "tied") return "A tie — the council holds its position";
  if (round.outcome === "no_votes")
    return "No votes — the council holds its position";
  return "The council holds its position";
}

/** What the creator should do next. Mirrors the backend's lifecycle rules. */
export type StudioStep =
  | { kind: "start"; episodeNumber: number; hasDeferred: boolean }
  | { kind: "prepare" }
  | { kind: "open"; scene: Scene }
  | { kind: "voting"; scene: Scene }
  | { kind: "paused"; scene: Scene }
  | { kind: "resolved"; scene: Scene };

export function studioStep(snapshot: WorldSnapshot): StudioStep {
  if (snapshot.mode !== "active")
    return {
      kind: "start",
      episodeNumber: (snapshot.episode?.number ?? 0) + 1,
      hasDeferred: snapshot.scene?.round.status === "deferred",
    };
  const scene = snapshot.scene;
  if (!scene) return { kind: "prepare" };
  switch (scene.round.status) {
    case "prepared":
      return { kind: "open", scene };
    case "open":
      return { kind: "voting", scene };
    case "paused":
      return { kind: "paused", scene };
    case "resolved":
      return { kind: "resolved", scene };
    case "deferred":
      // An active world with a deferred round should not occur; offer a fresh dilemma.
      return { kind: "prepare" };
  }
}

export function modeLabel(snapshot: WorldSnapshot): string {
  if (snapshot.mode === "active")
    return `Episode ${snapshot.episode?.number ?? ""} live`.trim();
  if (snapshot.mode === "resting") return "Resting between episodes";
  return "Awaiting first episode";
}

export function factionName(id: FactionId): string {
  return id === "red" ? "Red" : "Blue";
}

export interface SnapshotDelta {
  factions: Partial<Record<FactionId, { supplies: number; morale: number }>>;
  trust: number;
  locations: Record<string, { from: string; to: string }>;
}

/** Visible fact changes between two revisions of the same world. */
export function snapshotDelta(
  previous: WorldSnapshot,
  next: WorldSnapshot,
): SnapshotDelta | null {
  if (previous.worldId !== next.worldId) return null;
  const delta: SnapshotDelta = {
    factions: {},
    trust: next.relationship.trust - previous.relationship.trust,
    locations: {},
  };
  let changed = delta.trust !== 0;
  for (const entry of next.factions) {
    const before = previous.factions.find((item) => item.id === entry.id);
    if (!before) continue;
    const supplies = entry.supplies - before.supplies;
    const morale = entry.morale - before.morale;
    if (supplies || morale) {
      delta.factions[entry.id] = { supplies, morale };
      changed = true;
    }
  }
  for (const location of next.locations) {
    const before = previous.locations.find((item) => item.id === location.id);
    if (before && before.status !== location.status) {
      delta.locations[location.id] = {
        from: before.status,
        to: location.status,
      };
      changed = true;
    }
  }
  return changed ? delta : null;
}

export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
