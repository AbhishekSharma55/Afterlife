import type { Scene, WorldEvent } from "@afterlife/shared";
import { outcomeHeadline } from "../lib/derive";
import { FactionEmblem } from "./FactionEmblem";
import { ChoiceList, Countdown, Remembered, RoundStatus } from "./Voting";

const ENCOUNTER: Record<NonNullable<Scene["encounterId"]>, string> = {
  treaty: "Treaty",
  resource_crisis: "Resource crisis",
  retaliation: "Retaliation",
};

export function LeaderReactions({ scene }: { scene: Scene }) {
  if (!scene.leaderReactions?.length) return null;
  return (
    <div className="reactions">
      {scene.leaderReactions.map((reaction) => (
        <blockquote
          key={reaction.factionId}
          className={`reaction reaction--${reaction.factionId}`}
        >
          <FactionEmblem faction={reaction.factionId} size={22} />
          <div>
            <cite>
              {reaction.factionId === "red" ? "Red Kingdom" : "Blue Kingdom"}
            </cite>
            <p>“{reaction.text}”</p>
          </div>
        </blockquote>
      ))}
    </div>
  );
}

interface Props {
  scene: Scene;
  events: Record<string, WorldEvent>;
  onSelectEvent?: (id: string) => void;
  heading?: string;
}

export function SceneCard({
  scene,
  events,
  onSelectEvent,
  heading = "Current dilemma",
}: Props) {
  const outcome = outcomeHeadline(scene);
  const { round } = scene;
  return (
    <section
      className={`scene card scene--${round.status}`}
      aria-labelledby={`scene-${scene.id}`}
    >
      <header className="scene__head">
        <div>
          <span className="eyebrow">
            {heading}
            {scene.encounterId ? ` · ${ENCOUNTER[scene.encounterId]}` : ""}
          </span>
          <h2 id={`scene-${scene.id}`} className="scene__title">
            {scene.title}
          </h2>
        </div>
        <Countdown round={round} />
      </header>
      <p className="scene__narration">{scene.narration}</p>
      <LeaderReactions scene={scene} />
      <Remembered
        ids={scene.causeEventIds}
        events={events}
        onSelect={onSelectEvent}
      />
      {outcome && (
        <p
          className={`scene__outcome scene__outcome--${round.outcome ?? "none"}`}
          role="status"
        >
          {outcome}
        </p>
      )}
      <ChoiceList scene={scene} />
      <footer className="scene__foot" aria-live="polite">
        <RoundStatus scene={scene} />
      </footer>
    </section>
  );
}
