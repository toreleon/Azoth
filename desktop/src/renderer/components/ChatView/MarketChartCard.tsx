import { useMemo, useState, type PointerEvent, type ReactNode } from "react";
import type { ChatRecord } from "../../../shared/ipc.js";

interface ChartBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface LiveChartPayload {
  ok?: boolean;
  tool?: string;
  symbol?: string;
  kind?: "stock" | "index";
  resolution?: string;
  count?: number;
  updatedAt?: number;
  unit?: string;
  summary?: {
    latestClose?: number;
    latestTime?: number;
    changePct?: number | null;
    high?: number;
    low?: number;
    volume?: number;
    dataAgeSeconds?: number;
  } | null;
  bars?: ChartBar[];
  error?: string;
}

interface Props {
  record: ChatRecord;
  fallback: ReactNode;
}

export function isLiveChartToolName(name: string | undefined): boolean {
  const normalized = name?.replace(/^mcp__[^_]+__/, "");
  return normalized === "live_chart";
}

export function MarketChartCard({ record, fallback }: Props) {
  const payload = parseChartPayload(record);
  if (!payload || payload.ok === false || !payload.bars?.length) return <>{fallback}</>;

  const bars = payload.bars;
  const latest = payload.summary?.latestClose ?? bars[bars.length - 1]?.c;
  const changePct = payload.summary?.changePct;
  const direction = (changePct ?? 0) >= 0 ? "up" : "down";
  const title = `${payload.symbol ?? "Market"} chart`;
  const subtitle = [
    resolutionLabel(payload.resolution),
    `${bars.length} candles`,
    payload.summary?.latestTime ? `Last bar ${formatTime(payload.summary.latestTime)}` : null,
    payload.updatedAt ? `Fetched ${formatTime(payload.updatedAt)}` : null,
  ].filter(Boolean).join(" - ");

  return (
    <article className="turn chart-turn">
      <section className="market-chart-card">
        <header className="chart-card-head">
          <div>
            <div className="chart-title">{title}</div>
            <div className="chart-subtitle">{subtitle}</div>
          </div>
          <div className={`chart-last is-${direction}`}>
            <span>{formatPrice(latest)}</span>
            {changePct != null ? <strong>{formatPct(changePct)}</strong> : null}
          </div>
        </header>
        <CandlestickSvg bars={bars} />
        <div className="chart-metrics">
          <Metric label="High" value={formatPrice(payload.summary?.high)} />
          <Metric label="Low" value={formatPrice(payload.summary?.low)} />
          <Metric label="Volume" value={formatVolume(payload.summary?.volume)} />
          <Metric label="Unit" value={payload.kind === "index" ? "points" : "thousand VND"} />
        </div>
      </section>
    </article>
  );
}

function CandlestickSvg({ bars }: { bars: ChartBar[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 720;
  const height = 300;
  const pad = { top: 14, right: 54, bottom: 24, left: 8 };
  const chartHeight = 210;
  const volumeTop = pad.top + chartHeight + 16;
  const volumeHeight = 36;
  const plotWidth = width - pad.left - pad.right;
  const highs = bars.map((bar) => bar.h);
  const lows = bars.map((bar) => bar.l);
  const volumes = bars.map((bar) => bar.v);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const range = Math.max(0.001, max - min);
  const priceMin = min - range * 0.08;
  const priceMax = max + range * 0.08;
  const priceRange = priceMax - priceMin;
  const maxVolume = Math.max(1, ...volumes);
  const step = plotWidth / Math.max(1, bars.length);
  const bodyWidth = Math.max(2, Math.min(8, step * 0.58));
  const grid = [0, 0.25, 0.5, 0.75, 1];
  const hoverBar = hoverIndex == null ? null : bars[hoverIndex] ?? null;

  const xAt = (idx: number) => pad.left + step * idx + step / 2;
  const yAt = (price: number) => pad.top + ((priceMax - price) / priceRange) * chartHeight;
  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = ((event.clientX - rect.left) / rect.width) * width;
    const idx = Math.round((relativeX - pad.left - step / 2) / step);
    setHoverIndex(Math.max(0, Math.min(bars.length - 1, idx)));
  };

  return (
    <svg
      className="chart-svg"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Live OHLCV chart"
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setHoverIndex(null)}
    >
      {grid.map((ratio) => {
        const y = pad.top + ratio * chartHeight;
        const price = priceMax - ratio * priceRange;
        return (
          <g key={ratio}>
            <line className="chart-grid-line" x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
            <text className="chart-axis-label" x={width - pad.right + 8} y={y + 4}>
              {formatPrice(price)}
            </text>
          </g>
        );
      })}
      {bars.map((bar, idx) => {
        const x = xAt(idx);
        const openY = yAt(bar.o);
        const closeY = yAt(bar.c);
        const highY = yAt(bar.h);
        const lowY = yAt(bar.l);
        const top = Math.min(openY, closeY);
        const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));
        const isUp = bar.c >= bar.o;
        const volumeHeightPx = Math.max(1, (bar.v / maxVolume) * volumeHeight);
        return (
          <g key={`${bar.t}-${idx}`} className={isUp ? "chart-candle is-up" : "chart-candle is-down"}>
            <line x1={x} x2={x} y1={highY} y2={lowY} />
            <rect x={x - bodyWidth / 2} y={top} width={bodyWidth} height={bodyHeight} rx="1.2" />
            <rect
              className="chart-volume"
              x={x - bodyWidth / 2}
              y={volumeTop + volumeHeight - volumeHeightPx}
              width={bodyWidth}
              height={volumeHeightPx}
              rx="1"
            />
          </g>
        );
      })}
      {hoverBar && hoverIndex != null ? (
        <ChartHoverLayer
          bar={hoverBar}
          x={xAt(hoverIndex)}
          y={yAt(hoverBar.c)}
          width={width}
          chartTop={pad.top}
          chartBottom={pad.top + chartHeight}
          volumeBottom={volumeTop + volumeHeight}
        />
      ) : null}
      <line className="chart-volume-baseline" x1={pad.left} x2={width - pad.right} y1={volumeTop + volumeHeight} y2={volumeTop + volumeHeight} />
    </svg>
  );
}

