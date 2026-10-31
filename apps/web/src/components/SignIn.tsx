import { useState } from "react";
import { api, ApiError, describeError } from "../lib/api";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Broadcaster sign-in. Rehearsal sign-in is offered only on localhost, where the server allows it. */
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const local = LOCAL_HOSTS.includes(window.location.hostname);

  const rehearse = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.rehearsalSignIn();
      onSignedIn();
    } catch (failure) {
      setError(
        failure instanceof ApiError && failure.status === 404
          ? "Rehearsal sign-in is disabled. Start the backend with ALLOW_REHEARSAL=true."
          : describeError(failure),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <a
        className="btn btn--primary btn--large signin__twitch"
        href="/auth/twitch"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M4.3 3 3 6.4v13.1h4.5V22h2.6l2.4-2.5h3.6l4.9-4.9V3zm15.1 10.8-2.8 2.8h-4.5l-2.4 2.4v-2.4H5.8V4.7h13.6zm-2.8-5.6v4.9h-1.7V8.2zm-4.6 0v4.9h-1.7V8.2z"
          />
        </svg>
        Sign in with Twitch
      </a>
      <p className="muted signin__note">
        Connects your channel's chat so viewers can join factions and vote.
      </p>
      {local && (
        <>
          <div className="signin__or">
            <span>or</span>
          </div>
          <button
            type="button"
            className="btn btn--large"
            onClick={rehearse}
            disabled={busy}
          >
            {busy ? "Opening rehearsal…" : "Rehearse locally"}
          </button>
          <p className="muted signin__note">
            Practice the full loop with two synthetic viewers. Rehearsal worlds
            are always labeled and never count as live Twitch participation.
          </p>
        </>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
