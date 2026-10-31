import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageMessage } from "../components/Shell";
import { SignIn } from "../components/SignIn";
import { RehearsalBadge } from "../components/StatusPills";
import { api, describeError } from "../lib/api";
import { modeLabel } from "../lib/derive";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useSession } from "../lib/useSession";

/**
 * Signs the creator in, then opens their world. The backend keeps one world per broadcaster
 * (creating returns the existing one), so a first visit names it and later visits go straight in.
 */
export function StudioEntry() {
  useDocumentTitle("Creator studio · AFTERLIFE");
  const { session, refresh } = useSession();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const worlds = session.status === "signed_in" ? session.identity.worlds : [];
  const onlyWorldId = worlds.length === 1 ? worlds[0].worldId : null;
  useEffect(() => {
    if (onlyWorldId)
      navigate(`/studio/${encodeURIComponent(onlyWorldId)}`, { replace: true });
  }, [onlyWorldId, navigate]);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const world = await api.createWorld(name.trim() || undefined);
      navigate(`/studio/${encodeURIComponent(world.worldId)}`);
    } catch (failure) {
      setError(describeError(failure));
      setCreating(false);
    }
  };

  if (session.status === "loading" || onlyWorldId)
    return (
      <div className="page-loading" role="status">
        <span className="spinner" aria-hidden="true" />
        <span>Opening your studio…</span>
      </div>
    );
  if (session.status === "error")
    return (
      <PageMessage
        title="The kingdom server is unreachable"
        action={
          <button type="button" className="btn" onClick={() => void refresh()}>
            Try again
          </button>
        }
      >
        <p>{session.message}</p>
        <p className="muted">Start the backend, then try again.</p>
      </PageMessage>
    );
  if (session.status === "signed_out")
    return (
      <PageMessage title="Open your creator studio">
        <p className="muted">
          Sign in as the broadcaster to run episodes, open votes and set up your
          overlay.
        </p>
        <SignIn onSignedIn={refresh} />
      </PageMessage>
    );

  return (
    <PageMessage title={worlds.length ? "Your kingdoms" : "Found your kingdom"}>
      {session.identity.rehearsal && (
        <p className="entry-note">
          <RehearsalBadge />{" "}
          <span className="muted">
            This session creates rehearsal worlds only.
          </span>
        </p>
      )}
      {worlds.length > 0 && (
        <ul className="world-list">
          {worlds.map((world) => (
            <li key={world.worldId}>
              <Link
                className="world-list__item"
                to={`/studio/${encodeURIComponent(world.worldId)}`}
              >
                <strong>{world.name}</strong>
                <span className="muted">{modeLabel(world)}</span>
                {world.rehearsal && <RehearsalBadge compact />}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {worlds.length === 0 && (
        <form
          className="create-world"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label htmlFor="world-name">Name your kingdom</label>
          <div className="create-world__row">
            <input
              id="world-name"
              value={name}
              maxLength={80}
              placeholder="Westbridge"
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary"
              disabled={creating}
            >
              {creating ? "Founding…" : "Create world"}
            </button>
          </div>
          <p className="muted">
            Red and Blue begin bound by a fragile treaty. Every choice after
            that is remembered.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </PageMessage>
  );
}
