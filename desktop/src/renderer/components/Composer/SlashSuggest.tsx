import { matchSlash, type SlashCommand } from "../../../shared/slashCommands.js";

interface Props {
  input: string;
  selected: number;
  onPick: (cmd: SlashCommand) => void;
}

export function SlashSuggest({ input, selected, onPick }: Props) {
  const matches = matchSlash(input);
  if (matches.length === 0) return null;
  const sel = ((selected % matches.length) + matches.length) % matches.length;
  return (
    <div className="slash-pop show">
      {matches.map((c, i) => (
        <button
          key={c.name}
          onClick={() => onPick(c)}
          onMouseDown={(e) => e.preventDefault()}
          className={`slash-item${i === sel ? " active" : ""}`}
        >
          <SlashIcon name={c.name} />
          <span className="cmd">{displayName(c.name)}</span>
          <span className="desc">{c.description}</span>
        </button>
      ))}
    </div>
  );
}

function displayName(name: string): string {
  return name
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function SlashIcon({ name }: { name: string }) {
  switch (name) {
    case "team":
      return <Icon><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" /><path d="M3 19a5 5 0 0 1 10 0" /><path d="M16 10a2.5 2.5 0 1 0 0-5" /><path d="M16 14c2.4.2 4 1.8 4 4" /></Icon>;
    case "analyze":
      return <Icon><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 15l3-4 3 2 4-6" /><path d="M18 7h-3" /><path d="M18 7v3" /></Icon>;
    case "backtest":
      return <Icon><path d="M4 5h16v14H4z" /><path d="M8 3v4M16 3v4M4 9h16" /><path d="M8 14h2M13 14h3" /></Icon>;
    case "quote":
      return <Icon><path d="M4 17l5-5 3 3 7-8" /><path d="M15 7h4v4" /><path d="M4 5h5" /></Icon>;
    case "positions":
      return <Icon><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16V9M12 16V6M16 16v-4" /></Icon>;
    case "autonomy":
      return <Icon><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" /><path d="M9 12l2 2 4-5" /></Icon>;
    case "health":
      return <Icon><path d="M20 12h-4l-2 5-4-10-2 5H4" /></Icon>;
    case "about":
      return <Icon><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></Icon>;
    case "new":
      return <Icon><path d="M12 5v14M5 12h14" /><circle cx="12" cy="12" r="9" /></Icon>;
    case "sessions":
      return <Icon><path d="M4 6h16M4 12h16M4 18h10" /></Icon>;
    default:
      return <Icon><path d="M6 9l6-5v16l6-5" /></Icon>;
  }
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="slash-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  );
}
