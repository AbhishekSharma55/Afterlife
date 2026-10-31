import type { FactionId, WorldSnapshot, WorldEvent } from '@afterlife/shared';
export type { FactionId, WorldEvent, Round, Scene, WorldSnapshot, EncounterId, ContributionCredit, Recap } from '@afterlife/shared';

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
  contributionHistory?: Record<string, Vote[]>;
  lastResourceEventId?: string;
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
