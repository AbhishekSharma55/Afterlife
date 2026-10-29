export type FactionId = "red" | "blue";
export interface WorldEvent {
  id: string;
  sequence: number;
  episodeNumber: number | null;
  kind: string;
  summary: string;
  causeEventIds: string[];
  effectiveAt: string;
  processedAt: string;
}
export interface Round {
  id: string;
  status: "prepared" | "open" | "paused" | "resolved" | "deferred";
  openedAt: string | null;
  closesAt: string | null;
  tally: Record<string, number>;
  totalVoters: number;
  winningChoiceId: string | null;
  outcome: "choice_selected" | "tied" | "no_votes" | null;
}
export interface Scene {
  id: string;
  title: string;
  narration: string;
  causeEventIds: string[];
  choices: { id: string; number: number; label: string }[];
  round: Round;
}
export interface WorldSnapshot {
  worldId: string;
  revision: number;
  name: string;
  mode: "ready" | "active" | "resting";
  episode: { id: string; number: number; status: "active" | "ended" } | null;
  factions: { id: FactionId; name: string; supplies: number; morale: number }[];
  relationship: {
    trust: number;
    grievance: string | null;
    causeEventId: string | null;
  };
  locations: { id: string; name: string; status: string }[];
  scene: Scene | null;
  recap: { previously: string; whileAway: string; causeEventIds: string[] };
  recentEvents: WorldEvent[];
  narratorStatus: "idle" | "working" | "fallback";
  twitch: {
    connection:
      | "disconnected"
      | "connecting"
      | "connected"
      | "reconnecting"
      | "unauthorized";
    broadcast: "live" | "offline" | "unknown";
  };
  rehearsal: boolean;
}
export interface ChatMessage {
  messageId: string;
  userId: string;
  displayName: string;
  text: string;
  timestamp: string;
}
export interface Vote {
  userId: string;
  choiceId: string;
  faction: FactionId;
  displayName: string;
}
export interface StoredWorld {
  ownerId: string;
  snapshot: WorldSnapshot;
  events: WorldEvent[];
  memberships: Record<string, { faction: FactionId; displayName: string }>;
  votes: Record<string, Vote[]>;
  processedMessages: string[];
  requests: Record<string, { operation: string; snapshot: WorldSnapshot }>;
  resting: { id: string; since: number; ticks: number } | null;
  pausedRound?: { id: string; remainingMs: number };
}
export interface WorldRepository {
  create(world: StoredWorld): Promise<StoredWorld>;
  get(id: string): Promise<StoredWorld | null>;
  list(): Promise<StoredWorld[]>;
  transact<T>(
    id: string,
    operation: (world: StoredWorld) => T | Promise<T>,
  ): Promise<T>;
}
export class DomainError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
