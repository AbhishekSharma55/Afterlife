import { useEffect, useRef, useState } from "react";
import type { WorldSnapshot } from "@afterlife/shared";
import { snapshotDelta, type SnapshotDelta } from "./derive";

/**
 * The most recent visible change to world facts, kept on screen briefly so viewers notice it.
 * The first snapshot a page loads is a baseline, not a change.
 */
export function useDelta(
  snapshot: WorldSnapshot | null,
  holdMs = 6000,
): { delta: SnapshotDelta; key: number } | null {
  const previous = useRef<WorldSnapshot | null>(null);
  const [current, setCurrent] = useState<{
    delta: SnapshotDelta;
    key: number;
  } | null>(null);
  useEffect(() => {
    if (!snapshot) return;
    const before = previous.current;
    previous.current = snapshot;
    if (!before || before.worldId !== snapshot.worldId) {
      setCurrent(null);
      return;
    }
    const delta = snapshotDelta(before, snapshot);
    if (delta) setCurrent({ delta, key: snapshot.revision });
  }, [snapshot]);
  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(() => setCurrent(null), holdMs);
    return () => clearTimeout(timer);
  }, [current, holdMs]);
  return current;
}
