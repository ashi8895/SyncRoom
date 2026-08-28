interface Props {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

const STEPS = [
  {
    num: "01",
    title: "Create a Room",
    desc: "Start a new watch party and get a unique room code.",
  },
  {
    num: "02",
    title: "Invite Friends",
    desc: "Share your room code with your friends and let them join.",
  },
  {
    num: "03",
    title: "Choose a Video",
    desc: "Add a YouTube video and start watching together.",
  },
  {
    num: "04",
    title: "Watch in Sync",
    desc: "Play, pause and seek together in real time.",
  },
];

/**
 * The pre-room landing page. Purely presentational — it hands off to
 * App.tsx's existing room-creation/join flow via the two callbacks, it
 * doesn't talk to the socket or duplicate any of that logic itself.
 */
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
        <span className="eyebrow hero-badge">Watch together in real-time</span>
        <h1 className="hero-title">
          Watch Together.
          <br />
          <span className="accent-text">Anywhere.</span>
        </h1>
        <p className="tagline hero-tagline">
          Create a room and watch YouTube with your friends in perfect sync.
        </p>

        <div className="hero-actions">
          <button className="btn btn-marquee btn-large" onClick={onCreateRoom}>
            Create a Room
          </button>
          <button className="btn btn-large" onClick={onJoinRoom}>
            Join a Room
          </button>
        </div>
      </div>

      <section id="how-it-works" className="how-it-works">
        <span className="eyebrow how-it-works-badge">How it works</span>
        <h2>
          Watch together in{" "}
          <span className="accent-text">four simple steps.</span>
        </h2>
        <p className="tagline how-it-works-sub">
          Create a room, invite your friends, and start watching YouTube
          together.
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
            <strong>Host &amp; Moderator Controls</strong>
            <p>
              Hosts and moderators can play, pause, seek and change videos while
              everyone stays synchronized.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
