import type { FactionId } from "@afterlife/shared";

interface Props {
  faction: FactionId;
  size?: number;
  title?: string;
}

/**
 * Red bears an upright sword; Blue bears waves. The shapes differ so the factions remain
 * distinguishable without relying on color.
 */
export function FactionEmblem({ faction, size = 28, title }: Props) {
  const red = faction === "red";
  const fill = red ? "var(--red)" : "var(--blue)";
  const deep = red ? "var(--red-deep)" : "var(--blue-deep)";
  return (
    <svg
      className="emblem"
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M16 2.5 28 7v8.5c0 7.2-5 12.2-12 14-7-1.8-12-6.8-12-14V7z"
        fill={deep}
        stroke={fill}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {red ? (
        <g
          fill="none"
          stroke="#fde6e8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M16 7.5v14" />
          <path d="M12 18.5h8" />
          <path d="M16 21.5v3" />
          <path d="M14.3 9.5 16 7.5l1.7 2" />
        </g>
      ) : (
        <g fill="none" stroke="#e3efff" strokeWidth="2" strokeLinecap="round">
          <path d="M9.5 12.5c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0" />
          <path d="M9.5 17c2.2-2 4.3-2 6.5 0s4.3 2 6.5 0" />
          <path d="M11 21.5c1.7-1.5 3.3-1.5 5 0s3.3 1.5 5 0" />
        </g>
      )}
    </svg>
  );
}
