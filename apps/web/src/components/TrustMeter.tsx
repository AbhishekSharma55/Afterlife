import { formatSigned, trustStanding } from "../lib/derive";

interface Props {
  trust: number;
  delta?: number;
  size?: "normal" | "large";
}

/** Trust between the two kingdoms, from -100 (war) to +100 (alliance). */
export function TrustMeter({ trust, delta, size = "normal" }: Props) {
  const standing = trustStanding(trust);
  const position = ((trust + 100) / 200) * 100;
  return (
    <div className={`trust trust--${size} trust--${standing.tone}`}>
      <div className="trust__head">
        <span className="eyebrow">Trust between kingdoms</span>
        <span className="trust__value">
          <strong>{standing.label}</strong>
          <span className="trust__number">{formatSigned(trust)}</span>
          {delta ? (
            <span
              key={`${trust}:${delta}`}
              className={`delta ${delta > 0 ? "delta--up" : "delta--down"}`}
            >
              {formatSigned(delta)}
            </span>
          ) : null}
        </span>
      </div>
      <div
        className="trust__track"
        role="meter"
        aria-valuemin={-100}
        aria-valuemax={100}
        aria-valuenow={trust}
        aria-valuetext={`${standing.label}, ${trust}`}
        aria-label="Trust between kingdoms"
      >
        <span className="trust__zero" aria-hidden="true" />
        <span
          className="trust__needle"
          style={{ left: `${position}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="trust__scale" aria-hidden="true">
        <span>War</span>
        <span>Uneasy</span>
        <span>Alliance</span>
      </div>
    </div>
  );
}
