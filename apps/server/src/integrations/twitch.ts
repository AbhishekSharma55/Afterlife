import { randomBytes } from "node:crypto";

export type Fetcher = typeof fetch;
export interface TwitchTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
}
export interface TwitchIdentity {
  id: string;
  login: string;
  displayName: string;
}

/** Short-lived, single-use CSRF state. Bind the returned nonce to the browser session too. */
export class OAuthStateStore {
  private pending = new Map<string, { binding: string; expiresAt: number }>();
  constructor(
    private now: () => number = Date.now,
    private ttlMs = 600_000,
  ) {}
  create(binding: string): string {
    for (const [key, state] of this.pending)
      if (state.expiresAt <= this.now()) this.pending.delete(key);
    if (this.pending.size >= 1000)
      throw new Error("Too many pending authorizations");
    const state = randomBytes(32).toString("hex");
    this.pending.set(state, { binding, expiresAt: this.now() + this.ttlMs });
    return state;
  }
  consume(state: string, binding: string): boolean {
    const value = this.pending.get(state);
    this.pending.delete(state);
    return !!value && value.binding === binding && value.expiresAt > this.now();
  }
}

export class TwitchOAuth {
  constructor(
    readonly clientId: string,
    private clientSecret: string,
    readonly redirectUri: string,
    private request: Fetcher = fetch,
  ) {}
  authorizationUrl(state: string): string {
    const url = new URL("https://id.twitch.tv/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: "user:read:chat",
      state,
    }).toString();
    return url.toString();
  }
  exchangeCode(code: string): Promise<TwitchTokens> {
    return this.token({
      grant_type: "authorization_code",
      code,
      redirect_uri: this.redirectUri,
    });
  }
  refresh(refreshToken: string): Promise<TwitchTokens> {
    return this.token({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
  }
  private async token(
    parameters: Record<string, string>,
  ): Promise<TwitchTokens> {
    const response = await this.request("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        ...parameters,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Twitch authorization failed (${response.status})`);
    const body = (await response.json()) as Record<string, unknown>;
    if (
      typeof body.access_token !== "string" ||
      typeof body.refresh_token !== "string" ||
      typeof body.expires_in !== "number" ||
      !Array.isArray(body.scope) ||
      !body.scope.includes("user:read:chat")
    )
      throw new Error("Invalid Twitch token response or missing chat scope");
    return {
      accessToken: body.access_token,
      refreshToken: body.refresh_token,
      expiresIn: body.expires_in,
      scopes: body.scope.filter((s): s is string => typeof s === "string"),
    };
  }
  async getIdentity(accessToken: string): Promise<TwitchIdentity> {
    const response = await this.request("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": this.clientId,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Twitch identity request failed (${response.status})`);
    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
    };
    const user = body.data?.[0];
    if (
      !user ||
      typeof user.id !== "string" ||
      typeof user.login !== "string" ||
      typeof user.display_name !== "string"
    )
      throw new Error("Invalid Twitch identity response");
    return { id: user.id, login: user.login, displayName: user.display_name };
  }
}

export type ChatCommand =
  | { type: "join"; factionId: "red" | "blue" }
  | { type: "vote"; choiceNumber: 1 | 2 | 3 };
export function parseChatCommand(text: string): ChatCommand | null {
  const join = /^!join\s+(red|blue)$/i.exec(text.trim());
  if (join)
    return {
      type: "join",
      factionId: join[1]!.toLowerCase() as "red" | "blue",
    };
  const vote = /^!vote\s+([123])$/i.exec(text.trim());
  return vote
    ? { type: "vote", choiceNumber: Number(vote[1]) as 1 | 2 | 3 }
    : null;
}

export interface ChatInput {
  messageId: string;
  broadcasterId: string;
  userId: string;
  displayName: string;
  timestamp: string;
  command: ChatCommand;
}
export interface SocketLike {
  addEventListener(type: string, listener: (event: any) => void): void;
  close(): void;
}
export interface EventSubOptions {
  broadcasterId: string;
  clientId: string;
  accessToken: () => string;
  onCommand: (input: ChatInput) => void | Promise<void>;
  onPresence?: (presence: "live" | "offline") => void | Promise<void>;
  onConnection?: (
    state:
      | "connecting"
      | "connected"
      | "reconnecting"
      | "disconnected"
      | "unauthorized",
  ) => void;
  onError?: (message: string) => void;
  request?: Fetcher;
  socketFactory?: (url: string) => SocketLike;
  now?: () => number;
}

/** Own-channel EventSub connection. Durable command deduplication remains the engine's responsibility. */
export class TwitchEventSub {
  private current?: SocketLike;
  private pending?: SocketLike;
  private generation = 0;
  private stopped = true;
  private watchdog?: ReturnType<typeof setTimeout>;
  private retry?: ReturnType<typeof setTimeout>;
  private seen = new Map<string, number>();
  private keepaliveSeconds = 10;
  private queue = Promise.resolve();
  private now: () => number;
  constructor(private options: EventSubOptions) {
    this.now = options.now ?? Date.now;
  }
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect("wss://eventsub.wss.twitch.tv/ws", false);
  }
  stop(): void {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.watchdog);
    clearTimeout(this.retry);
    this.current?.close();
    this.pending?.close();
    this.current = undefined;
    this.pending = undefined;
    this.options.onConnection?.("disconnected");
  }
  private connect(url: string, migrating: boolean): void {
    if (this.stopped) return;
    this.options.onConnection?.(migrating ? "reconnecting" : "connecting");
    const socket = (
      this.options.socketFactory ?? ((address) => new WebSocket(address))
    )(url);
    const generation = this.generation;
    if (migrating) this.pending = socket;
    else this.current = socket;
    socket.addEventListener("message", (event) => {
      this.queue = this.queue
        .then(async () => {
          if (
            this.stopped ||
            generation !== this.generation ||
            (socket !== this.current && socket !== this.pending)
          )
            return;
          let message: any;
          try {
            message = JSON.parse(String(event.data));
          } catch {
            return;
          }
          const kind = message.metadata?.message_type;
          if (kind === "session_welcome") {
            const session = message.payload?.session;
            if (typeof session?.id !== "string") return;
            if (migrating) {
              const old = this.current;
              this.current = socket;
              this.pending = undefined;
              old?.close();
            } else await this.subscribe(session.id);
            this.keepaliveSeconds = Math.max(
              10,
              Math.min(600, Number(session.keepalive_timeout_seconds) || 10),
            );
            this.armWatchdog(this.keepaliveSeconds);
            this.options.onConnection?.("connected");
          } else if (kind === "session_reconnect") {
            const address = message.payload?.session?.reconnect_url;
            if (typeof address === "string") {
              const parsed = new URL(address);
              if (
                parsed.protocol === "wss:" &&
                parsed.hostname.endsWith(".twitch.tv")
              )
                this.connect(address, true);
            }
          } else if (kind === "revocation") {
            this.stop();
            this.options.onConnection?.("unauthorized");
          } else {
            this.armWatchdog(this.keepaliveSeconds);
            await this.ingest(message);
          }
        })
        .catch(() => {
          this.options.onError?.("Twitch event processing failed");
          this.reconnect(socket);
        });
    });
    socket.addEventListener("close", () => this.reconnect(socket));
    socket.addEventListener("error", () => this.reconnect(socket));
  }
  private armWatchdog(seconds: number): void {
    clearTimeout(this.watchdog);
    this.watchdog = setTimeout(
      () => {
        if (this.current) this.reconnect(this.current);
      },
      (seconds + 2) * 1000,
    );
    this.watchdog.unref?.();
  }
  private reconnect(socket: SocketLike): void {
    if (!this.stopped && socket === this.pending) {
      this.pending = undefined;
      socket.close();
      this.options.onError?.(
        "Twitch migration interrupted; awaiting reconnect",
      );
      return;
    }
    if (this.stopped || socket !== this.current || this.pending || this.retry)
      return;
    this.options.onConnection?.("reconnecting");
    this.current = undefined;
    this.generation++;
    socket.close();
    clearTimeout(this.watchdog);
    this.retry = setTimeout(() => {
      this.retry = undefined;
      this.connect("wss://eventsub.wss.twitch.tv/ws", false);
    }, 1000);
    this.retry.unref?.();
  }
  private async subscribe(sessionId: string): Promise<void> {
    const request = this.options.request ?? fetch;
    for (const type of [
      "channel.chat.message",
      "stream.online",
      "stream.offline",
    ]) {
      const condition =
        type === "channel.chat.message"
          ? {
              broadcaster_user_id: this.options.broadcasterId,
              user_id: this.options.broadcasterId,
            }
          : { broadcaster_user_id: this.options.broadcasterId };
      const response = await request(
        "https://api.twitch.tv/helix/eventsub/subscriptions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Id": this.options.clientId,
            Authorization: `Bearer ${this.options.accessToken()}`,
          },
          body: JSON.stringify({
            type,
            version: "1",
            condition,
            transport: { method: "websocket", session_id: sessionId },
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!response.ok)
        throw new Error(`Twitch subscription failed (${response.status})`);
    }
  }
  async ingest(message: any): Promise<void> {
    const metadata = message?.metadata;
    if (
      metadata?.message_type !== "notification" ||
      typeof metadata.message_id !== "string"
    )
      return;
    const timestamp = metadata.message_timestamp;
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed) || Math.abs(this.now() - parsed) > 600_000)
      return;
    for (const [key, expiry] of this.seen)
      if (expiry <= this.now()) this.seen.delete(key);
    if (this.seen.has(metadata.message_id)) return;
    const event = message.payload?.event;
    if (event?.broadcaster_user_id !== this.options.broadcasterId) return;
    // Mark only after processing succeeds so transient failures can be retried.
    if (metadata.subscription_type === "channel.chat.message") {
      const command =
        typeof event.message?.text === "string"
          ? parseChatCommand(event.message.text)
          : null;
      if (
        !command ||
        typeof event.chatter_user_id !== "string" ||
        typeof event.chatter_user_name !== "string"
      )
        return;
      await this.options.onCommand({
        messageId: metadata.message_id,
        broadcasterId: event.broadcaster_user_id,
        userId: event.chatter_user_id,
        displayName: event.chatter_user_name,
        timestamp,
        command,
      });
    } else if (metadata.subscription_type === "stream.online")
      await this.options.onPresence?.("live");
    else if (metadata.subscription_type === "stream.offline")
      await this.options.onPresence?.("offline");
    this.seen.set(metadata.message_id, this.now() + 600_000);
    if (this.seen.size > 10_000)
      this.seen.delete(this.seen.keys().next().value!);
  }
}
