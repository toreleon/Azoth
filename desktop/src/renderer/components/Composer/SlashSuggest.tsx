import type React from "react";
import { matchSlash, type SlashCommand } from "../../../shared/slashCommands.js";
import {
  CalendarIcon,
  ChartIcon,
  HeartbeatIcon,
  InfoIcon,
  ListIcon,
  NewChatIcon,
  PositionsIcon,
  ShieldIcon,
  UsersIcon,
} from "../Icon.js";

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
      return <IconSlot><UsersIcon /></IconSlot>;
    case "backtest":
      return <IconSlot><CalendarIcon /></IconSlot>;
    case "quote":
      return <IconSlot><ChartIcon /></IconSlot>;
    case "positions":
      return <IconSlot><PositionsIcon /></IconSlot>;
    case "autonomy":
      return <IconSlot><ShieldIcon /></IconSlot>;
    case "health":
      return <IconSlot><HeartbeatIcon /></IconSlot>;
    case "about":
      return <IconSlot><InfoIcon /></IconSlot>;
    case "new":
      return <IconSlot><NewChatIcon /></IconSlot>;
    case "sessions":
      return <IconSlot><ListIcon /></IconSlot>;
    default:
      return <IconSlot><ListIcon /></IconSlot>;
  }
}

function IconSlot({ children }: { children: React.ReactNode }) {
  return (
    <span className="slash-icon" aria-hidden="true">
      {children}
    </span>
  );
}
