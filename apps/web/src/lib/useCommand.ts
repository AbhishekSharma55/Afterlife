import { useCallback, useRef, useState } from "react";
import type { WorldSnapshot } from "@afterlife/shared";
import { ApiError, describeError, newRequestId } from "./api";
import { useToast } from "../components/Toasts";

/**
 * Runs creator commands. Each logical action (keyed by what it targets) keeps its request ID
 * until it succeeds, so retrying after a timeout cannot apply the action twice on the server.
 */
export function useCommand(
  apply: (snapshot: WorldSnapshot) => void,
  /** Called when the server says the session is gone, so the page can show sign-in again. */
  onUnauthorized?: () => void,
) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(new Map<string, string>());

  const run = useCallback(
    async (
      key: string,
      action: (requestId: string) => Promise<WorldSnapshot>,
      success?: string,
    ) => {
      if (busy) return false;
      const requestId = pending.current.get(key) ?? newRequestId();
      pending.current.set(key, requestId);
      setBusy(key);
      try {
        const snapshot = await action(requestId);
        pending.current.delete(key);
        apply(snapshot);
        if (success) toast(success, "good");
        return true;
      } catch (error) {
        // A transport failure or server error may follow a committed change: keep the ID so a
        // retry is idempotent. A definite rejection (4xx) was not recorded, so the next attempt
        // starts fresh.
        const uncertain =
          !(error instanceof ApiError) ||
          error.status === 0 ||
          error.status >= 500;
        if (!uncertain) pending.current.delete(key);
        toast(describeError(error), "bad");
        if (error instanceof ApiError && error.status === 401)
          onUnauthorized?.();
        return false;
      } finally {
        setBusy(null);
      }
    },
    [apply, busy, toast, onUnauthorized],
  );

  return { run, busy };
}
