import {
  apiErrorSchema,
  historyPageSchema,
  worldSnapshotSchema,
  type HistoryPage,
  type WorldSnapshot,
} from "@afterlife/shared";
import { observeServerDate } from "./clock";

/** An error the backend described with its `{ error: { code, message } }` shape, or a transport failure. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface CreatorIdentity {
  id: string;
  rehearsal: boolean;
  worlds: WorldSnapshot[];
}

const REQUEST_TIMEOUT_MS = 90_000;

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(
      0,
      "network_error",
      "The kingdom server could not be reached.",
    );
  } finally {
    clearTimeout(timer);
  }
  observeServerDate(response.headers.get("Date"));
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }
  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (parsed.success)
      throw new ApiError(
        response.status,
        parsed.data.error.code,
        parsed.data.error.message,
      );
    throw new ApiError(
      response.status,
      "http_error",
      `The server responded with ${response.status}.`,
    );
  }
  return body;
}

function parseSnapshot(body: unknown): WorldSnapshot {
  const parsed = worldSnapshotSchema.safeParse(body);
  if (!parsed.success)
    throw new ApiError(
      0,
      "invalid_snapshot",
      "The server sent a world the interface does not understand.",
    );
  return parsed.data;
}

const post = (path: string, body: unknown) =>
  request(path, { method: "POST", body: JSON.stringify(body) });

/** A fresh idempotency key for one creator action. Retrying the same action must reuse it. */
export function newRequestId(): string {
  return crypto.randomUUID();
}

export const api = {
  getWorld: async (worldId: string) =>
    parseSnapshot(await request(`/api/worlds/${encodeURIComponent(worldId)}`)),

  history: async (worldId: string, before?: number): Promise<HistoryPage> => {
    const query = before === undefined ? "" : `?before=${before}`;
    const parsed = historyPageSchema.safeParse(
      await request(
        `/api/worlds/${encodeURIComponent(worldId)}/history${query}`,
      ),
    );
    if (!parsed.success)
      throw new ApiError(
        0,
        "invalid_history",
        "The server sent history the interface does not understand.",
      );
    return parsed.data;
  },

  me: async (): Promise<CreatorIdentity | null> => {
    try {
      const body = (await request("/api/me")) as {
        id?: unknown;
        rehearsal?: unknown;
        worlds?: unknown;
      };
      const worlds = Array.isArray(body.worlds)
        ? body.worlds.flatMap((world) => {
            const parsed = worldSnapshotSchema.safeParse(world);
            return parsed.success ? [parsed.data] : [];
          })
        : [];
      return {
        id: String(body.id),
        rehearsal: body.rehearsal === true,
        worlds,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  rehearsalSignIn: () => post("/auth/rehearsal", {}),
  logout: () => post("/auth/logout", {}),

  createWorld: async (name?: string) =>
    parseSnapshot(await post("/api/worlds", name ? { name } : {})),

  startEpisode: async (worldId: string, requestId: string) =>
    parseSnapshot(
      await post(`/api/worlds/${encodeURIComponent(worldId)}/episodes/start`, {
        requestId,
      }),
    ),

  endEpisode: async (worldId: string, episodeId: string, requestId: string) =>
    parseSnapshot(
      await post(
        `/api/worlds/${encodeURIComponent(worldId)}/episodes/${encodeURIComponent(episodeId)}/end`,
        { requestId },
      ),
    ),

  prepareScene: async (worldId: string, requestId: string) =>
    parseSnapshot(
      await post(`/api/worlds/${encodeURIComponent(worldId)}/scenes/prepare`, {
        requestId,
      }),
    ),

  roundAction: async (
    worldId: string,
    roundId: string,
    action: "open" | "close" | "resume",
    requestId: string,
    durationSeconds?: number,
  ) =>
    parseSnapshot(
      await post(
        `/api/worlds/${encodeURIComponent(worldId)}/rounds/${encodeURIComponent(roundId)}/${action}`,
        action === "open" && durationSeconds
          ? { requestId, durationSeconds }
          : { requestId },
      ),
    ),

  rehearsalChat: async (
    worldId: string,
    viewer: "red" | "blue",
    text: string,
    requestId: string,
  ) =>
    parseSnapshot(
      await post(`/api/worlds/${encodeURIComponent(worldId)}/rehearsal/chat`, {
        requestId,
        viewer,
        text,
      }),
    ),
};

/** Readable copy for the error codes a creator is most likely to meet. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError))
    return "Something went wrong. Please try again.";
  switch (error.code) {
    case "network_error":
      return "The kingdom server could not be reached. Check that the backend is running.";
    case "unauthenticated":
      return "Your session has ended. Sign in again to control the kingdom.";
    case "rehearsal_only":
      return "A rehearsal session can only control rehearsal worlds.";
    case "FORBIDDEN":
    case "forbidden":
      return "Only this world's broadcaster can do that.";
    case "CHAT_DISCONNECTED":
      return "Reconnect Twitch chat before resuming the vote.";
    case "invalid_origin":
      return "This page's address is not allowed by the server. Set PUBLIC_ORIGIN to this origin.";
    case "oauth_unconfigured":
      return "Twitch sign-in is not configured on this server.";
    default:
      return error.message;
  }
}
