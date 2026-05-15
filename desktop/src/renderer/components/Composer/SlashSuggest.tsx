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
      <div className="slash-head">Slash commands</div>
      {matches.map((c, i) => (
        <button
          key={c.name}
          onClick={() => onPick(c)}
          onMouseDown={(e) => e.preventDefault()}
          className={`slash-item${i === sel ? " active" : ""}`}
        >
          <span className="cmd">/{c.name}{c.args ? ` ${c.args}` : ""}</span>
          <span className="desc">{c.description}</span>
        </button>
      ))}
    </div>
  );
}
