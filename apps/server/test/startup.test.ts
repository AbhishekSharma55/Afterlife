import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { Pool } from "pg";
import { startServer } from "../src/server.js";
import { createApp } from "../src/http/app.js";

const databaseEnv = {
  DATABASE_URL: "postgresql://localhost/unused-injected-database",
  PORT: "0",
};

test("invalid runtime configuration fails before allocating a database pool", async () => {
  let allocations = 0;
  const dependencies = {
    createPool: () => {
      allocations++;
      throw new Error("Database must not be allocated");
    },
  };
  for (const [config, message] of [
    [{ AI_PROVIDER: "unknown" }, /AI_PROVIDER/],
    [{ PORT: "-1" }, /PORT/],
    [{ PORT: "1.5" }, /PORT/],
    [{ OFFLINE_INTERVAL_MS: "59999" }, /OFFLINE_INTERVAL_MS/],
    [{ PUBLIC_ORIGIN: "invalid" }, /PUBLIC_ORIGIN/],
    [{ PUBLIC_ORIGIN: "ftp://localhost" }, /PUBLIC_ORIGIN/],
  ] as const) {
    await assert.rejects(
      startServer({ ...databaseEnv, ...config }, dependencies),
      message,
    );
  }
  assert.equal(allocations, 0);
});

for (const stage of [
  "migration",
  "initial world read",
  "app creation",
] as const) {
  test(`startup releases the pool when ${stage} fails`, async (t) => {
    const pool = new Pool();
    let reads = 0;
    let ended = 0;
    const failure = new Error(`${stage} failed`);
    t.mock.method(pool, "query", async () => {
      reads++;
      if (
        stage === "migration" ||
        (stage === "initial world read" && reads === 2)
      )
        throw failure;
      return { rows: [] };
    });
    t.mock.method(pool, "end", async () => {
      ended++;
    });
    await assert.rejects(
      startServer(databaseEnv, {
        createPool: () => pool,
        createApp: () => {
          if (stage === "app creation") throw failure;
          throw new Error("App must not be allocated after database failure");
        },
      }),
      (error) => error === failure,
    );
    assert.equal(ended, 1);
  });
}

test("a real listen failure closes the app, its worker timer, and its pool once", async (t) => {
  const occupied = createServer();
  await new Promise<void>((resolve) =>
    occupied.listen(0, "127.0.0.1", resolve),
  );
  t.after(
    () => new Promise<void>((resolve) => occupied.close(() => resolve())),
  );
  const address = occupied.address();
  assert.ok(address && typeof address !== "string");
  const pool = new Pool();
  let ended = 0;
  let closed = 0;
  t.mock.method(pool, "query", async () => ({ rows: [] }));
  t.mock.method(pool, "end", async () => {
    ended++;
  });
  const intervals: ReturnType<typeof setInterval>[] = [];
  const cleared = new Set<ReturnType<typeof setInterval>>();
  const originalSet = globalThis.setInterval;
  const originalClear = globalThis.clearInterval;
  t.mock.method(
    globalThis,
    "setInterval",
    (...args: Parameters<typeof setInterval>) => {
      const timer = originalSet(...args);
      intervals.push(timer);
      return timer;
    },
  );
  t.mock.method(
    globalThis,
    "clearInterval",
    (timer: ReturnType<typeof setInterval>) => {
      cleared.add(timer);
      return originalClear(timer);
    },
  );
  await assert.rejects(
    startServer(
      { ...databaseEnv, PORT: String(address.port) },
      {
        createPool: () => pool,
        createApp: (options) => {
          const app = createApp(options);
          app.addHook("onClose", async () => {
            closed++;
          });
          return app;
        },
      },
    ),
    { code: "EADDRINUSE" },
  );
  assert.equal(closed, 1);
  assert.equal(ended, 1);
  assert.ok(intervals.length > 0);
  assert.ok(intervals.every((timer) => cleared.has(timer)));
});

test("normal shutdown waits for an in-flight world worker before ending the pool", async (t) => {
  const pool = new Pool();
  let ended = false;
  let reads = 0;
  let release!: () => void;
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const working = new Promise<void>((resolve) => {
    entered = resolve;
  });
  t.mock.method(pool, "query", async () => {
    reads++;
    if (reads === 3) {
      entered();
      await waiting;
    }
    assert.equal(ended, false, "worker must not query a closed pool");
    return { rows: [] };
  });
  t.mock.method(pool, "end", async () => {
    ended = true;
  });
  const runtime = await startServer(databaseEnv, { createPool: () => pool });
  t.after(async () => {
    release();
    await runtime.app.close();
  });
  await working;
  const closing = runtime.app.close();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ended, false);
  release();
  await closing;
  assert.equal(ended, true);
  assert.equal(
    reads,
    4,
    "worker finishes both tick and round reads before pool shutdown",
  );
});
