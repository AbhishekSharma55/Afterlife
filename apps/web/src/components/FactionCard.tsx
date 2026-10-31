import type { WorldSnapshot } from "@afterlife/shared";
import { FactionEmblem } from "./FactionEmblem";
import { formatSigned } from "../lib/derive";

type Faction = WorldSnapshot["factions"][number];

function Stat({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta?: number;
}) {
  return (
    <div className="stat">
      <div className="stat__head">
        <span>{label}</span>
        <span className="stat__value">
          {value}
          {delta ? (
            <span
              key={`${value}:${delta}`}
              className={`delta ${delta > 0 ? "delta--up" : "delta--down"}`}
            >
              {formatSigned(delta)}
            </span>
          ) : null}
        </span>
      </div>
      <div
        className="stat__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <span className="stat__fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function FactionCard({
  faction,
  delta,
}: {
  faction: Faction;
  delta?: { supplies: number; morale: number };
}) {
  return (
    <article
      className={`faction faction--${faction.id}`}
      aria-label={faction.name}
    >
      <header className="faction__head">
        <FactionEmblem faction={faction.id} size={34} />
        <div>
          <h3 className="faction__name">{faction.name}</h3>
          <p className="faction__join">
            Join with <span className="kbd">!join {faction.id}</span>
          </p>
        </div>
      </header>
      <Stat label="Supplies" value={faction.supplies} delta={delta?.supplies} />
      <Stat label="Morale" value={faction.morale} delta={delta?.morale} />
    </article>
  );
}
