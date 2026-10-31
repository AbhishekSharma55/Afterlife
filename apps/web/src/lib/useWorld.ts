import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import {
  SNAPSHOT_EVENT,
  worldSnapshotSchema,
  type WorldEvent,
  type WorldSnapshot,
} from "@afterlife/shared";
import { api, ApiError } from "./api";
import { getFixture, type FixtureName } from "./fixtures";
import { referencedEventIds } from "./derive";

/** The connection between this page and the AFTERLIFE server (not Twitch). */
export type FeedStatus =
  "loading" | "live" | "reconnecting" | "not_found" | "error" | "fixture";

interface State {
  worldId: string;
  snapshot: WorldSnapshot | null;
  feed: FeedStatus;
  error: string | null;
  events: Record<string, WorldEvent>;
  loadingHistory: boolean;
  historyExhausted: boolean;
}

type Action =
  | {
      type: "reset";
      worldId: string;
      feed: FeedStatus;
      snapshot?: WorldSnapshot;
    }
  | { type: "snapshot"; snapshot: WorldSnapshot }
  | { type: "feed"; feed: FeedStatus; error?: string | null }
  | { type: "history"; events: WorldEvent[]; exhausted: boolean }
  | { type: "historyLoading"; loading: boolean };

function mergeEvents(known: Record<string, WorldEvent>, events: WorldEvent[]) {
  let next = known;
  for (const event of events) {
    if (next[event.id]) continue;
    if (next === known) next = { ...known };
    next[event.id] = event;
  }
  return next;
}

function initial(
  worldId: string,
  snapshot?: WorldSnapshot,
  feed: FeedStatus = "loading",
): State {
  return {
    worldId,
    snapshot: snapshot ?? null,
    feed,
    error: null,
    events: snapshot ? mergeEvents({}, snapshot.recentEvents) : {},
    loadingHistory: false,
    historyExhausted: snapshot
      ? (snapshot.recentEvents[0]?.sequence ?? 1) <= 1
      : false,
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return initial(action.worldId, action.snapshot, action.feed);
    case "snapshot": {
      const next = action.snapshot;
      if (next.worldId !== state.worldId) return state;
      // Snapshots can arrive out of order (a slow POST response after a newer stream event). Newest wins.
      if (state.snapshot && next.revision <= state.snapshot.revision)
        return state;
      const events = mergeEvents(state.events, next.recentEvents);
      const oldest = Math.min(
        ...Object.values(events).map((event) => event.sequence),
      );
      return {
        ...state,
        snapshot: next,
        events,
        historyExhausted: state.historyExhausted || oldest <= 1,
      };
    }
    case "feed":
      return { ...state, feed: action.feed, error: action.error ?? null };
    case "history":
      return {
        ...state,
        events: mergeEvents(state.events, action.events),
        historyExhausted: action.exhausted,
        loadingHistory: false,
      };
    case "historyLoading":
      return { ...state, loadingHistory: action.loading };
  }
}

export interface WorldFeed {
  snapshot: WorldSnapshot | null;
  feed: FeedStatus;
  error: string | null;
  /** Every event this page has seen, by ID: recent snapshot events plus loaded history. */
  events: Record<string, WorldEvent>;
  /** Known events, newest first. */
  chronicle: WorldEvent[];
  loadingHistory: boolean;
  hasOlderHistory: boolean;
  loadOlderHistory: () => Promise<void>;
  /** Apply a snapshot returned by a creator command. Older revisions are ignored. */
  apply: (snapshot: WorldSnapshot) => void;
  isFixture: boolean;
}

/**
 * Subscribe to one world. Live worlds load over HTTP and then follow the server-sent snapshot
 * stream; fixtures render a fixed backend-generated rehearsal snapshot.
 */
