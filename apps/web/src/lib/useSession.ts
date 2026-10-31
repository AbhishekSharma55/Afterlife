import { useCallback, useEffect, useState } from "react";
import { api, type CreatorIdentity } from "./api";

export type SessionState =
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; identity: CreatorIdentity }
  | { status: "error"; message: string };

/** The creator's server session. Provider tokens never reach the browser; only identity and worlds. */
export function useSession(enabled = true) {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const refresh = useCallback(async () => {
    try {
      const identity = await api.me();
      setState(
        identity ? { status: "signed_in", identity } : { status: "signed_out" },
      );
    } catch (error) {
      setState({
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Could not check your session.",
      });
    }
  }, []);
  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);
  return { session: state, refresh };
}
