interface Props {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

const STEPS = [
  {
    num: "01",
    title: "Spin Up a Room",
    desc: "One click and your room code is ready - no signup, no setup.",
  },
  {
    num: "02",
    title: "Pull People In",
    desc: "Drop the code in your group chat and watch them roll in.",
  },
  {
    num: "03",
    title: "Drop a Link",
    desc: "Paste any YouTube video and it loads for everyone at once.",
  },
  {
    num: "04",
    title: "Stay Locked In",
    desc: "Every pause, skip, and replay lands the same moment for the whole crew.",
  },
];

export function Home({ onCreateRoom, onJoinRoom }: Props) {
  return (
    <div>
      <nav className="site-nav">
        <a href="#top" className="nav-brand">
          <span className="nav-logo">▶</span> SyncRoom
        </a>

        <div className="nav-links">
          <a href="#top" className="nav-link">
            Home
          </a>

          <a href="#how-it-works" className="nav-link">
            How it works
          </a>

          <a
            href="https://github.com/ashi8895/SyncRoom"
            target="_blank"
            rel="noreferrer"
            className="nav-link"
          >
            GitHub
          </a>
        </div>
      </nav>

      <div id="top" className="hero">
        <span className="eyebrow hero-badge">
          No downloads. No accounts. Just press play.
        </span>

        <h1 className="hero-title">
          One Screen.
          <br />
          <span className="accent-text">Every Friend.</span>
        </h1>

        <p className="tagline hero-tagline">
          Fire up a room, drop a YouTube link, and everyone's watching the exact
          same frame - together.
        </p>

        <div className="hero-actions">
          <button className="btn btn-marquee btn-large" onClick={onCreateRoom}>
            Start a Room
          </button>

          <button className="btn btn-large" onClick={onJoinRoom}>
            I Have a Code
          </button>
        </div>
      </div>

      <section id="how-it-works" className="how-it-works">
        <span className="eyebrow how-it-works-badge">The Basics</span>

        <h2>
          From zero to{" "}
          <span className="accent-text">
            watching together in under a minute.
          </span>
        </h2>

        <p className="tagline how-it-works-sub">
          No app to install, no account to make - just a code and a video.
        </p>

        <div className="steps-grid">
          {STEPS.map((step) => (
            <div key={step.num} className="step-card">
              <span className="step-num">{step.num}</span>

              <h3>{step.title}</h3>

              <p>{step.desc}</p>
            </div>
          ))}
        </div>

        <div className="host-callout">
          <span className="host-callout-icon">👑</span>

          <div>
            <strong>Who's Driving?</strong>

            <p>
              The room's Host - and anyone they trust with Moderator - steers
              the video. Everyone else just kicks back and watches.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
