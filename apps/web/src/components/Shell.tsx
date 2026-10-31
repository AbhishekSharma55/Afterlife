import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  FIXTURE_LABELS,
  FIXTURE_ORDER,
  isFixtureName,
  type FixtureName,
} from "../lib/fixtures";
import type { FeedStatus } from "../lib/useWorld";

export function Brand({
  to = "/",
  small = false,
}: {
  to?: string;
  small?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`brand${small ? " brand--small" : ""}`}
      aria-label="AFTERLIFE home"
    >
      <svg
        viewBox="0 0 64 64"
        width={small ? 22 : 28}
        height={small ? 22 : 28}
        aria-hidden="true"
      >
        <path
          d="M32 6 54 14v17c0 13.5-9.5 22.5-22 26C19.5 53.5 10 44.5 10 31V14z"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M32 6v51" stroke="var(--accent)" strokeWidth="3" />
        <path d="M10 24h22" stroke="var(--red)" strokeWidth="5" />
        <path d="M32 24h22" stroke="var(--blue)" strokeWidth="5" />
      </svg>
      <span className="brand__word">Afterlife</span>
    </Link>
  );
}

/** Reads `?fixture=<name>`; a fixture replaces the live server for design and review work. */
export function useFixtureParam(): FixtureName | null {
  const [params] = useSearchParams();
  const value = params.get("fixture");
  return isFixtureName(value) ? value : null;
}

/** Switch between backend-generated fixture states while staying on the same surface. */
export function FixtureBar({ current }: { current: FixtureName }) {
  const location = useLocation();
  const [params] = useSearchParams();
  return (
    <nav className="fixture-bar" aria-label="Fixture states">
      <span className="fixture-bar__label">
        Fixture preview <span className="muted">· sample data, not live</span>
      </span>
      <div className="fixture-bar__list">
        {FIXTURE_ORDER.map((name) => {
          const next = new URLSearchParams(params);
          next.set("fixture", name);
          return (
            <Link
              key={name}
              to={`${location.pathname}?${next}`}
              className={`fixture-bar__item${name === current ? " is-current" : ""}`}
              aria-current={name === current ? "page" : undefined}
            >
              {FIXTURE_LABELS[name]}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function PageMessage({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-message">
      <Brand />
      <div className="page-message__card card">
        <h1>{title}</h1>
        {children && <div className="page-message__body">{children}</div>}
        {action && <div className="page-message__action">{action}</div>}
      </div>
    </div>
  );
}

/** Loading and failure screens shared by every world surface. */
export function FeedGate({
  feed,
  error,
}: {
  feed: FeedStatus;
  error: string | null;
}) {
  if (feed === "not_found")
    return (
      <PageMessage
        title="This kingdom could not be found"
        action={
          <Link className="btn" to="/">
            Back to start
          </Link>
        }
      >
        <p>Check the link, or open the studio to find your world.</p>
      </PageMessage>
    );
  if (feed === "error")
    return (
      <PageMessage
        title="The kingdom server is unreachable"
        action={
          <button
            className="btn"
            type="button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        }
      >
        <p>{error ?? "The world could not be loaded."}</p>
      </PageMessage>
    );
  return (
    <div className="page-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>Opening the kingdom…</span>
    </div>
  );
}
