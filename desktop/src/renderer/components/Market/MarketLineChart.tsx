import type { MarketIndexOverview } from "../../../shared/ipc.js";

export function MarketLineChart({
  index,
  compact = false,
  height,
}: {
  index: MarketIndexOverview;
  compact?: boolean;
  height?: number;
}) {
  const width = 760;
  const h = height ?? (compact ? 260 : 360);
  const pad = { top: 18, right: 60, bottom: 36, left: 16 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = h - pad.top - pad.bottom;
  const closeValues = index.bars.map((bar) => bar.c);
  const overlayValues = [
    ...(index.overlays?.sma20?.map((point) => point.value) ?? []),
    ...(index.overlays?.ema20?.map((point) => point.value) ?? []),
    ...(index.overlays?.rma14?.map((point) => point.value) ?? []),
  ];
  const values = [...closeValues, ...overlayValues];
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const hasData = closeValues.length > 1 && Number.isFinite(min) && Number.isFinite(max);
  const domain = { min, max };
  const totalPoints = index.bars.length;
  const first = closeValues[0] ?? 0;
  const last = closeValues.at(-1) ?? first;
  const direction = last > first ? "up" : last < first ? "down" : "flat";
  const closePath = lineSeries(closeValues, chartWidth, chartHeight, 0, domain, totalPoints);
  const areaPath = closePath ? `${closePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z` : "";
  const smaPath = lineSeries(index.overlays?.sma20?.map((p) => p.value) ?? [], chartWidth, chartHeight, 0, domain, totalPoints);
  const emaPath = lineSeries(index.overlays?.ema20?.map((p) => p.value) ?? [], chartWidth, chartHeight, 0, domain, totalPoints);
  const rmaPath = lineSeries(index.overlays?.rma14?.map((p) => p.value) ?? [], chartWidth, chartHeight, 0, domain, totalPoints);
  const endPoint = chartPoint(closeValues.at(-1) ?? 0, totalPoints - 1, chartWidth, chartHeight, 0, domain, totalPoints);
  const gradientId = `market-area-${index.symbol.replace(/[^A-Za-z0-9_-]/g, "")}`;

  if (!hasData) {
    return <div className="market-empty">{index.error ?? "Loading chart data..."}</div>;
  }

  return (
    <svg
      className={`market-line-chart is-${direction}`}
      viewBox={`0 0 ${width} ${h}`}
      role="img"
      aria-label={`${index.name} chart`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="72%" stopColor="currentColor" stopOpacity="0.04" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
        const y = pad.top + ratio * chartHeight;
        const value = max - (max - min) * ratio;
        return (
          <g key={ratio}>
            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} />
            <text x={width - pad.right + 10} y={y + 4}>
              {formatNumber(value)}
            </text>
          </g>
        );
      })}
      <g transform={`translate(${pad.left} ${pad.top})`}>
        {areaPath ? <path className="market-area-fill" d={areaPath} fill={`url(#${gradientId})`} /> : null}
        {smaPath ? <path className="market-overlay-line is-sma" d={smaPath} /> : null}
        {emaPath ? <path className="market-overlay-line is-ema" d={emaPath} /> : null}
        {rmaPath ? <path className="market-overlay-line is-rma" d={rmaPath} /> : null}
        <path className="market-price-line" d={closePath} />
        <circle className="market-end-dot" cx={endPoint.x} cy={endPoint.y} r="4" />
      </g>
    </svg>
  );
}

function chartPoint(
  value: number,
  idx: number,
  width: number,
  height: number,
  inset: number,
  domain: { min: number; max: number },
  totalPoints: number,
): { x: number; y: number } {
  const range = Math.max(0.001, domain.max - domain.min);
  return {
    x: inset + (idx / Math.max(1, totalPoints - 1)) * (width - inset * 2),
    y: inset + ((domain.max - value) / range) * (height - inset * 2),
  };
}

function lineSeries(
  values: number[],
  width: number,
  height: number,
  inset: number,
  domain?: { min: number; max: number },
  totalPoints = values.length,
): string {
  if (values.length === 0) return "";
  const min = domain?.min ?? Math.min(...values);
  const max = domain?.max ?? Math.max(...values);
  const range = Math.max(0.001, max - min);
  const offset = Math.max(0, totalPoints - values.length);
  return values
    .map((value, idx) => {
      const xIndex = offset + idx;
      const x = inset + (xIndex / Math.max(1, totalPoints - 1)) * (width - inset * 2);
      const y = inset + ((max - value) / range) * (height - inset * 2);
      return `${idx === 0 ? "M" : "L"} ${roundCoord(x)} ${roundCoord(y)}`;
    })
    .join(" ");
}

export function Sparkline({
  bars,
  width = 120,
  height = 32,
  className,
}: {
  bars: MarketIndexOverview["bars"];
  width?: number;
  height?: number;
  className?: string;
}) {
  if (!bars || bars.length < 2) {
    return <svg className={`spark flat ${className ?? ""}`} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" />;
  }
  const values = bars.map((b) => b.c);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.001, max - min);
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const direction = values.at(-1)! > values[0] ? "up" : values.at(-1)! < values[0] ? "down" : "flat";
  return (
    <svg
      className={`spark ${direction} ${className ?? ""}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
    >
      <path className="line" d={points} />
    </svg>
  );
}

export function formatNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

export function formatPct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatClock(value: number | undefined): string {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function forecastLabel(forecast: NonNullable<MarketIndexOverview["forecast"]>): string {
  const direction = forecast.direction === "up" ? "Up" : forecast.direction === "down" ? "Down" : "Flat";
  const target = forecast.nextClose != null ? ` ${formatNumber(forecast.nextClose)}` : "";
  const pct = forecast.changePct != null ? ` (${formatPct(forecast.changePct)})` : "";
  return `${direction}${target}${pct}`;
}

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}
