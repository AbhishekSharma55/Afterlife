import { useEffect, useLayoutEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { WorldEvent, WorldSnapshot } from "@afterlife/shared";
import { FactionEmblem } from "../components/FactionEmblem";
import { KingdomMap } from "../components/KingdomMap";
import { FixtureBar, useFixtureParam } from "../components/Shell";
import { RehearsalBadge } from "../components/StatusPills";
import { ChoiceList, Countdown, RoundStatus } from "../components/Voting";
import {
  eventWhen,
  formatSigned,
  isStoryEvent,
  locationStatusLabel,
  outcomeHeadline,
  trustStanding,
  type SnapshotDelta,
} from "../lib/derive";
import { useDelta } from "../lib/useDelta";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useWorld } from "../lib/useWorld";

const STAGE_W = 1920;
const STAGE_H = 1080;

/** Scale the fixed 1080p stage to fit any window; OBS renders it 1:1 at 1920×1080. */
function useStageScale(reservedTop: number) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const update = () =>
      setScale(
        Math.min(
          window.innerWidth / STAGE_W,
          (window.innerHeight - reservedTop) / STAGE_H,
        ),
      );
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [reservedTop]);
  return scale;
}

/** Height of the fixture switcher, which sits above the stage in preview mode. */
const FIXTURE_BAR_H = 41;

function JoinHint() {
  return (
    <div className="ov-join">
      <span>Join a side</span>
      <span className="ov-join__cmd ov-join__cmd--red">
        <FactionEmblem faction="red" size={26} />
        !join red
      </span>
      <span className="ov-join__cmd ov-join__cmd--blue">
        <FactionEmblem faction="blue" size={26} />
        !join blue
      </span>
    </div>
  );
}

function Memory({
  ids,
  events,
}: {
  ids: string[];
  events: Record<string, WorldEvent>;
}) {
  const cited = ids
    .map((id) => events[id])
    .filter((event): event is WorldEvent => !!event && isStoryEvent(event));
  if (!cited.length) return null;
  // The oldest cited event is the root of the story; show it as the memory.
  const root = cited.reduce((a, b) => (a.sequence <= b.sequence ? a : b));
  return (
    <div className="ov-memory">
      <span className="ov-memory__label">
        The world remembers · {eventWhen(root)}
      </span>
      <span className="ov-memory__text">{root.summary}</span>
    </div>
  );
}

function ScenePanel({
  snapshot,
  events,
}: {
  snapshot: WorldSnapshot;
  events: Record<string, WorldEvent>;
}) {
  const scene = snapshot.scene!;
  const outcome = outcomeHeadline(scene);
  return (
    <section className={`ov-panel ov-scene ov-scene--${scene.round.status}`}>
      <header className="ov-scene__head">
        <div>
          <span className="ov-eyebrow">
            Episode {snapshot.episode?.number} · The council decides
          </span>
          <h2 className="ov-title">{scene.title}</h2>
        </div>
        <Countdown round={scene.round} size={104} />
      </header>
      {!outcome && <p className="ov-narration">{scene.narration}</p>}
      <Memory ids={scene.causeEventIds} events={events} />
      {outcome && <p className="ov-outcome">{outcome}</p>}
      <ChoiceList scene={scene} size="large" />
      <footer className="ov-scene__foot">
        <RoundStatus scene={scene} />
      </footer>
    </section>
  );
}

function IdlePanel({
  snapshot,
  events,
}: {
  snapshot: WorldSnapshot;
  events: Record<string, WorldEvent>;
}) {
  const { recap } = snapshot;
  if (snapshot.mode === "resting")
    return (
      <section className="ov-panel ov-idle">
        <span className="ov-eyebrow">
          Episode {snapshot.episode?.number} has ended
        </span>
        <h2 className="ov-title">The stream ends. The world remembers.</h2>
        <p className="ov-narration">{recap.previously}</p>
        {recap.whileAway ? (
          <div className="ov-away">
            <span className="ov-memory__label">While you were away</span>
            <span className="ov-memory__text">{recap.whileAway}</span>
          </div>
        ) : (
          <p className="ov-narration ov-narration--soft">
            The kingdom keeps moving until the next episode.
          </p>
        )}
      </section>
    );
  const returning = (snapshot.episode?.number ?? 0) > 1;
  return (
    <section className="ov-panel ov-idle">
      <span className="ov-eyebrow">
        {snapshot.mode === "ready"
          ? "A new kingdom"
          : `Episode ${snapshot.episode?.number}`}
      </span>
      <h2 className="ov-title">
        {snapshot.mode === "ready"
          ? "Choose your side"
          : returning
            ? "Previously in your kingdom"
            : "The story begins"}
      </h2>
      <p className="ov-narration">{recap.previously}</p>
      {returning && recap.whileAway && (
        <div className="ov-away">
          <span className="ov-memory__label">While you were away</span>
          <span className="ov-memory__text">{recap.whileAway}</span>
        </div>
      )}
      {snapshot.scene?.round.status === "deferred" && (
        <Memory ids={snapshot.scene.causeEventIds} events={events} />
      )}
      <p className="ov-narration ov-narration--soft">
        The next dilemma arrives soon.
      </p>
    </section>
  );
}

