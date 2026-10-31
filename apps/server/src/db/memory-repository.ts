import {
  DomainError,
  type StoredWorld,
  type WorldRepository,
} from "../domain/types.js";
export class MemoryWorldRepository implements WorldRepository {
  private worlds = new Map<string, StoredWorld>();
  private tail = Promise.resolve();
  private async locked<T>(fn: () => Promise<T> | T): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise((r) => (release = r));
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
  async create(world: StoredWorld) {
    return this.locked(() => {
      const old = [...this.worlds.values()].find(
        (w) => w.ownerId === world.ownerId,
      );
      if (old) return structuredClone(old);
      this.worlds.set(world.snapshot.worldId, structuredClone(world));
      return structuredClone(world);
    });
  }
  async get(id: string) {
    return structuredClone(this.worlds.get(id) ?? null);
  }
  async list() {
    return structuredClone([...this.worlds.values()]);
  }
  async transact<T>(
    id: string,
    fn: (w: StoredWorld) => T | Promise<T>,
  ): Promise<T> {
    return this.locked(async () => {
      const old = this.worlds.get(id);
      if (!old)
        throw new DomainError(404, "WORLD_NOT_FOUND", "World not found.");
      const draft = structuredClone(old);
      const result = await fn(draft);
      this.worlds.set(id, draft);
      return structuredClone(result);
    });
  }
}