export function useWorld(
  worldId: string,
  fixture?: FixtureName | null,
): WorldFeed {
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    fixture
      ? initial(worldId, getFixture(fixture), "fixture")
      : initial(worldId),
  );
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (fixture) {
      dispatch({
        type: "reset",
        worldId,
        feed: "fixture",
        snapshot: getFixture(fixture),
      });
      return;
    }
    dispatch({ type: "reset", worldId, feed: "loading" });
    let disposed = false;
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    const load = async () => {
      try {
        const snapshot = await api.getWorld(worldId);
        if (!disposed) dispatch({ type: "snapshot", snapshot });
        return true;
      } catch (error) {
        if (disposed) return false;
        if (error instanceof ApiError && error.status === 404) {
          dispatch({
            type: "feed",
            feed: "not_found",
            error: "This kingdom does not exist.",
          });
          return false;
        }
        dispatch({
          type: "feed",
          feed: stateRef.current.snapshot ? "reconnecting" : "error",
          error:
            error instanceof Error
              ? error.message
              : "The world could not be loaded.",
        });
        return true;
      }
    };

    const connect = () => {
      if (disposed) return;
      source?.close();
      source = new EventSource(
        `/api/worlds/${encodeURIComponent(worldId)}/stream`,
      );
      source.addEventListener("open", () => {
        attempt = 0;
        dispatch({ type: "feed", feed: "live" });
        // Persisted server state wins after any gap: reload rather than trusting what we last saw.
        void load();
      });
      source.addEventListener(SNAPSHOT_EVENT, (message) => {
        try {
          const parsed = worldSnapshotSchema.safeParse(
            JSON.parse((message as MessageEvent<string>).data),
          );
          if (parsed.success)
            dispatch({ type: "snapshot", snapshot: parsed.data });
        } catch {
          // A malformed frame is ignored; the next snapshot or reload restores the view.
        }
      });
      source.addEventListener("error", () => {
        if (disposed) return;
        dispatch({
          type: "feed",
          feed: stateRef.current.snapshot ? "reconnecting" : "loading",
        });
        // The browser retries on its own while CONNECTING; a CLOSED stream needs a manual retry.
        if (source?.readyState === EventSource.CLOSED) {
          source.close();
          const delay = Math.min(15_000, 1000 * 2 ** attempt++);
          retryTimer = setTimeout(connect, delay);
        }
      });
    };

    void load().then((keepGoing) => {
      if (keepGoing && !disposed) connect();
    });
    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      source?.close();
    };
  }, [worldId, fixture]);

  const loadOlderHistory = useCallback(async () => {
    const current = stateRef.current;
    if (fixture || current.loadingHistory || current.historyExhausted) return;
    const known = Object.values(current.events);
    const before = known.length
      ? Math.min(...known.map((event) => event.sequence))
      : undefined;
    dispatch({ type: "historyLoading", loading: true });
    try {
      const page = await api.history(worldId, before);
      dispatch({
        type: "history",
        events: page.events,
        exhausted: page.nextCursor === null,
      });
    } catch {
      dispatch({ type: "historyLoading", loading: false });
    }
  }, [worldId, fixture]);

  // A scene or recap can cite an event older than the snapshot's recent window. Fetch it so every
  // "because of" link can show what actually happened.
  const missing = useMemo(() => {
    if (!state.snapshot) return 0;
    return referencedEventIds(state.snapshot).filter((id) => !state.events[id])
      .length;
  }, [state.snapshot, state.events]);
  const autoFetches = useRef(0);
  useEffect(() => {
    autoFetches.current = 0;
  }, [worldId]);
  useEffect(() => {
    if (
      !missing ||
      state.historyExhausted ||
      state.loadingHistory ||
      state.feed === "fixture"
    )
      return;
    // Bounded: a failing history endpoint must not turn into a request loop.
    if (autoFetches.current >= 10) return;
    autoFetches.current++;
    void loadOlderHistory();
  }, [
    missing,
    state.historyExhausted,
    state.loadingHistory,
    state.feed,
    loadOlderHistory,
  ]);

  const chronicle = useMemo(
    () => Object.values(state.events).sort((a, b) => b.sequence - a.sequence),
    [state.events],
  );
  const apply = useCallback(
    (snapshot: WorldSnapshot) => dispatch({ type: "snapshot", snapshot }),
    [],
  );

  return {
    snapshot: state.snapshot,
    feed: state.feed,
    error: state.error,
    events: state.events,
    chronicle,
    loadingHistory: state.loadingHistory,
    hasOlderHistory: !state.historyExhausted,
    loadOlderHistory,
    apply,
    isFixture: state.feed === "fixture",
  };
}
