import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WorldService } from "../apps/server/src/domain/world-service.js";
import { MemoryWorldRepository } from "../apps/server/src/db/memory-repository.js";
import { worldSnapshotSchema, type WorldSnapshot } from "@afterlife/shared";

const directory = new URL("../docs/afterlife/fixtures/", import.meta.url);
const checking = process.argv.includes("--check");
const repository = new MemoryWorldRepository();
let now = Date.parse("2026-10-30T08:00:00Z");
let service = new WorldService(repository, { now: () => now });
const world = await service.createWorld("fixture-owner", "Westbridge", true);
const snapshots: Record<string, WorldSnapshot> = { fresh: world };
const chat = async (
  userId: string,
  displayName: string,
  text: string,
  messageId: string,
) =>
  service.handleChat(world.worldId, {
    userId,
    displayName,
    text,
    messageId,
    timestamp: new Date(now).toISOString(),
  });
await service.setTwitchState(world.worldId, {
  connection: "connected",
  broadcast: "live",
});
const started = await service.startEpisode(
  world.worldId,
  "fixture-owner",
  "fixture-start",
);
await chat("fixture-red", "Asha", "!join red", "fixture-join-red");
await chat("fixture-blue", "Mira", "!join blue", "fixture-join-blue");
snapshots.prepared = await service.prepareScene(
  world.worldId,
  "fixture-owner",
  "fixture-prepare",
);
const roundId = snapshots.prepared.scene!.round.id;
await service.openRound(
  world.worldId,
  "fixture-owner",
  roundId,
  "fixture-open",
  45,
);
now += 1000;
await chat("fixture-red", "Asha", "!vote 2", "fixture-vote-red");
snapshots.voting = await chat(
  "fixture-blue",
  "Mira",
  "!vote 2",
  "fixture-vote-blue",
);
snapshots.disconnected = await service.setTwitchState(world.worldId, {
  connection: "reconnecting",
});
await service.setTwitchState(world.worldId, { connection: "connected" });
await service.resumeRound(
  world.worldId,
  "fixture-owner",
  roundId,
  "fixture-resume",
);
snapshots["resolved-betrayal"] = await service.closeRound(
  world.worldId,
  "fixture-owner",
  roundId,
  "fixture-close",
);
await service.endEpisode(
  world.worldId,
  "fixture-owner",
  started.episode!.id,
  "fixture-end",
);
snapshots.resting = await service.setTwitchState(world.worldId, {
  broadcast: "offline",
});
now += 21600000;
snapshots["while-away"] = await service.tickWorld(world.worldId);
// A new service instance reads exactly the same persisted aggregate.
service = new WorldService(repository, { now: () => now });
await service.setTwitchState(world.worldId, {
  connection: "connected",
  broadcast: "live",
});
await service.startEpisode(world.worldId, "fixture-owner", "fixture-return");
snapshots.returning = await service.prepareScene(
  world.worldId,
  "fixture-owner",
  "fixture-prepare-return",
);

// Random database IDs are opaque to clients. Canonicalize only IDs, retaining
// relationships across fixtures so regeneration produces byte-identical JSON.
const aliases = new Map<string, string>([[world.worldId, "world_fixture"]]);
const uuid = /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi;
function normalize(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(uuid, (id) => {
      if (!aliases.has(id))
        aliases.set(id, `fixture_id_${String(aliases.size).padStart(3, "0")}`);
      return aliases.get(id)!;
    });
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item)]),
    );
  return value;
}
await mkdir(directory, { recursive: true });
for (const [name, snapshot] of Object.entries(snapshots)) {
  const parsed = worldSnapshotSchema.parse(normalize(snapshot));
  const content = `${JSON.stringify(parsed, null, 2)}\n`;
  const target = new URL(`${name}.json`, directory);
  if (checking) {
    const existing = await readFile(target, "utf8");
    if (existing !== content)
      throw new Error(
        `Fixture drift: ${fileURLToPath(target)}. Run npm run fixtures and review the changes.`,
      );
  } else await writeFile(target, content);
}
console.log(
  `${checking ? "Verified" : "Generated"} ${Object.keys(snapshots).length} deterministic rehearsal snapshots.`,
);
