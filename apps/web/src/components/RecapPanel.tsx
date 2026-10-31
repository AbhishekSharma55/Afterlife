import type { WorldEvent, WorldSnapshot } from "@afterlife/shared";
import { FactionEmblem } from "./FactionEmblem";
import { humanize, isStoryEvent } from "../lib/derive";

interface Props {
  snapshot: WorldSnapshot;
  events: Record<string, WorldEvent>;
  onSelectEvent?: (id: string) => void;
}

function Cited({
  ids,
  events,
  onSelect,
}: {
  ids: string[];
  events: Record<string, WorldEvent>;
  onSelect?: (id: string) => void;
}) {
  const cited = ids
    .map((id) => events[id])
    .filter((event): event is WorldEvent => !!event);
  if (!cited.length) return null;
  return (
    <span className="recap__cites">
      {cited.map((event) =>
        onSelect ? (
          <button
            key={event.id}
            type="button"
            className="recap__cite"
            onClick={() => onSelect(event.id)}
          >
            #{event.sequence}
          </button>
        ) : (
          <span key={event.id} className="recap__cite">
            #{event.sequence}
          </span>
        ),
      )}
    </span>
  );
}

/** "Previously" and "While you were away": what the world carries into this moment. */
export function RecapPanel({ snapshot, events, onSelectEvent }: Props) {
  const { recap } = snapshot;
  const credits = recap.contributionCredits ?? [];
  // Split cited events so each paragraph links to what it describes.
  const offline = recap.causeEventIds.filter(
    (id) => events[id]?.kind === "offline_development",
  );
  const previous = recap.causeEventIds.filter(
    (id) =>
      events[id] &&
      events[id].kind !== "offline_development" &&
      isStoryEvent(events[id]),
  );
  const resting = snapshot.mode === "resting";
  const fresh = snapshot.episode === null;

  return (
    <section className="recap card" aria-label="Story so far">
      <div className="recap__block">
        <span className="eyebrow">
          {fresh
            ? "The story begins"
            : resting
              ? "Last episode"
              : "Previously in your kingdom"}
        </span>
        <p className="recap__text">
          {recap.previously || "The kingdom's story has not yet begun."}
          <Cited ids={previous} events={events} onSelect={onSelectEvent} />
        </p>
      </div>
      {recap.whileAway ? (
        <div className="recap__block recap__block--away">
          <span className="eyebrow">
            {resting ? "While the stream rests" : "While you were away"}
          </span>
          <p className="recap__text">
            {recap.whileAway}
            <Cited ids={offline} events={events} onSelect={onSelectEvent} />
          </p>
        </div>
      ) : resting ? (
        <div className="recap__block recap__block--away">
          <span className="eyebrow">While the stream rests</span>
          <p className="recap__text muted">
            The kingdom is quiet for now. It keeps developing between episodes.
          </p>
        </div>
      ) : null}
      {credits.length > 0 && (
        <div className="recap__block">
          <span className="eyebrow">Remembered contributions</span>
          <ul className="credits">
            {credits.map((credit) => (
              <li
                key={`${credit.sourceEventId}:${credit.displayName}`}
                className="credit"
              >
                <FactionEmblem faction={credit.factionId} size={20} />
                <span>
                  <strong>{credit.displayName}</strong> voted to{" "}
                  <em>{humanize(credit.choiceId).toLowerCase()}</em>
                  {events[credit.sourceEventId]?.episodeNumber
                    ? ` in episode ${events[credit.sourceEventId].episodeNumber}`
                    : ""}
                  .
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
