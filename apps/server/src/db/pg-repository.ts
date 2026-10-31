import type { Pool } from "pg";
import {
  DomainError,
  type StoredWorld,
  type WorldRepository,
} from "../domain/types.js";
// One locked aggregate keeps its canonical facts, votes, history and idempotency
// records in the same transaction. JSONB is durable; never use this as a cache.
export class PgWorldRepository implements WorldRepository {
  constructor(private pool: Pool) {}
  async migrate() {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS afterlife_worlds (id text PRIMARY KEY, owner_id text NOT NULL UNIQUE, document jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
    );
  }
  async create(w: StoredWorld) {
    await this.pool.query(
      "INSERT INTO afterlife_worlds(id,owner_id,document) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO NOTHING",
      [w.snapshot.worldId, w.ownerId, JSON.stringify(w)],
    );
    const r = await this.pool.query(
      "SELECT document FROM afterlife_worlds WHERE owner_id=$1",
      [w.ownerId],
    );
    return r.rows[0].document as StoredWorld;
  }
  async get(id: string) {
    const r = await this.pool.query(
      "SELECT document FROM afterlife_worlds WHERE id=$1",
      [id],
    );
    return (r.rows[0]?.document ?? null) as StoredWorld | null;
  }
  async list() {
    const r = await this.pool.query("SELECT document FROM afterlife_worlds");
    return r.rows.map((r) => r.document as StoredWorld);
  }
  async transact<T>(
    id: string,
    fn: (w: StoredWorld) => T | Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query(
        "SELECT document FROM afterlife_worlds WHERE id=$1 FOR UPDATE",
        [id],
      );
      if (!r.rows.length)
        throw new DomainError(404, "WORLD_NOT_FOUND", "World not found.");
      const world = r.rows[0].document as StoredWorld;
      const result = await fn(world);
      await client.query(
        "UPDATE afterlife_worlds SET document=$2,updated_at=now() WHERE id=$1",
        [id, JSON.stringify(world)],
      );
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}
