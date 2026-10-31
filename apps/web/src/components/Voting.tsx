import type { Round, Scene, WorldEvent } from "@afterlife/shared";
import {
  choiceLabel,
  eventWhen,
  isStoryEvent,
  leadingChoiceIds,
  votePercent,
} from "../lib/derive";
import {
  formatCountdown,
  roundDurationMs,
  useCountdown,
} from "../lib/useCountdown";

/** The three numbered options, with live tallies once voting has begun. */
export function ChoiceList({
  scene,
  size = "normal",
}: {
  scene: Scene;
  size?: "normal" | "large";
}) {
  const { round } = scene;
  const showTally = round.status !== "prepared";
  const leaders = round.status === "resolved" ? [] : leadingChoiceIds(round);
  const voteOpen = round.status === "open";
  return (
    <ol className={`choices choices--${size}`} aria-label="Choices">
      {scene.choices.map((choice) => {
        const count = round.tally[choice.id] ?? 0;
        const percent = votePercent(round, choice.id);
        const winner =
          round.status === "resolved" && round.winningChoiceId === choice.id;
        const lost = round.status === "resolved" && !winner;
        const leading = leaders.length === 1 && leaders[0] === choice.id;
        return (
          <li
            key={choice.id}
            className={[
              "choice",
              winner ? "choice--winner" : "",
              lost ? "choice--lost" : "",
              leading ? "choice--leading" : "",
            ].join(" ")}
          >
            <span
              className={`choice__key${voteOpen ? " choice__key--live" : ""}`}
              aria-hidden="true"
            >
              {choice.number}
            </span>
            <span className="choice__body">
              <span className="choice__label">
                {choice.label}
                {winner && <span className="choice__badge">Chosen</span>}
                {leading && (
                  <span className="choice__badge choice__badge--leading">
                    Leading
                  </span>
                )}
              </span>
              <span className="choice__command">
                <span className="kbd">!vote {choice.number}</span>
              </span>
              {showTally && (
                <span className="choice__bar" aria-hidden="true">
                  <span
                    className="choice__fill"
                    style={{ width: `${percent}%` }}
                  />
                </span>
              )}
            </span>
            {showTally && (
              <span
                className="choice__count"
                aria-label={`${count} ${count === 1 ? "vote" : "votes"}, ${percent}%`}
              >
                <strong>{count}</strong>
                <span>{percent}%</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** A ring that drains as the server deadline approaches. */
export function Countdown({
  round,
  size = 64,
}: {
  round: Round;
  size?: number;
}) {
  const remaining = useCountdown(round);
  const duration = roundDurationMs(round);
  if (remaining === null || duration === null) return null;
  const fraction = Math.max(0, Math.min(1, remaining / duration));
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const urgent = remaining <= 10_000;
  const closing = remaining === 0;
  return (
    <div
      className={`countdown${urgent ? " countdown--urgent" : ""}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={
        closing
          ? "Counting votes"
          : `${Math.ceil(remaining / 1000)} seconds left to vote`
      }
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} className="countdown__track" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          className="countdown__ring"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span className="countdown__text">
        {closing ? "…" : formatCountdown(remaining)}
      </span>
    </div>
  );
}

/** Short status line describing where the round stands. */
export function RoundStatus({ scene }: { scene: Scene }) {
  const { round } = scene;
  const remaining = useCountdown(round);
  switch (round.status) {
    case "prepared":
      return <span className="round-status">Voting opens soon</span>;
    case "open":
      return (
        <span className="round-status round-status--open">
          {remaining === 0 ? "Counting votes…" : "Voting is open"}
          <span className="muted">
            {" "}
            · {round.totalVoters} {round.totalVoters === 1 ? "voter" : "voters"}
          </span>
        </span>
      );
    case "paused":
      return (
        <span className="round-status round-status--paused">
          Voting paused while chat reconnects · counted votes are kept
        </span>
      );
    case "resolved":
      return (
        <span className="round-status round-status--resolved">
          Decided by {round.totalVoters}{" "}
          {round.totalVoters === 1 ? "voter" : "voters"}
          {round.winningChoiceId
            ? ` · ${choiceLabel(scene, round.winningChoiceId)}`
            : ""}
        </span>
      );
    case "deferred":
      return <span className="round-status">Deferred to the next episode</span>;
  }
}

/** "The world remembers": the recorded past events this scene grows out of. */
export function Remembered({
  ids,
  events,
  heading = "The world remembers",
  onSelect,
}: {
  ids: string[];
  events: Record<string, WorldEvent>;
  heading?: string;
  onSelect?: (id: string) => void;
}) {
  // Skip bookkeeping events; unknown IDs stay so the page can show that it is still recalling them.
  const shown = ids.filter((id) => !events[id] || isStoryEvent(events[id]));
  if (!shown.length) return null;
  return (
    <aside className="remembered" aria-label={heading}>
      <span className="remembered__heading">
        <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
          <path
            d="M10 2.5a7.5 7.5 0 1 0 7.5 7.5M10 6v4l2.5 2.5M17.5 2.5v4h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {heading}
      </span>
      <ul>
        {shown.map((id) => {
          const event = events[id];
          const content = event ? (
            <>
              <span className="remembered__when">{eventWhen(event)}</span>
              <span className="remembered__what">{event.summary}</span>
            </>
          ) : (
            <span className="remembered__what muted">
              Recalling an earlier event…
            </span>
          );
          return (
            <li key={id}>
              {onSelect && event ? (
                <button
                  type="button"
                  className="remembered__link"
                  onClick={() => onSelect(id)}
                >
                  {content}
                </button>
              ) : (
                <span className="remembered__link">{content}</span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
