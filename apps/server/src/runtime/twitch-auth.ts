import type { TwitchTokens } from "../integrations/twitch.js";

/** Memory-only token rotation. Refresh is single-flight; secrets never leave Helix. */
export class RefreshingTwitchSession {
  private tokens: TwitchTokens;
  private expiresAt: number;
  private pending?: Promise<void>;
  private readonly now: () => number;
  constructor(
    private options: {
      tokens: TwitchTokens;
      refresh: (refreshToken: string) => Promise<TwitchTokens>;
      request?: typeof fetch;
      now?: () => number;
    },
  ) {
    this.tokens = options.tokens;
    this.now = options.now ?? Date.now;
    this.expiresAt = this.now() + this.tokens.expiresIn * 1000;
  }
  accessToken = (): string => this.tokens.accessToken;
  async refreshIfDue(): Promise<void> {
    if (this.now() >= this.expiresAt - 120000) await this.rotate();
  }
  private async rotate(): Promise<void> {
    if (this.pending) return this.pending;
    const work = (async () => {
      const next = await this.options.refresh(this.tokens.refreshToken);
      if (
        !next.accessToken ||
        !next.refreshToken ||
        !Number.isFinite(next.expiresIn) ||
        next.expiresIn <= 0 ||
        !next.scopes.includes("user:read:chat")
      ) {
        throw new Error("Twitch token refresh returned invalid credentials");
      }
      this.tokens = next;
      this.expiresAt = this.now() + next.expiresIn * 1000;
    })();
    this.pending = work;
    try {
      await work;
    } finally {
      this.pending = undefined;
    }
  }
  request: typeof fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (
      url.origin !== "https://api.twitch.tv" ||
      !url.pathname.startsWith("/helix/")
    ) {
      throw new Error("Authenticated Twitch requests must target Helix");
    }
    await this.refreshIfDue();
    const sentToken = this.tokens.accessToken;
    const send = () => {
      const headers = new Headers(init?.headers);
      headers.set("Authorization", `Bearer ${this.tokens.accessToken}`);
      return (this.options.request ?? fetch)(input, {
        ...init,
        headers,
        redirect: "error",
      });
    };
    const response = await send();
    if (response.status !== 401) return response;
    if (this.tokens.accessToken === sentToken) await this.rotate();
    return send();
  };
}

/** Unknown is distinct from offline when Twitch cannot confirm stream presence. */
export async function fetchBroadcastPresence(
  session: Pick<RefreshingTwitchSession, "request">,
  broadcasterId: string,
  clientId: string,
): Promise<"live" | "offline" | "unknown"> {
  try {
    const url = new URL("https://api.twitch.tv/helix/streams");
    url.searchParams.set("user_id", broadcasterId);
    const response = await session.request(url, {
      headers: { "Client-Id": clientId },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return "unknown";
    const body = (await response.json()) as { data?: unknown };
    if (!Array.isArray(body.data)) return "unknown";
    if (body.data.length === 0) return "offline";
    return body.data.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        entry.user_id === broadcasterId &&
        entry.type === "live",
    )
      ? "live"
      : "unknown";
  } catch {
    return "unknown";
  }
}
