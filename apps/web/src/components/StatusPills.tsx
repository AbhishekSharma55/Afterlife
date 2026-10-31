import type { WorldSnapshot } from "@afterlife/shared";
import type { FeedStatus } from "../lib/useWorld";

type Tone = "good" | "warn" | "bad" | "info" | "muted";

function Pill({
  tone,
  label,
  title,
}: {
  tone: Tone;
  label: string;
  title?: string;
}) {
  return (
    <span className={`pill tone-${tone}`} title={title}>
      <span className="pill__dot" aria-hidden="true" />
      <span style={{ color: "var(--ink)" }}>{label}</span>
    </span>
  );
}

const CHAT: Record<
  WorldSnapshot["twitch"]["connection"],
  { tone: Tone; label: string }
> = {
  connected: { tone: "good", label: "Chat connected" },
  connecting: { tone: "info", label: "Chat connecting" },
  reconnecting: { tone: "warn", label: "Chat reconnecting" },
  disconnected: { tone: "muted", label: "Chat disconnected" },
  unauthorized: { tone: "bad", label: "Chat needs sign-in" },
};

const BROADCAST: Record<
  WorldSnapshot["twitch"]["broadcast"],
  { tone: Tone; label: string }
> = {
  live: { tone: "bad", label: "Live on Twitch" },
  offline: { tone: "muted", label: "Stream offline" },
  unknown: { tone: "muted", label: "Stream status unknown" },
};

const FEED: Record<FeedStatus, { tone: Tone; label: string }> = {
  loading: { tone: "info", label: "Loading world" },
  live: { tone: "good", label: "Server synced" },
  reconnecting: { tone: "warn", label: "Server reconnecting" },
  not_found: { tone: "bad", label: "World not found" },
  error: { tone: "bad", label: "Server unreachable" },
  fixture: { tone: "info", label: "Fixture preview" },
};

export function ChatPill({ snapshot }: { snapshot: WorldSnapshot }) {
  const chat = CHAT[snapshot.twitch.connection];
  return <Pill {...chat} title="Twitch chat connection for this world" />;
}

export function BroadcastPill({ snapshot }: { snapshot: WorldSnapshot }) {
  const broadcast = BROADCAST[snapshot.twitch.broadcast];
  return <Pill {...broadcast} title="Twitch broadcast presence" />;
}

export function FeedPill({ feed }: { feed: FeedStatus }) {
  return (
    <Pill
      {...FEED[feed]}
      title="This page's connection to the AFTERLIFE server"
    />
  );
}

export function NarratorPill({ snapshot }: { snapshot: WorldSnapshot }) {
  if (snapshot.narratorStatus === "working")
    return <Pill tone="info" label="Narrator writing" />;
  if (snapshot.narratorStatus === "fallback")
    return (
      <Pill
        tone="muted"
        label="Factual narration"
        title="AI narration unavailable; showing recorded facts"
      />
    );
  return <Pill tone="good" label="AI narrator ready" />;
}

/** Always visible on rehearsal worlds so practice footage is never mistaken for live participation. */
export function RehearsalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="rehearsal-badge"
      title="Rehearsal world: synthetic or practice input, not live Twitch participation"
    >
      {compact ? "Rehearsal" : "Rehearsal · practice data"}
    </span>
  );
}
