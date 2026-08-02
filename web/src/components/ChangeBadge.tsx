import { dirOf, fmtPct, type Direction } from "../lib/format";

interface Props {
  /** Percent change; drives color + arrow direction when `direction` is omitted. */
  pct?: number | null;
  /** Override the direction (e.g. when showing an absolute-only badge). */
  direction?: Direction;
  /** Text to show instead of the formatted percent (e.g. "+307.00"). */
  text?: string;
  size?: "sm" | "md" | "lg";
  /** Show the circular arrow dot (Google Finance style). Default true. */
  dot?: boolean;
  className?: string;
}

const ARROW: Record<Direction, string> = { up: "▲", down: "▼", flat: "—" };

const FONT: Record<NonNullable<Props["size"]>, number> = { sm: 12, md: 14, lg: 16 };
const DOT: Record<NonNullable<Props["size"]>, number> = { sm: 16, md: 18, lg: 22 };

export default function ChangeBadge({ pct, direction, text, size = "md", dot = true, className }: Props) {
  const dir = direction ?? dirOf(pct);
  const label = text ?? fmtPct(pct);
  return (
    <span
      className={`gf-badge gf-badge--${dir}${className ? ` ${className}` : ""}`}
      style={{ fontSize: FONT[size] }}
    >
      {dot && (
        <span
          className="gf-badge__dot"
          style={{ width: DOT[size], height: DOT[size], fontSize: DOT[size] * 0.55 }}
        >
          {ARROW[dir]}
        </span>
      )}
      <span className="mono">{label}</span>
    </span>
  );
}
