import { randomBytes } from "node:crypto";

export interface CreatorSession {
  ownerId: string;
  rehearsal: boolean;
  expiresAt: number;
}
/** Provider tokens never enter the browser session. Sessions expire on process restart. */
export class SessionStore {
  private readonly sessions = new Map<string, CreatorSession>();
  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 12 * 60 * 60 * 1000,
  ) {}
  create(ownerId: string, rehearsal = false): string {
    for (const [key, value] of this.sessions)
      if (value.expiresAt <= this.now()) this.sessions.delete(key);
    const token = randomBytes(32).toString("hex");
    this.sessions.set(token, {
      ownerId,
      rehearsal,
      expiresAt: this.now() + this.ttlMs,
    });
    return token;
  }
  read(token: string | undefined): CreatorSession | undefined {
    if (!token) return;
    const session = this.sessions.get(token);
    if (session && session.expiresAt > this.now()) return session;
    this.sessions.delete(token);
  }
  remove(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }
}
