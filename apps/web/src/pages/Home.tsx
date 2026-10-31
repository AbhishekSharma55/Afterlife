import { Link } from "react-router-dom";
import { Brand } from "../components/Shell";
import { KingdomMap } from "../components/KingdomMap";
import { Remembered } from "../components/Voting";
import { FIXTURE_LABELS, FIXTURE_ORDER, getFixture } from "../lib/fixtures";
import { useDocumentTitle } from "../lib/useDocumentTitle";

// The episode-two fixture: Westbridge closed, Blue preparing, the betrayal remembered.
const example = getFixture("returning");
const exampleEvents = Object.fromEntries(
  example.recentEvents.map((event) => [event.id, event]),
);

const STEPS = [
  {
    title: "Chat picks a side",
    body: "Viewers type !join red or !join blue. Their allegiance is remembered.",
  },
  {
    title: "The community decides",
    body: "Each dilemma offers up to three choices. Chat votes with !vote 1, 2 or 3.",
  },
  {
    title: "The world rests",
    body: "When the stream ends, the kingdom keeps moving: grudges grow, supplies dwindle.",
  },
  {
    title: "History returns",
    body: "Next episode, consequences arrive, linked to the exact decision that caused them.",
  },
];

export function Home() {
  useDocumentTitle("AFTERLIFE — The stream ends. The world remembers.");
  return (
    <div className="page page--home">
      <header className="home-top">
        <Brand />
        <Link className="btn btn--small" to="/studio">
          Creator studio
        </Link>
      </header>
      <main>
        <section className="hero">
          <div className="hero__copy">
            <span className="eyebrow">
              A persistent kingdom story for Twitch
            </span>
            <h1 className="hero__title">
              The stream ends.
              <br />
              <span>The world remembers.</span>
            </h1>
            <p className="hero__lede">
              Your chat splits into two kingdoms and votes on what happens next.
              Every betrayal, alliance and unfinished grudge is recorded, and it
              comes back in the next episode.
            </p>
            <div className="hero__actions">
              <Link className="btn btn--primary btn--large" to="/studio">
                Open the creator studio
              </Link>
              <Link
                className="btn btn--large"
                to="/world/preview?fixture=returning"
              >
                See an example kingdom
              </Link>
            </div>
          </div>
          <div className="hero__art" aria-label="Example kingdom">
            <KingdomMap locations={example.locations} />
            <Remembered
              ids={example.scene?.causeEventIds ?? []}
              events={exampleEvents}
              heading="Episode two remembers"
            />
          </div>
        </section>

        <section className="steps" aria-label="How it works">
          {STEPS.map((step, index) => (
            <article key={step.title} className="step card">
              <span className="step__num">{index + 1}</span>
              <h2>{step.title}</h2>
              <p className="muted">{step.body}</p>
            </article>
          ))}
        </section>

        <section className="card gallery" aria-labelledby="gallery-title">
          <div className="section-head">
            <h2 id="gallery-title">Preview every state</h2>
            <span className="muted">
              Backend-generated sample snapshots. No server needed; nothing here
              is live.
            </span>
          </div>
          <div className="gallery__scroll">
            <table className="gallery__table">
              <thead>
                <tr>
                  <th scope="col">State</th>
                  <th scope="col">Viewer page</th>
                  <th scope="col">OBS overlay</th>
                  <th scope="col">Studio</th>
                </tr>
              </thead>
              <tbody>
                {FIXTURE_ORDER.map((name) => (
                  <tr key={name}>
                    <th scope="row">{FIXTURE_LABELS[name]}</th>
                    <td>
                      <Link to={`/world/preview?fixture=${name}`}>World</Link>
                    </td>
                    <td>
                      <Link to={`/overlay/preview?fixture=${name}`}>
                        Overlay
                      </Link>
                    </td>
                    <td>
                      <Link to={`/studio/preview?fixture=${name}`}>Studio</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <footer className="home-foot muted">
        Built for the Codex × TwitchCon Hackathon.
      </footer>
    </div>
  );
}