function ChartHoverLayer({
  bar,
  x,
  y,
  width,
  chartTop,
  chartBottom,
  volumeBottom,
}: {
  bar: ChartBar;
  x: number;
  y: number;
  width: number;
  chartTop: number;
  chartBottom: number;
  volumeBottom: number;
}) {
  const tooltipWidth = 184;
  const tooltipHeight = 82;
  const tooltipX = x > width - tooltipWidth - 72 ? x - tooltipWidth - 12 : x + 12;
  const tooltipY = Math.max(8, Math.min(chartBottom - tooltipHeight + 10, y - tooltipHeight / 2));
  const rows = useMemo(
    () => [
      ["O", formatPrice(bar.o), "H", formatPrice(bar.h)],
      ["L", formatPrice(bar.l), "C", formatPrice(bar.c)],
      ["V", formatVolume(bar.v), "", ""],
    ],
    [bar],
  );

  return (
    <g className="chart-hover">
      <line className="chart-crosshair" x1={x} x2={x} y1={chartTop} y2={volumeBottom} />
      <line className="chart-crosshair" x1={8} x2={width - 54} y1={y} y2={y} />
      <circle cx={x} cy={y} r="3.5" />
      <g transform={`translate(${tooltipX} ${tooltipY})`}>
        <rect width={tooltipWidth} height={tooltipHeight} rx="8" />
        <text className="chart-tooltip-date" x="10" y="17">{formatDate(bar.t)}</text>
        {rows.map((row, idx) => (
          <g key={idx} transform={`translate(10 ${35 + idx * 15})`}>
            <text className="chart-tooltip-label" x="0" y="0">{row[0]}</text>
            <text className="chart-tooltip-value" x="16" y="0">{row[1]}</text>
            {row[2] ? <text className="chart-tooltip-label" x="88" y="0">{row[2]}</text> : null}
            {row[3] ? <text className="chart-tooltip-value" x="104" y="0">{row[3]}</text> : null}
          </g>
        ))}
      </g>
    </g>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="chart-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function parseChartPayload(record: ChatRecord): LiveChartPayload | null {
  const text = record.text;
  const input = parseToolInput(record.toolInput);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as LiveChartPayload;
    if (parsed?.tool !== "live_chart" && !parsed?.bars?.length) return null;
    return {
      ...parsed,
      symbol: parsed.symbol ?? input.symbol,
      kind: parsed.kind ?? input.kind,
      resolution: parsed.resolution ?? input.resolution,
      bars: parsed.bars,
    };
  } catch {
    return salvagePartialChartPayload(text, input);
  }
}

function parseToolInput(input: string | undefined): Partial<LiveChartPayload> {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input) as Partial<LiveChartPayload>;
    return {
      symbol: typeof parsed.symbol === "string" ? parsed.symbol : undefined,
      kind: parsed.kind,
      resolution: typeof parsed.resolution === "string" ? parsed.resolution : undefined,
    };
  } catch {
    return {};
  }
}

function salvagePartialChartPayload(
  text: string,
  input: Partial<LiveChartPayload>,
): LiveChartPayload | null {
  if (!text.includes('"tool":"live_chart"')) return null;
  const bars = [...text.matchAll(/\{"t":(\d+),"o":(-?\d+(?:\.\d+)?),"h":(-?\d+(?:\.\d+)?),"l":(-?\d+(?:\.\d+)?),"c":(-?\d+(?:\.\d+)?),"v":(\d+)\}/g)]
    .map((match) => ({
      t: Number(match[1]),
      o: Number(match[2]),
      h: Number(match[3]),
      l: Number(match[4]),
      c: Number(match[5]),
      v: Number(match[6]),
    }))
    .filter((bar) => Number.isFinite(bar.t) && Number.isFinite(bar.c));
  if (!bars.length) return null;
  const latest = bars[bars.length - 1]!;
  return {
    ok: true,
    tool: "live_chart",
    symbol: input.symbol,
    kind: input.kind,
    resolution: input.resolution,
    count: bars.length,
    summary: {
      latestClose: latest.c,
      latestTime: latest.t,
      changePct: pctFromBars(bars),
      high: Math.max(...bars.map((bar) => bar.h)),
      low: Math.min(...bars.map((bar) => bar.l)),
      volume: bars.reduce((sum, bar) => sum + bar.v, 0),
    },
    bars,
  };
}

function pctFromBars(bars: ChartBar[]): number | null {
  const first = bars[0]?.c;
  const latest = bars[bars.length - 1]?.c;
  if (first == null || latest == null || first === 0) return null;
  return ((latest - first) / first) * 100;
}

function resolutionLabel(resolution: string | undefined): string {
  if (!resolution) return "Live";
  if (resolution === "1") return "1 minute";
  if (["5", "15", "30"].includes(resolution)) return `${resolution} minute`;
  if (resolution === "1H") return "1 hour";
  if (resolution.endsWith("D")) return `${resolution.replace("D", "")} day`;
  if (resolution.endsWith("W")) return `${resolution.replace("W", "")} week`;
  if (resolution.endsWith("M")) return `${resolution.replace("M", "")} month`;
  return `${resolution} candles`;
}

function formatTime(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPrice(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function formatPct(value: number): string {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatVolume(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
