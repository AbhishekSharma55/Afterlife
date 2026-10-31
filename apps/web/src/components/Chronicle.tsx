import { useEffect, useRef, useState } from "react";
import type { WorldEvent } from "@afterlife/shared";
import { eventKind, eventWhen, isStoryEvent } from "../lib/derive";

interface Props {
  events: WorldEvent[];
  known: Record<string, WorldEvent>;
  /** Events the current scene or recap cites; marked as remembered. */
  remembered?: string[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  hasOlder?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void;
  limit?: number;
}

const time = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * The world's permanent record, newest first. Episode boundaries are hidden by default so the
 * story reads cleanly; cause links connect each consequence to its origin.
 */
export function Chronicle({
  events,
  known,
  remembered = [],
  selectedId,
  onSelect,
  hasOlder,
  loadingOlder,
  onLoadOlder,
  limit,
}: Props) {
  const [showAll, setShowAll] = useState(false);
  const story = events.filter(isStoryEvent);
  const visible = showAll ? events : story;
  const hidden = events.length - story.length;
  const items = limit ? visible.slice(0, limit) : visible;
  const selectedRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedId]);

  if (!items.length) return <p className="muted">Nothing has happened yet.</p>;
  return (
    <div className="chronicle">
      <ol className="chronicle__list">
        {items.map((event) => {
          const kind = eventKind(event.kind);
          const isRemembered =
            remembered.includes(event.id) && isStoryEvent(event);
          const isSelected = selectedId === event.id;
          return (
            <li
              key={event.id}
              id={`event-${event.id}`}
              ref={isSelected ? selectedRef : undefined}
              className={[
                "entry",
                `entry--${kind.tone}`,
                isRemembered ? "entry--remembered" : "",
                isSelected ? "entry--selected" : "",
              ].join(" ")}
            >
              <span className="entry__marker" aria-hidden="true" />
              <div className="entry__body">
                <p className="entry__summary">{event.summary}</p>
                <div className="entry__meta">
                  <span className={`entry__kind entry__kind--${kind.tone}`}>
                    {kind.label}
                  </span>
                  {/* "While resting" and "Founding" already say when they happened. */}
                  {(kind.tone === "decision" || kind.tone === "episode") && (
                    <span>{eventWhen(event)}</span>
                  )}
                  <time
                    dateTime={event.effectiveAt}
                    title={`Recorded ${new Date(event.processedAt).toLocaleString()}`}
                  >
                    {time.format(new Date(event.effectiveAt))}
                  </time>
                  <span className="entry__seq">#{event.sequence}</span>
                  {isRemembered && (
                    <span className="entry__flag">Remembered</span>
                  )}
                  {event.causeEventIds.map((id) => {
                    const cause = known[id];
                    const label = cause
                      ? `Because of #${cause.sequence}`
                      : "Because of an earlier event";
                    return onSelect && cause ? (
                      <button
                        key={id}
                        type="button"
                        className="entry__cause"
                        onClick={() => onSelect(id)}
                      >
                        {label}
                      </button>
                    ) : (
                      <span key={id} className="entry__cause">
                        {label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {(hidden > 0 || (hasOlder && onLoadOlder && !limit)) && (
        <div className="chronicle__actions">
          {hidden > 0 && (
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => setShowAll((value) => !value)}
              aria-pressed={showAll}
            >
              {showAll ? "Story events only" : `Show all events (+${hidden})`}
            </button>
          )}
          {hasOlder && onLoadOlder && !limit && (
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={onLoadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? "Loading…" : "Load older history"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
