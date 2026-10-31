import { useMemo, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { Scene, WorldSnapshot } from "@afterlife/shared";
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
import { SignIn } from "../components/SignIn";
import {
  BroadcastPill,
  ChatPill,
  FeedPill,
  NarratorPill,
  RehearsalBadge,
} from "../components/StatusPills";
import { useToast } from "../components/Toasts";
import { TrustMeter } from "../components/TrustMeter";
import { api, describeError } from "../lib/api";
import {
  choiceLabel,
  modeLabel,
  referencedEventIds,
  studioStep,
  type StudioStep,
} from "../lib/derive";
import { useCommand } from "../lib/useCommand";
import { useCountdown } from "../lib/useCountdown";
import { useDelta } from "../lib/useDelta";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { useSession } from "../lib/useSession";
import { useWorld } from "../lib/useWorld";

const DURATIONS = [30, 45, 60, 90, 120];
const durationLabel = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${seconds / 60} min`;

type Run = ReturnType<typeof useCommand>["run"];

interface StepProps {
  snapshot: WorldSnapshot;
  step: StudioStep;
  run: Run;
  busy: string | null;
  disabled: boolean;
}

function EndEpisode({
  snapshot,
  run,
  busy,
  disabled,
}: Omit<StepProps, "step">) {
  const [confirming, setConfirming] = useState(false);
  const episode = snapshot.episode;
  if (snapshot.mode !== "active" || !episode) return null;
  const round = snapshot.scene?.round.status;
  const defers = round === "open" || round === "paused" || round === "prepared";
  const key = `end:${episode.id}`;
  if (!confirming)
    return (
      <button
        type="button"
        className="btn btn--danger"
        disabled={disabled || !!busy}
        onClick={() => setConfirming(true)}
      >
        End episode {episode.number}
      </button>
    );
  return (
    <div
      className="confirm"
      role="group"
      aria-label="Confirm ending the episode"
    >
      <p>
        {defers
          ? "The current dilemma will be deferred without a decision. It returns next episode with a fresh vote."
          : "The kingdom will rest and keep developing until you start the next episode."}
      </p>
      <div className="confirm__actions">
        <button
          type="button"
          className="btn btn--danger"
          disabled={disabled || !!busy}
          onClick={async () => {
            const done = await run(
              key,
              (id) => api.endEpisode(snapshot.worldId, episode.id, id),
              `Episode ${episode.number} ended. The kingdom rests.`,
            );
            if (done) setConfirming(false);
          }}
        >
          {busy === key ? "Ending…" : "Yes, end episode"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => setConfirming(false)}
        >
          Keep playing
        </button>
      </div>
    </div>
  );
}

function OpenVote({
  scene,
  snapshot,
  run,
  busy,
  disabled,
}: { scene: Scene } & Omit<StepProps, "step">) {
  const [duration, setDuration] = useState(45);
  const key = `open:${scene.round.id}`;
  return (
    <>
      <fieldset className="durations">
        <legend>Voting window</legend>
        {DURATIONS.map((seconds) => (
          <label
            key={seconds}
            className={`durations__item${duration === seconds ? " is-checked" : ""}`}
          >
            <input
              type="radio"
              name="duration"
              value={seconds}
              checked={duration === seconds}
              onChange={() => setDuration(seconds)}
            />
            {durationLabel(seconds)}
          </label>
        ))}
      </fieldset>
      <button
        type="button"
        className="btn btn--primary btn--large"
        disabled={disabled || !!busy}
        onClick={() =>
          run(
            key,
            (id) =>
              api.roundAction(
                snapshot.worldId,
                scene.round.id,
                "open",
                id,
                duration,
              ),
            "Voting is open in chat.",
          )
        }
      >
        {busy === key ? "Opening…" : `Open voting · ${durationLabel(duration)}`}
      </button>
    </>
  );
}

function CloseVote({
  scene,
  snapshot,
  run,
  busy,
  disabled,
}: { scene: Scene } & Omit<StepProps, "step">) {
  const remaining = useCountdown(scene.round);
  const key = `close:${scene.round.id}`;
  return (
    <button
      type="button"
      className="btn btn--large"
      disabled={disabled || !!busy}
      onClick={() =>
        run(
          key,
          (id) =>
            api.roundAction(snapshot.worldId, scene.round.id, "close", id),
          "Votes counted.",
        )
      }
    >
      {busy === key
        ? "Counting…"
        : remaining === 0
          ? "Count votes now"
          : "Close voting early"}
    </button>
  );
}

/** One clear next action, derived from the world's lifecycle. */
function NextStep(props: StepProps) {
  const { snapshot, step, run, busy, disabled } = props;
  const worldId = snapshot.worldId;
  let title: string;
  let detail: string;
  let primary: ReactNode = null;

  switch (step.kind) {
    case "start": {
      const key = `start:${snapshot.episode?.id ?? "first"}`;
      title =
        step.episodeNumber === 1
          ? "Begin the first episode"
          : `Begin episode ${step.episodeNumber}`;
      detail =
        snapshot.mode === "resting"
          ? `The kingdom has been resting. Starting catches up any due developments and opens with a “previously” recap${
              step.hasDeferred
                ? "; the unfinished dilemma returns with a fresh vote"
                : ""
            }.`
          : "Viewers can join factions now. Start the episode when you go live.";
      primary = (
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={disabled || !!busy}
          onClick={() =>
            run(
              key,
              (id) => api.startEpisode(worldId, id),
              `Episode ${step.episodeNumber} has begun.`,
            )
          }
        >
          {busy === key
            ? "Preparing the recap…"
            : `Start episode ${step.episodeNumber}`}
        </button>
      );
      break;
    }
    case "prepare":
    case "resolved": {
      const key = `prepare:${snapshot.scene?.id ?? snapshot.episode?.id}`;
      title =
        step.kind === "resolved"
          ? "Present the next dilemma"
          : "Present a dilemma";
      detail =
        step.kind === "resolved"
          ? "The decision is recorded permanently. Present the next one, or end the episode when you're done."
          : "The world picks a dilemma that grows out of its history. The narrator writes the scene.";
      primary = (
        <button
          type="button"
          className="btn btn--primary btn--large"
          disabled={disabled || !!busy}
          onClick={() =>
            run(
              key,
              (id) => api.prepareScene(worldId, id),
              "The dilemma is ready.",
            )
          }
        >
          {busy === key ? "The narrator is writing…" : "Prepare dilemma"}
        </button>
      );
      break;
    }
    case "open":
      title = "Open the vote";
      detail =
        "Read the dilemma aloud, then open voting. Chat votes with !vote 1, 2 or 3.";
      primary = <OpenVote scene={step.scene} {...props} />;
      break;
    case "voting":
      title = "Chat is voting";
      detail =
        "Votes close automatically at the deadline. One vote per account; the latest vote counts.";
      primary = <CloseVote scene={step.scene} {...props} />;
      break;
    case "paused": {
      const key = `resume:${step.scene.round.id}`;
      const connected = snapshot.twitch.connection === "connected";
      title = "Voting is paused";
      detail = connected
        ? "Chat is back. Resume to continue with the remaining time; counted votes are kept."
        : snapshot.rehearsal
          ? "Rehearsal worlds have no Twitch chat to reconnect. Close the vote to count the votes already cast."
          : "Twitch chat disconnected, so votes are paused to keep the round fair. Resume once chat reconnects.";
      primary = (
        <div className="next__row">
          <button
            type="button"
            className="btn btn--primary btn--large"
            disabled={disabled || !!busy || !connected}
            onClick={() =>
              run(
                key,
                (id) =>
                  api.roundAction(worldId, step.scene.round.id, "resume", id),
                "Voting resumed.",
              )
            }
          >
            {busy === key
              ? "Resuming…"
              : connected
                ? "Resume voting"
                : "Waiting for chat…"}
          </button>
          <CloseVote scene={step.scene} {...props} />
        </div>
      );
      break;
    }
  }

  return (
    <section className="next card" aria-labelledby="next-title">
      <span className="eyebrow">Next step</span>
      <h2 id="next-title" className="next__title">
        {title}
      </h2>
      <p className="next__detail">{detail}</p>
      <div className="next__actions">{primary}</div>
      <div className="next__secondary">
        <EndEpisode
          snapshot={snapshot}
          run={run}
          busy={busy}
          disabled={disabled}
        />
      </div>
    </section>
  );
}

function RehearsalViewers({
  snapshot,
  run,
  busy,
  disabled,
}: Omit<StepProps, "step">) {
  const scene = snapshot.scene;
  const voting = snapshot.mode === "active" && scene?.round.status === "open";
  const send = (viewer: "red" | "blue", text: string) =>
    run(
      `chat:${viewer}:${text}:${scene?.round.id ?? "none"}:${Date.now()}`,
      (id) => api.rehearsalChat(snapshot.worldId, viewer, text, id),
      `${viewer === "red" ? "Rehearsal Red" : "Rehearsal Blue"} sent ${text}`,
    );
  return (
    <section className="card rehearsal" aria-labelledby="rehearsal-title">
      <div className="section-head">
        <h2 id="rehearsal-title">Rehearsal viewers</h2>
        <RehearsalBadge compact />
      </div>
      <p className="muted">
        Two synthetic viewers stand in for chat. They join first, then vote
        while a round is open. Their input is always labeled as rehearsal.
      </p>
      <div className="rehearsal__viewers">
        {(["red", "blue"] as const).map((viewer) => (
          <div key={viewer} className={`viewer viewer--${viewer}`}>
            <span className="viewer__name">
              {viewer === "red" ? "Rehearsal Red" : "Rehearsal Blue"}
            </span>
            <div className="viewer__row">
              <button
                type="button"
                className="btn btn--small btn--red"
                disabled={disabled || !!busy}
                onClick={() => send(viewer, "!join red")}
              >
                !join red
              </button>
              <button
                type="button"
                className="btn btn--small btn--blue"
                disabled={disabled || !!busy}
                onClick={() => send(viewer, "!join blue")}
              >
                !join blue
              </button>
            </div>
            <div className="viewer__row">
              {(scene?.choices ?? []).map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  className="btn btn--small"
                  disabled={disabled || !!busy || !voting}
                  title={choice.label}
                  onClick={() => send(viewer, `!vote ${choice.number}`)}
                >
                  !vote {choice.number}
                </button>
              ))}
              {!voting && (
                <span className="viewer__hint muted">
                  Votes count while a round is open
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ShareLink({
  label,
  path,
  hint,
}: {
  label: string;
  path: string;
  hint: string;
}) {
  const toast = useToast();
  const url = `${window.location.origin}${path}`;
  return (
    <div className="share">
      <div className="share__text">
        <span className="share__label">{label}</span>
        <span className="share__hint">{hint}</span>
      </div>
      <div className="share__actions">
        <button
          type="button"
          className="btn btn--small"
          aria-label={`Copy ${label} link`}
          title={url}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              toast(`${label} link copied.`, "good");
            } catch {
              toast(`Copy failed. The link is ${url}`, "bad");
            }
          }}
        >
          Copy link
        </button>
        <a
          href={path}
          target="_blank"
          rel="noreferrer"
          className="btn btn--small btn--ghost"
          aria-label={`Open ${label} in a new tab`}
        >
          Open ↗
        </a>
      </div>
    </div>
  );
}

function Setup({
  worldId,
  fixture,
}: {
  worldId: string;
  fixture: string | null;
}) {
  const id = encodeURIComponent(worldId);
  const query = fixture ? `?fixture=${fixture}` : "";
  return (
    <section className="card setup" aria-labelledby="setup-title">
      <h2 id="setup-title">Stream setup</h2>
      <ShareLink
        label="OBS overlay"
        path={`/overlay/${id}${query}`}
        hint="Browser Source · 1920 × 1080 · transparent"
      />
      <ShareLink
        label="Viewer page"
        path={`/world/${id}${query}`}
        hint="Share in chat so viewers can follow along"
      />
    </section>
  );
}

function LastDecision({ snapshot }: { snapshot: WorldSnapshot }) {
  const scene = snapshot.scene;
  if (!scene || scene.round.status !== "resolved") return null;
  return (
    <p className="last-decision">
      Last decision:{" "}
      <strong>
        {scene.round.winningChoiceId
          ? choiceLabel(scene, scene.round.winningChoiceId)
          : "Council held its position"}
      </strong>{" "}
      <span className="muted">
        ({scene.round.totalVoters}{" "}
        {scene.round.totalVoters === 1 ? "voter" : "voters"})
      </span>
    </p>
  );
}

export function Studio() {
  const { worldId = "" } = useParams();
  const fixture = useFixtureParam();
  const world = useWorld(worldId, fixture);
  const { session, refresh } = useSession(!fixture);
  const { run, busy } = useCommand(world.apply, refresh);
  const change = useDelta(world.snapshot);
  const toast = useToast();
  const [selected, setSelected] = useState<string | null>(null);
  const snapshot = world.snapshot;
  useDocumentTitle(
    snapshot ? `Studio · ${snapshot.name} · AFTERLIFE` : "Studio · AFTERLIFE",
  );
  const remembered = useMemo(
    () => (snapshot ? referencedEventIds(snapshot) : []),
    [snapshot],
  );

  if (!snapshot) return <FeedGate feed={world.feed} error={world.error} />;

  const owns =
    session.status === "signed_in" &&
    session.identity.worlds.some((entry) => entry.worldId === worldId);
  const controlsDisabled = !!fixture || !owns;
  const step = studioStep(snapshot);
  const scene =
    snapshot.scene &&
    snapshot.mode === "active" &&
    snapshot.scene.round.status !== "deferred"
      ? snapshot.scene
      : null;
  const select = (id: string) =>
    setSelected((current) => (current === id ? null : id));

  let gate: ReactNode = null;
  if (fixture)
    gate = (
      <p className="studio-note">
        Fixture preview: controls are shown but disabled. Nothing is sent to the
        server.
      </p>
    );
  else if (session.status === "signed_out")
    gate = (
      <section className="card studio-gate">
        <h2>Sign in to control this kingdom</h2>
        <SignIn onSignedIn={refresh} />
      </section>
    );
  else if (session.status === "signed_in" && !owns)
    gate = (
      <p className="studio-note studio-note--warn">
        You're signed in, but this world belongs to another broadcaster
        {session.identity.rehearsal
          ? " or a different rehearsal session"
          : ""}. <Link to="/studio">Open your own studio</Link>.
      </p>
    );
  else if (session.status === "error")
    gate = <p className="studio-note studio-note--warn">{session.message}</p>;

  return (
    <div className="page page--studio">
      {fixture && <FixtureBar current={fixture} />}
      <header className="topbar">
        <div className="topbar__left">
          <Brand small to="/studio" />
          <span className="topbar__divider" aria-hidden="true" />
          <div className="topbar__title">
            <h1>{snapshot.name}</h1>
            <span className="topbar__mode">
              Creator studio · {modeLabel(snapshot)}
            </span>
          </div>
        </div>
        <div className="topbar__right">
          {snapshot.rehearsal && <RehearsalBadge />}
          <div className="status-group" aria-label="Connections">
            <FeedPill feed={world.feed} />
            <ChatPill snapshot={snapshot} />
            <BroadcastPill snapshot={snapshot} />
            <NarratorPill snapshot={snapshot} />
          </div>
          {session.status === "signed_in" && (
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={async () => {
                try {
                  await api.logout();
                } catch (error) {
                  toast(describeError(error), "bad");
                }
                await refresh();
              }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {gate && <div className="studio-gate-wrap">{gate}</div>}

      <main className="studio-grid">
        <div className="studio-grid__control">
          <NextStep
            snapshot={snapshot}
            step={step}
            run={run}
            busy={busy}
            disabled={controlsDisabled}
          />
          {scene ? (
            <SceneCard
              scene={scene}
              events={world.events}
              onSelectEvent={select}
              heading="On screen now"
            />
          ) : (
            <section className="card studio-empty">
              <span className="eyebrow">On screen now</span>
              <p className="muted">
                {snapshot.mode === "resting"
                  ? "The overlay shows the episode summary and what happened while the stream rested."
                  : "The overlay shows the recap and faction sign-up until you present a dilemma."}
              </p>
              <LastDecision snapshot={snapshot} />
            </section>
          )}
          {snapshot.rehearsal && (
            <RehearsalViewers
              snapshot={snapshot}
              run={run}
              busy={busy}
              disabled={controlsDisabled}
            />
          )}
        </div>
        <div className="studio-grid__world">
          <Setup worldId={snapshot.worldId} fixture={fixture} />
          <section
            className="card realm realm--compact"
            aria-label="Kingdom state"
          >
            <KingdomMap
              locations={snapshot.locations}
              changed={Object.keys(change?.delta.locations ?? {})}
              compact
            />
            <div className="realm__factions">
              {snapshot.factions.map((entry) => (
                <FactionCard
                  key={entry.id}
                  faction={entry}
                  delta={change?.delta.factions[entry.id]}
                />
              ))}
            </div>
            <TrustMeter
              trust={snapshot.relationship.trust}
              delta={change?.delta.trust}
            />
          </section>
          <RecapPanel
            snapshot={snapshot}
            events={world.events}
            onSelectEvent={select}
          />
          <section className="card" aria-labelledby="studio-chronicle">
            <div className="section-head">
              <h2 id="studio-chronicle">Recent history</h2>
              <Link
                to={`/world/${encodeURIComponent(snapshot.worldId)}${fixture ? `?fixture=${fixture}` : ""}`}
              >
                Full chronicle
              </Link>
            </div>
            <Chronicle
              events={world.chronicle}
              known={world.events}
              remembered={remembered}
              selectedId={selected}
              onSelect={select}
              limit={5}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
