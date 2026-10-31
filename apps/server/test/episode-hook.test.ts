import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/http/app.js";
import { SessionStore } from "../src/http/sessions.js";
import { WorldService } from "../src/domain/world-service.js";
import { MemoryWorldRepository } from "../src/db/memory-repository.js";

test("episode recap hooks run after authorized durable start and never for another owner", async (t) => {
  const service = new WorldService(new MemoryWorldRepository());
  const sessions = new SessionStore();
  const world = await service.createWorld("owner");
  let calls = 0;
  const app = createApp({
    service,
    sessions,
    onEpisodeStarted: async (snapshot) => {
      calls++;
      assert.equal(
        (await service.getWorld(world.worldId)).episode?.id,
        snapshot.episode?.id,
      );
      return {
        ...snapshot,
        recap: {
          ...snapshot.recap,
          previously: "A kingdom ready for its next chapter.",
        },
      };
    },
  });
  t.after(() => app.close());
  const url = `/api/worlds/${world.worldId}/episodes/start`;
  const denied = await app.inject({
    method: "POST",
    url,
    headers: { cookie: `afterlife_session=${sessions.create("stranger")}` },
    payload: { requestId: "start-denied" },
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(calls, 0);
  const accepted = await app.inject({
    method: "POST",
    url,
    headers: { cookie: `afterlife_session=${sessions.create("owner")}` },
    payload: { requestId: "start-owner" },
  });
  assert.equal(accepted.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(
    accepted.json().recap.previously,
    "A kingdom ready for its next chapter.",
  );
});
