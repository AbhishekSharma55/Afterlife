import test from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { PgWorldRepository } from "../src/db/pg-repository.js";
import { WorldService } from "../src/domain/world-service.js";
test(
  "PostgreSQL persists world history across repository instances and serializes concurrent resolution",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    let id: string | undefined;
    try {
      const repo = new PgWorldRepository(pool);
      await repo.migrate();
      const owner = crypto.randomUUID();
      const s = new WorldService(repo);
      const w = await s.createWorld(owner);
      id = w.worldId;
      await s.startEpisode(id, owner, "start");
      await s.prepareScene(id, owner, "prepare");
      const round = (await s.getWorld(id)).scene!.round.id;
      await s.openRound(id, owner, round, "open");
      const msg = (text: string) =>
        s.handleChat(id!, {
          userId: "viewer",
          displayName: "viewer",
          messageId: crypto.randomUUID(),
          text,
          timestamp: new Date().toISOString(),
        });
      await msg("!join red");
      await msg("!vote 2");
      await Promise.all([
        s.closeRound(id, owner, round, "a"),
        s.closeRound(id, owner, round, "b"),
      ]);
      const reloaded = new WorldService(new PgWorldRepository(pool));
      assert.equal((await reloaded.getWorld(id)).relationship.trust, -20);
      assert.equal(
        (await reloaded.history(id)).events.filter(
          (e) => e.kind === "decision_resolved",
        ).length,
        1,
      );
    } finally {
      if (id)
        await pool.query("DELETE FROM afterlife_worlds WHERE id=$1", [id]);
      await pool.end();
    }
  },
);
