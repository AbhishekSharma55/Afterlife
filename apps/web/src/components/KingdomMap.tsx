import type { WorldSnapshot } from "@afterlife/shared";
import { locationIsTense, locationStatusLabel } from "../lib/derive";

type Location = WorldSnapshot["locations"][number];

/** Label anchors (top-center, in the 800×460 viewBox) beneath each seeded location. */
const PLACES: Record<string, { x: number; y: number }> = {
  red_keep: { x: 150, y: 296 },
  blue_keep: { x: 650, y: 296 },
  westbridge: { x: 403, y: 326 },
  forest: { x: 405, y: 146 },
};

/** Aged-parchment map palette. Faction colors come from the shared tokens. */
const INK = "#3b2a14";
const INK_SOFT = "#6e5432";
const WOOD = "#8a6236";
const WOOD_LIGHT = "#c79c62";

interface Props {
  locations: Location[];
  /** Location IDs whose status just changed, for a brief highlight. */
  changed?: string[];
  compact?: boolean;
}

function status(locations: Location[], id: string) {
  return locations.find((location) => location.id === id)?.status ?? "stable";
}

function Castle({
  x,
  y,
  faction,
  preparing,
}: {
  x: number;
  y: number;
  faction: "red" | "blue";
  preparing: boolean;
}) {
  const main = faction === "red" ? "var(--red)" : "var(--blue)";
  const deep = faction === "red" ? "var(--red-deep)" : "var(--blue-deep)";
  const soft = faction === "red" ? "#d9a28f" : "#a9b9c9";
  const shade = faction === "red" ? "#c98774" : "#8fa2b7";
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={preparing ? "map-keep map-keep--preparing" : "map-keep"}
    >
      {preparing && (
        <>
          <circle r="64" className="map-keep__alarm" style={{ stroke: main }} />
          <circle
            r="64"
            className="map-keep__alarm map-keep__alarm--late"
            style={{ stroke: main }}
          />
        </>
      )}
      {/* Hill */}
      <path
        d="M-70 38C-50 18-20 14 0 14s50 4 70 24z"
        fill="#cdb183"
        stroke={INK_SOFT}
        strokeWidth="1.5"
      />
      {/* Curtain wall */}
      <path
        d="M-44 32V2h8v-8h8v8h8v-8h8v8h8v-8h8v8h8v-8h8v8h8v30z"
        fill={soft}
        stroke={deep}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Towers */}
      <path
        d="M-50 32V-14h6v-6h6v6h6v-6h6v6h2v46z"
        fill={shade}
        stroke={deep}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M50 32V-14h-6v-6h-6v6h-6v-6h-6v6h-2v46z"
        fill={shade}
        stroke={deep}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M-12 32V-30h4v-6h4v6h8v-6h4v6h4v62z"
        fill={soft}
        stroke={deep}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Stone courses */}
      <path
        d="M-44 14h32M12 14h32M-12 0h24"
        stroke={deep}
        strokeWidth="1"
        opacity="0.35"
      />
      {/* Gate and windows */}
      <path d="M-7 32v-14a7 7 0 0 1 14 0v14z" fill="#2b1d0e" />
      <g fill={deep} opacity="0.8">
        <rect x="-37" y="-6" width="4" height="8" rx="2" />
        <rect x="33" y="-6" width="4" height="8" rx="2" />
        <rect x="-2" y="-20" width="4" height="8" rx="2" />
      </g>
      {/* Banner */}
      <path d="M0 -36v-22" stroke={INK} strokeWidth="2" />
      <path
        className={preparing ? "map-banner map-banner--wave" : "map-banner"}
        d="M0 -58h20l-5 6 5 6H0z"
        fill={main}
      />
      {preparing && (
        <g className="map-keep__war">
          <path d="M-44 -20v-16" stroke={INK} strokeWidth="1.5" />
          <path
            className="map-banner map-banner--wave"
            d="M-44 -36h12l-3 4 3 4h-12z"
            fill={main}
          />
          <path d="M44 -20v-16" stroke={INK} strokeWidth="1.5" />
          <path
            className="map-banner map-banner--wave"
            d="M44 -36h12l-3 4 3 4h-12z"
            fill={main}
          />
        </g>
      )}
    </g>
  );
}

