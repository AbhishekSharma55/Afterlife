import { useEffect, useState } from "react";
import type { Round } from "@afterlife/shared";
import { serverNow } from "./clock";

/** Milliseconds left in an open round by the server's clock, or null when no deadline applies. */
export function useCountdown(round: Round | null | undefined): number | null {
  const deadline =
    round?.status === "open" && round.closesAt
      ? Date.parse(round.closesAt)
      : null;
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (deadline === null) return;
    setNow(serverNow());
    const timer = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(timer);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, deadline - now);
}

/** Total length of the open window, for progress rings. */
export function roundDurationMs(
  round: Round | null | undefined,
): number | null {
  if (!round?.openedAt || !round.closesAt) return null;
  return Math.max(1, Date.parse(round.closesAt) - Date.parse(round.openedAt));
}

export function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes
    ? `${minutes}:${String(seconds % 60).padStart(2, "0")}`
    : `${seconds}s`;
}
