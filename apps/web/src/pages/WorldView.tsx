import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import type { WorldEvent, WorldSnapshot } from "@afterlife/shared";
import { Chronicle } from "../components/Chronicle";
import { FactionCard } from "../components/FactionCard";
import { KingdomMap } from "../components/KingdomMap";
import { RecapPanel } from "../components/RecapPanel";
import { SceneCard } from "../components/SceneCard";
import {
  Brand,
  FeedGate,
  FixtureBar,
  useFixtureParam,
} from "../components/Shell";
import {
  BroadcastPill,
  FeedPill,
  RehearsalBadge,
} from "../components/StatusPills";
import { TrustMeter } from "../components/TrustMeter";
import { modeLabel, referencedEventIds } from "../lib/derive";
import { useDelta } from "../lib/useDelta";
import { useWorld } from "../lib/useWorld";
import { useDocumentTitle } from "../lib/useDocumentTitle";

export function HowToPlay() {
  return (
    <section className="howto" aria-labelledby="howto-title">
      <h2 id="howto-title" className="visually-hidden">
        How to play in chat
      </h2>
      <div className="howto__item">
        <span className="howto__num">1</span>
        <div>
          <strong>Pick a side</strong>
          <span className="howto__cmds">
            <span className="kbd red-ink">!join red</span>
            <span className="kbd blue-ink">!join blue</span>
          </span>
        </div>
      </div>
      <div className="howto__item">
        <span className="howto__num">2</span>
        <div>
          <strong>Vote when it opens</strong>
          <span className="howto__cmds">
            <span className="kbd">!vote 1</span>
            <span className="kbd">2</span>
            <span className="kbd">3</span>
          </span>
        </div>
      </div>
      <div className="howto__item">
        <span className="howto__num">3</span>
        <div>
          <strong>Come back next stream</strong>
          <span className="muted">The world remembers your choice.</span>
        </div>
      </div>
    </section>
  );
}

function Grievance({
  snapshot,
  events,
  onSelect,
}: {
  snapshot: WorldSnapshot;
  events: Record<string, WorldEvent>;
  onSelect: (id: string) => void;
}) {
  const { grievance, causeEventId } = snapshot.relationship;
  if (!grievance) return null;
  const cause = causeEventId ? events[causeEventId] : undefined;
  return (
    <div className="grievance" role="note">
      <span className="eyebrow">Unresolved grievance</span>
      <p>{grievance}</p>
      {cause && (
        <button
          type="button"
          className="grievance__cause"
          onClick={() => onSelect(cause.id)}
        >
          Caused by #{cause.sequence}: {cause.summary}
        </button>
      )}
    </div>
  );
}

function IdleScene({ snapshot }: { snapshot: WorldSnapshot }) {
  const resting = snapshot.mode === "resting";
  const deferred = snapshot.scene?.round.status === "deferred";
  return (
    <section className="scene scene--idle card">
      <span className="eyebrow">
        {resting
          ? "The kingdom rests"
          : snapshot.mode === "ready"
            ? "Before the first episode"
            : "Between decisions"}
      </span>
      <h2 className="scene__title">
        {resting
          ? "The stream has ended — the world has not"
          : snapshot.mode === "ready"
            ? "A fragile peace"
            : "The council deliberates"}
      </h2>
      <p className="scene__narration">
        {resting
          ? "Red and Blue keep moving while the broadcaster is away. Return next episode to see what changed."
          : snapshot.mode === "ready"
            ? "Join a faction now. The first dilemma arrives when the broadcaster begins episode one."
            : "The next dilemma is on its way. Join a faction so your vote counts."}
      </p>
      {deferred && snapshot.scene && (
        <p className="scene__deferred">
          Unfinished business: <strong>{snapshot.scene.title}</strong> returns
          next episode with a fresh vote.
        </p>
      )}
    </section>
  );
}

export function WorldView() {
  const { worldId = "" } = useParams();
  const fixture = useFixtureParam();
  const world = useWorld(worldId, fixture);
  const [selected, setSelected] = useState<string | null>(null);
  const change = useDelta(world.snapshot);
  const snapshot = world.snapshot;
  useDocumentTitle(snapshot ? `${snapshot.name} · AFTERLIFE` : "AFTERLIFE");

  const remembered = useMemo(
    () => (snapshot ? referencedEventIds(snapshot) : []),
    [snapshot],
  );
  if (!snapshot) return <FeedGate feed={world.feed} error={world.error} />;

  const red = snapshot.factions.find((entry) => entry.id === "red")!;
  const blue = snapshot.factions.find((entry) => entry.id === "blue")!;
  const activeScene =
    snapshot.scene &&
    snapshot.scene.round.status !== "deferred" &&
    snapshot.mode === "active"
      ? snapshot.scene
      : null;
  const select = (id: string) =>
    setSelected((current) => (current === id ? null : id));

  return (
    <div className="page page--world">
      {fixture && <FixtureBar current={fixture} />}
      <header className="topbar">
        <div className="topbar__left">
          <Brand small />
          <span className="topbar__divider" aria-hidden="true" />
          <div className="topbar__title">
            <h1>{snapshot.name}</h1>
            <span className="topbar__mode">{modeLabel(snapshot)}</span>
          </div>
        </div>
        <div className="topbar__right">
          {snapshot.rehearsal && <RehearsalBadge />}
          <div className="status-group">
            <BroadcastPill snapshot={snapshot} />
            <FeedPill feed={world.feed} />
          </div>
        </div>
      </header>

      <main className="world">
        <RecapPanel
          snapshot={snapshot}
          events={world.events}
          onSelectEvent={select}
        />
        <div className="world__grid">
          <div className="world__story">
            {activeScene ? (
              <SceneCard
                scene={activeScene}
                events={world.events}
                onSelectEvent={select}
              />
            ) : (
              <IdleScene snapshot={snapshot} />
            )}
            <HowToPlay />
          </div>

          <section className="card realm" aria-label="The kingdom">
            <KingdomMap
              locations={snapshot.locations}
              changed={Object.keys(change?.delta.locations ?? {})}
            />
            <div className="realm__factions">
              <FactionCard faction={red} delta={change?.delta.factions.red} />
              <FactionCard faction={blue} delta={change?.delta.factions.blue} />
            </div>
            <TrustMeter
              trust={snapshot.relationship.trust}
              delta={change?.delta.trust}
            />
            <Grievance
              snapshot={snapshot}
              events={world.events}
              onSelect={select}
            />
          </section>
        </div>

        <section
          className="card world__chronicle"
          aria-labelledby="chronicle-title"
        >
          <div className="section-head">
            <h2 id="chronicle-title">Chronicle</h2>
            <span className="muted">Every decision is permanent.</span>
          </div>
          <Chronicle
            events={world.chronicle}
            known={world.events}
            remembered={remembered}
            selectedId={selected}
            onSelect={select}
            hasOlder={world.hasOlderHistory}
            loadingOlder={world.loadingHistory}
            onLoadOlder={world.loadOlderHistory}
          />
        </section>
      </main>
    </div>
  );
}