function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 0v6" stroke="#5e4022" strokeWidth="3" />
      <path
        d="M0 -26 13 0H-13z"
        fill="#6f8a55"
        stroke="#3d5130"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M0 -38 10 -16H-10z"
        fill="#83a065"
        stroke="#3d5130"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </g>
  );
}

function Mountains({ d }: { d: string }) {
  return (
    <path
      d={d}
      fill="#d6bf92"
      stroke={INK_SOFT}
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  );
}

export function KingdomMap({
  locations,
  changed = [],
  compact = false,
}: Props) {
  const bridge = status(locations, "westbridge");
  const forest = status(locations, "forest");
  const redKeep = status(locations, "red_keep");
  const blueKeep = status(locations, "blue_keep");
  const bridgeClosed = bridge === "closed";
  const foraging = forest === "foraging";
  const river = "M452 -10C430 60 470 120 430 190s-40 120-20 170 0 80-30 110";

  return (
    <figure
      className={`map${compact ? " map--compact" : ""}`}
      aria-label="Map of the kingdom"
    >
      <svg
        viewBox="0 0 800 460"
        className="map__art"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="map-land" cx="50%" cy="48%" r="70%">
            <stop offset="0%" stopColor="#ecdcb6" />
            <stop offset="65%" stopColor="#dcc597" />
            <stop offset="100%" stopColor="#b99a65" />
          </radialGradient>
          <linearGradient id="map-river" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7fa4b8" />
            <stop offset="100%" stopColor="#5f8aa3" />
          </linearGradient>
          <pattern
            id="map-hatch"
            width="9"
            height="9"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(35)"
          >
            <path d="M0 0v9" stroke="rgba(90,60,25,0.07)" strokeWidth="2" />
          </pattern>
          <radialGradient id="map-glow-gold" r="50%">
            <stop offset="0%" stopColor="rgba(255,206,110,0.6)" />
            <stop offset="100%" stopColor="rgba(255,206,110,0)" />
          </radialGradient>
        </defs>

        <rect width="800" height="460" fill="url(#map-land)" />
        <rect width="800" height="460" fill="url(#map-hatch)" />

        {/* Territory washes */}
        <ellipse cx="150" cy="270" rx="185" ry="165" fill="var(--red-wash)" />
        <ellipse cx="650" cy="270" rx="185" ry="165" fill="var(--blue-wash)" />
        <ellipse
          cx="150"
          cy="270"
          rx="185"
          ry="165"
          fill="none"
          stroke="var(--red)"
          strokeOpacity="0.25"
          strokeDasharray="3 7"
        />
        <ellipse
          cx="650"
          cy="270"
          rx="185"
          ry="165"
          fill="none"
          stroke="var(--blue)"
          strokeOpacity="0.25"
          strokeDasharray="3 7"
        />

        {/* Distant mountains, with snow */}
        <Mountains d="M20 150 70 80l35 45 30-38 55 63z" />
        <Mountains d="M610 150l50-62 30 36 35-46 55 72z" />
        <g
          fill="none"
          stroke={INK_SOFT}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        >
          <path d="M58 96l12-16 9 12M126 98l9-11 7 9M650 106l10-18 9 11M708 92l7-12 8 11" />
        </g>

        {/* River with banks */}
        <path
          d={river}
          fill="none"
          stroke="#4b6f84"
          strokeWidth="42"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d={river}
          fill="none"
          stroke="url(#map-river)"
          strokeWidth="36"
          strokeLinecap="round"
        />
        <path
          className="map-river-flow"
          d={river}
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth="2"
          strokeDasharray="6 22"
        />

        {/* Roads */}
        <g
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className={bridgeClosed ? "map-road map-road--cut" : "map-road"}
        >
          <path d="M200 285C260 300 320 305 372 302" />
          <path d="M434 302C490 305 545 300 600 285" />
        </g>
        <path
          d="M403 290C395 240 390 180 400 140"
          fill="none"
          stroke="rgba(92,60,22,0.45)"
          strokeWidth="3"
          strokeDasharray="4 8"
          strokeLinecap="round"
        />

        {/* Forest */}
        <g
          className={
            foraging ? "map-forest map-forest--foraging" : "map-forest"
          }
        >
          {foraging && (
            <ellipse
              cx="405"
              cy="88"
              rx="150"
              ry="62"
              fill="url(#map-glow-gold)"
            />
          )}
          <Tree x={300} y={100} s={0.9} />
          <Tree x={335} y={80} />
          <Tree x={365} y={110} s={0.85} />
          <Tree x={392} y={72} s={1.1} />
          <Tree x={472} y={78} s={1.05} />
          <Tree x={500} y={108} s={0.9} />
          <Tree x={530} y={84} />
          <Tree x={320} y={128} s={0.75} />
          <Tree x={515} y={132} s={0.75} />
          {foraging && (
            <g className="map-sparkles" fill="var(--memory)">
              <circle cx="340" cy="60" r="3" />
              <circle cx="380" cy="128" r="2.5" />
              <circle cx="486" cy="58" r="3" />
              <circle cx="545" cy="118" r="2.5" />
              <circle cx="300" cy="72" r="2.2" />
            </g>
          )}
        </g>

        {/* Westbridge */}
        <g
          transform="translate(403 300)"
          className={
            bridgeClosed ? "map-bridge map-bridge--closed" : "map-bridge"
          }
        >
          {!bridgeClosed && (
            <ellipse rx="72" ry="36" fill="url(#map-glow-gold)" />
          )}
          <path
            d="M-40 -6Q0 -30 40 -6"
            fill="none"
            stroke={WOOD}
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M-40 -6Q0 -30 40 -6"
            fill="none"
            stroke={WOOD_LIGHT}
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d="M-30 -2v14M-10 -14v20M10 -14v20M30 -2v14"
            stroke="#5e4022"
            strokeWidth="4"
            strokeLinecap="round"
          />
          {bridgeClosed && (
            <g className="map-barricade">
              <path
                d="M-26 -34 26 10M26 -34-26 10"
                stroke="#ffffff"
                strokeWidth="11"
                strokeLinecap="round"
              />
              <path
                d="M-26 -34 26 10M26 -34-26 10"
                stroke="var(--bad)"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </g>
          )}
        </g>

        <Castle
          x={150}
          y={250}
          faction="red"
          preparing={redKeep === "preparing"}
        />
        <Castle
          x={650}
          y={250}
          faction="blue"
          preparing={blueKeep === "preparing"}
        />

        {/* Compass rose */}
        <g transform="translate(748 410)">
          <circle
            r="21"
            fill="rgba(236,220,182,0.7)"
            stroke={INK_SOFT}
            strokeWidth="1.2"
          />
          <path d="M0 -17 4.5 0 0 17-4.5 0z" fill="var(--memory)" />
          <path d="M0 -17 4.5 0H-4.5z" fill="var(--red)" />
          <path d="M-17 0 0 3.5 17 0 0-3.5z" fill={INK_SOFT} opacity="0.5" />
          <text
            y="-26"
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fill={INK}
            fontFamily="var(--font-display)"
          >
            N
          </text>
        </g>

        {/* Engraved frame */}
        <rect
          x="7"
          y="7"
          width="786"
          height="446"
          rx="10"
          fill="none"
          stroke={INK_SOFT}
          strokeOpacity="0.45"
          strokeWidth="1.2"
        />
        <rect
          x="12"
          y="12"
          width="776"
          height="436"
          rx="7"
          fill="none"
          stroke={INK_SOFT}
          strokeOpacity="0.25"
          strokeDasharray="2 5"
        />
      </svg>

      {locations.map((location) => {
        const place = PLACES[location.id];
        if (!place) return null;
        const tense = locationIsTense(location.status);
        return (
          <div
            key={location.id}
            className={[
              "map__label",
              tense ? "map__label--tense" : "",
              changed.includes(location.id) ? "map__label--changed" : "",
            ].join(" ")}
            style={{
              left: `${(place.x / 800) * 100}%`,
              top: `${(place.y / 460) * 100}%`,
            }}
          >
            <span className="map__name">{location.name}</span>
            <span className={`map__status map__status--${location.status}`}>
              {locationStatusLabel(location.status, compact)}
            </span>
          </div>
        );
      })}
      <figcaption className="visually-hidden">
        {locations
          .map(
            (location) =>
              `${location.name}: ${locationStatusLabel(location.status)}`,
          )
          .join(". ")}
      </figcaption>
    </figure>
  );
}
