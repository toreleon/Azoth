import "./ResearchPanel.css";

const PROMPTS = [
  "What's moving the VN-Index today?",
  "Compare VCB and TCB fundamentals",
  "Which VN30 stocks look oversold right now?",
];

function noop(label: string) {
  console.debug(`[ResearchPanel] ${label} (preview — non-functional)`);
}

/** Compose / edit glyph */
function ComposeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 20h4L18.5 9.5a2 2 0 0 0-2.83-2.83L5.17 17.17 4 20z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Layers / expand glyph */
function LayersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3 3 7.5l9 4.5 9-4.5L12 3z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Sparkle glyph for the suggested prompts */
function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 14.5l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7.7-1.9z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Up-arrow for the send button */
function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 19V6M6 11l6-6 6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function ResearchPanel() {
  return (
    <section className="research" aria-label="Research">
      <div className="research__header">
        <span className="research__title">Research</span>
        <div className="research__header-actions">
          <button
            type="button"
            className="gf-icon-btn"
            aria-label="New research note"
            onClick={() => noop("compose")}
          >
            <ComposeIcon />
          </button>
          <button
            type="button"
            className="gf-icon-btn"
            aria-label="Expand research"
            onClick={() => noop("expand")}
          >
            <LayersIcon />
          </button>
        </div>
      </div>

      <p className="research__lead">What's on your mind?</p>

      <div className="research__prompts">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            className="research__prompt"
            onClick={() => noop(`prompt: ${prompt}`)}
          >
            <span>{prompt}</span>
            <span className="research__prompt-icon">
              <SparkleIcon />
            </span>
          </button>
        ))}
      </div>

      <span className="research__explore-label">Explore what's possible</span>

      <div className="research__chips">
        <button
          type="button"
          className="gf-chip research__chip"
          onClick={() => noop("create portfolio")}
        >
          <span className="research__chip-glyph" aria-hidden="true">
            +
          </span>
          Create a portfolio
        </button>
        <button
          type="button"
          className="gf-chip research__chip"
          onClick={() => noop("create task")}
        >
          <span className="research__chip-glyph" aria-hidden="true">
            ✓
          </span>
          Create a task
        </button>
      </div>

      <div className="research__composer">
        <button
          type="button"
          className="research__composer-add"
          aria-label="Add attachment"
          onClick={() => noop("add")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 5v14M5 12h14"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <span className="research__composer-placeholder">Ask anything</span>
        <button
          type="button"
          className="research__send"
          aria-label="Send"
          onClick={() => noop("send")}
        >
          <SendIcon />
        </button>
      </div>

      <p className="research__footnote">
        Azoth's AI analyst runs in the terminal — this panel is a preview.
      </p>
    </section>
  );
}