function RealmStrip({
  snapshot,
  change,
}: {
  snapshot: WorldSnapshot;
  change: SnapshotDelta | undefined;
}) {
  const standing = trustStanding(snapshot.relationship.trust);
  return (
    <section className="ov-realm">
      <div className="ov-realm__map">
        <KingdomMap
          locations={snapshot.locations}
          changed={Object.keys(change?.locations ?? {})}
          compact
        />
      </div>
      <div className="ov-realm__stats">
        {snapshot.factions.map((entry) => {
          const delta = change?.factions[entry.id];
          return (
            <div
              key={entry.id}
              className={`ov-faction ov-faction--${entry.id}`}
            >
              <FactionEmblem faction={entry.id} size={30} />
              <span className="ov-faction__name">{entry.name}</span>
              <span className="ov-faction__stat">
                Supplies <strong>{entry.supplies}</strong>
                {delta?.supplies ? (
                  <em className={delta.supplies > 0 ? "up" : "down"}>
                    {formatSigned(delta.supplies)}
                  </em>
                ) : null}
              </span>
              <span className="ov-faction__stat">
                Morale <strong>{entry.morale}</strong>
                {delta?.morale ? (
                  <em className={delta.morale > 0 ? "up" : "down"}>
                    {formatSigned(delta.morale)}
                  </em>
                ) : null}
              </span>
            </div>
          );
        })}
        <div className={`ov-trust ov-trust--${standing.tone}`}>
          <span className="ov-trust__label">Trust</span>
          <span className="ov-trust__track" aria-hidden="true">
            <span
              className="ov-trust__needle"
              style={{
                left: `${((snapshot.relationship.trust + 100) / 200) * 100}%`,
              }}
            />
          </span>
          <strong>{standing.label}</strong>
          <span className="ov-trust__num">
            {formatSigned(snapshot.relationship.trust)}
            {change?.trust ? (
              <em className={change.trust > 0 ? "up" : "down"}>
                {formatSigned(change.trust)}
              </em>
            ) : null}
          </span>
        </div>
      </div>
    </section>
  );
}

function ChangeToast({
  change,
  snapshot,
}: {
  change: SnapshotDelta;
  snapshot: WorldSnapshot;
}) {
  const parts: string[] = [];
  if (change.trust) parts.push(`Trust ${formatSigned(change.trust)}`);
  for (const [id, move] of Object.entries(change.locations)) {
    const name =
      snapshot.locations.find((location) => location.id === id)?.name ?? id;
    parts.push(`${name}: ${locationStatusLabel(move.to)}`);
  }
  if (!parts.length) return null;
  return (
    <div className="ov-toast" role="status">
      <span className="ov-toast__label">The kingdom changes</span>
      <span>{parts.join(" · ")}</span>
    </div>
  );
}

export function Overlay() {
  const { worldId = "" } = useParams();
  const fixture = useFixtureParam();
  const [params] = useSearchParams();
  const world = useWorld(worldId, fixture);
  const change = useDelta(world.snapshot, 8000);
  const scale = useStageScale(fixture ? FIXTURE_BAR_H : 0);
  const backdrop =
    params.get("backdrop") === "1" ||
    (!!fixture && params.get("backdrop") !== "0");
  useDocumentTitle("AFTERLIFE overlay");

  // OBS composites this page over the stream, so the document itself must stay transparent.
  useEffect(() => {
    document.documentElement.classList.add("overlay-document");
    return () => document.documentElement.classList.remove("overlay-document");
  }, []);

  const snapshot = world.snapshot;
  const scene = snapshot?.scene;
  const showScene =
    !!snapshot &&
    snapshot.mode === "active" &&
    !!scene &&
    scene.round.status !== "deferred";

  return (
    <>
      {fixture && <FixtureBar current={fixture} />}
      <div
        className={`ov-viewport${backdrop ? " ov-viewport--backdrop" : ""}`}
        style={fixture ? { top: FIXTURE_BAR_H } : undefined}
      >
        <div
          className="ov-stage"
          style={{
            width: STAGE_W,
            height: STAGE_H,
            transform: `translate(-50%, -50%) scale(${scale})`,
          }}
        >
          {snapshot ? (
            <>
              <div className="ov-badge">
                <span className="ov-badge__brand">Afterlife</span>
                <span className="ov-badge__world">{snapshot.name}</span>
                {snapshot.rehearsal && <RehearsalBadge compact />}
                {world.feed === "reconnecting" && (
                  <span className="ov-badge__warn">Reconnecting…</span>
                )}
              </div>
              {showScene ? (
                <ScenePanel snapshot={snapshot} events={world.events} />
              ) : (
                <IdlePanel snapshot={snapshot} events={world.events} />
              )}
              <div className="ov-bottom-right">
                <JoinHint />
              </div>
              <RealmStrip snapshot={snapshot} change={change?.delta} />
              {change && (
                <ChangeToast
                  key={change.key}
                  change={change.delta}
                  snapshot={snapshot}
                />
              )}
            </>
          ) : world.feed === "not_found" || world.feed === "error" ? (
            <div className="ov-badge ov-badge--error">
              AFTERLIFE · {world.error ?? "World unavailable"}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
