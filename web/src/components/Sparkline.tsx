import { useId } from "react";
import type { Direction } from "../lib/format";

interface Props {
  data: number[];
  width?: number;
  height?: number;
  /** If omitted, derived from first vs last value. */
  direction?: Direction;
  strokeWidth?: number;
  /** Draw a soft gradient area under the line. */
  fill?: boolean;
  className?: string;
}

const COLOR: Record<Direction, string> = {
  up: "var(--up-strong)",
  down: "var(--down-strong)",
  flat: "var(--text-muted)",
};

/**
 * Dependency-free SVG sparkline. Stretches to the given viewBox; give it a sized
 * container and it scales via preserveAspectRatio="none".
 */
export default function Sparkline({
  data,
  width = 96,
  height = 32,
  direction,
  strokeWidth = 1.6,
  fill = false,
  className,
}: Props) {
  const gid = useId();
  const clean = data.filter((v) => Number.isFinite(v));
  if (clean.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }

  const dir: Direction =
    direction ?? (clean[clean.length - 1]! > clean[0]! ? "up" : clean[clean.length - 1]! < clean[0]! ? "down" : "flat");
  const color = COLOR[dir];

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const pad = strokeWidth;
  const innerH = height - pad * 2;
  const stepX = width / (clean.length - 1);

  const points = clean.map((v, i) => {
    const x = i * stepX;
    const y = pad + innerH - ((v - min) / span) * innerH;
    return [x, y] as const;
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      {fill && (
        <defs>
          <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={areaPath} fill={`url(#spark-${gid})`} stroke="none" />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
