import { useEffect, useMemo, useState } from "react";
import type { MarketIndexOverview } from "../../../shared/ipc.js";
import { RefreshIcon, SearchIcon } from "../Icon.js";
import { MarketTreemap, type SizeBy } from "./MarketTreemap.js";

type LoadState =
  | { status: "loading"; data: MarketIndexOverview[]; updatedAt?: number; error?: string }
  | { status: "ready"; data: MarketIndexOverview[]; updatedAt: number; error?: string }
  | { status: "error"; data: MarketIndexOverview[]; updatedAt?: number; error: string };

const REFRESH_MS = 30_000;
type MarketGroup = {
  industry: string;
  assets: MarketIndexOverview[];
  advancing: number;
  declining: number;
  averageChangePct: number;
};

const MARKET_MAP_LIMIT = 220;

export function MarketView({ onOpenTicker }: { onOpenTicker: (symbol: string) => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading", data: [] });
  const [heatmap, setHeatmap] = useState<MarketIndexOverview[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("VNINDEX");
  const [tickerInput, setTickerInput] = useState("");
  const [sizeBy, setSizeBy] = useState<SizeBy>("marketCap");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  async function load(silent = false) {
    if (!silent) {
      setState((current) =>
        current.data.length > 0
          ? current
          : { status: "loading", data: [], updatedAt: current.updatedAt, error: current.error },
      );
    }
    try {
      const [overview, heatmapData] = await Promise.all([
        window.azoth.invoke("market:overview", {
          resolution: "1D",
          bars: 90,
        }),
        window.azoth.invoke("market:heatmap", {
          includeIndexes: false,
        }),
      ]);
      setState({ status: "ready", data: overview.indices, updatedAt: overview.updatedAt });
      setHeatmap(heatmapData.assets);
      if (!overview.indices.some((index) => index.symbol === selectedSymbol)) {
        setSelectedSymbol(overview.indices[0]?.symbol ?? "VNINDEX");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((current) => ({
        status: "error",
        data: current.data,
        updatedAt: current.updatedAt,
        error: formatMarketLoadError(message),
      }));
    }
  }

  function inspectAsset(asset: MarketIndexOverview) {
    setSelectedSymbol(asset.symbol);
    onOpenTicker(asset.symbol);
  }

  function openTicker(symbol: string) {
    const normalized = symbol.toUpperCase();
    setSelectedSymbol(normalized);
    setTickerInput("");
    onOpenTicker(normalized);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load(true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const allAssets = useMemo(() => {
    const seen = new Set<string>();
    return [...state.data, ...heatmap].filter((asset) => {
      if (seen.has(asset.symbol)) return false;
      seen.add(asset.symbol);
      return true;
    });
  }, [heatmap, state.data]);
  const tickerSuggestions = useMemo(() => suggestTickers(allAssets, tickerInput), [allAssets, tickerInput]);
  const selected = useMemo(
    () => allAssets.find((index) => index.symbol === selectedSymbol) ?? allAssets[0],
    [allAssets, selectedSymbol],
  );
  const sectorAssets = useMemo(() => allAssets.filter((asset) => asset.kind !== "index"), [allAssets]);
  const marketGroups = useMemo(() => groupMarketAssets(sectorAssets), [sectorAssets]);
  const marketMapAssets = useMemo(() => compactMarketMapAssets(sectorAssets, MARKET_MAP_LIMIT), [sectorAssets]);
  const sectorLeaders = useMemo(() => marketGroups.slice(0, 10), [marketGroups]);
  const indexAssets = state.data.length > 0 ? state.data : allAssets.filter((asset) => asset.kind === "index");
  const advancing = allAssets.filter((index) => (index.change ?? 0) > 0).length;
  const declining = allAssets.filter((index) => (index.change ?? 0) < 0).length;
  const unchanged = Math.max(0, allAssets.length - advancing - declining);

  return (
    <section className="market-view">
      <header className="market-header">
        <div>
          <span className="ds-kicker">Vietnam market desk</span>
          <h1>Markets</h1>
        </div>
        <div className="market-header-actions">
          <span className="market-refresh-label">
            {state.updatedAt ? `Updated ${formatClock(state.updatedAt)}` : "Waiting for data"}
          </span>
          <button
            type="button"
            className="settings-icon-btn"
            title="Refresh markets"
            aria-label="Refresh markets"
            onClick={() => void load()}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      {state.status === "error" ? <div className="market-error">{state.error}</div> : null}

      <div className="market-shell no-detail">
        <div className="market-workspace">
          <form
            className="market-command-bar ds-card"
            onSubmit={(event) => {
              event.preventDefault();
              const symbol = tickerSuggestions[0]?.symbol ?? parseTickerSymbol(tickerInput);
              if (symbol) openTicker(symbol);
            }}
          >
            <label className="market-search-field" htmlFor="market-ticker">
              <SearchIcon />
              <input
                id="market-ticker"
                className="ds-input"
                value={tickerInput}
                onChange={(event) => setTickerInput(event.target.value)}
                placeholder="Search ticker"
                autoComplete="off"
              />
            </label>
            {tickerInput.trim() ? (
              <div className="market-search-suggestions" role="listbox">
                {tickerSuggestions.length > 0 ? (
                  tickerSuggestions.map((asset) => (
                    <button
                      key={asset.symbol}
                      type="button"
                      className="market-search-option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => openTicker(asset.symbol)}
                    >
                      <strong>{asset.symbol}</strong>
                      <span>{asset.name}</span>
                      <em>{formatNumber(asset.latestClose)}</em>
                    </button>
                  ))
                ) : (
                  <button
                    type="submit"
                    className="market-search-option"
                    disabled={!parseTickerSymbol(tickerInput)}
                  >
                    <strong>{tickerInput.trim().toUpperCase()}</strong>
                    <span>Open ticker</span>
                  </button>
                )}
              </div>
            ) : null}
          </form>

          <div className="market-breadth-strip" aria-label="Market breadth">
            <MetricPill label="Tracked" value={String(allAssets.length || 4)} />
            <MetricPill label="Up" value={String(advancing)} tone="up" />
            <MetricPill label="Down" value={String(declining)} tone="down" />
            <MetricPill label="Flat" value={String(unchanged)} />
          </div>

          <section className="market-index-strip" aria-label="Index overview">
            {indexAssets.length > 0
              ? indexAssets.map((index) => (
                  <button
                    key={index.symbol}
                    type="button"
                    className={`market-index-card ds-card ${index.symbol === selected?.symbol ? "is-selected" : ""}`}
                    onClick={() => void inspectAsset(index)}
                  >
                    <div className="market-index-top">
                      <div>
                        <span>{index.name}</span>
                        <strong>{index.symbol}</strong>
                      </div>
                      <ChangePill index={index} />
                    </div>
                    <div className="market-index-price">{formatNumber(index.latestClose)}</div>
                    <Sparkline bars={index.bars} />
                    <div className="market-index-meta">
                      <span>{index.exchange}</span>
                      <span>{index.error ? "Unavailable" : formatClock(index.updatedAt)}</span>
                    </div>
                  </button>
                ))
              : [0, 1, 2, 3].map((item) => <div key={item} className="market-index-card ds-card is-loading" />)}
          </section>

          <section className="market-board" aria-label="Market heatmap">
            <div className="market-board-head">
              <div>
                <span className="ds-kicker">Heatmap</span>
                <h2>Market map</h2>
              </div>
              <div className="market-board-controls">
                <div className="market-toggle-group" role="group" aria-label="Size by">
                  <span className="ds-kicker">Size</span>
                  <button
                    type="button"
                    className={`market-toggle-btn ${sizeBy === "marketCap" ? "is-active" : ""}`}
                    onClick={() => setSizeBy("marketCap")}
                  >
                    Market cap
                  </button>
                  <button
                    type="button"
                    className={`market-toggle-btn ${sizeBy === "volume" ? "is-active" : ""}`}
                    onClick={() => setSizeBy("volume")}
                  >
                    Volume
                  </button>
                </div>
                <div className="market-toggle-group" role="group" aria-label="Time window">
                  <span className="ds-kicker">Window</span>
                  <button type="button" className="market-toggle-btn is-active">1D</button>
                  <button type="button" className="market-toggle-btn" disabled title="Coming soon">1W</button>
                  <button type="button" className="market-toggle-btn" disabled title="Coming soon">1M</button>
                </div>
                <span className="market-board-count">{marketMapAssets.length || 0} / {sectorAssets.length || 0}</span>
              </div>
            </div>

            <div className="market-sector-tape" aria-label="Sector filter">
              {sectorFilter ? (
                <button
                  type="button"
                  className="market-sector-chip is-clear"
                  onClick={() => setSectorFilter(null)}
                  title="Clear sector filter"
                >
                  <span>All sectors</span>
                  <strong>×</strong>
                </button>
              ) : null}
              {sectorLeaders.length > 0
                ? sectorLeaders.map((group) => (
                    <button
                      key={group.industry}
                      type="button"
                      className={`market-sector-chip ${sectorToneClass(group.averageChangePct)} ${sectorFilter === group.industry ? "is-active" : ""}`}
                      onClick={() =>
                        setSectorFilter((current) => (current === group.industry ? null : group.industry))
                      }
                      title={`${group.industry}: ${group.assets.length} symbols`}
                    >
                      <span>{group.industry}</span>
                      <strong>{formatPct(group.averageChangePct)}</strong>
                    </button>
                  ))
                : [0, 1, 2, 3, 4].map((item) => <span key={item} className="market-sector-chip is-loading" />)}
            </div>

            <div className="market-treemap-wrap">
              {marketMapAssets.length > 0 ? (
                <MarketTreemap
                  assets={marketMapAssets}
                  sizeBy={sizeBy}
                  sectorFilter={sectorFilter}
                  selectedSymbol={selected?.symbol}
                  onSelect={(asset) => void inspectAsset(asset)}
                />
              ) : (
                <div className="market-treemap is-loading" aria-hidden="true" />
              )}
            </div>
          </section>
        </div>

      </div>
    </section>
  );
}

function MetricPill({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="market-metric-pill">
      <span>{label}</span>
      <strong className={tone ? `is-${tone}` : undefined}>{value}</strong>
    </div>
  );
}

function parseTickerSymbol(input: string): string | null {
  const symbol = input.trim().toUpperCase();
  return /^[A-Z0-9]{1,12}$/.test(symbol) ? symbol : null;
}

function suggestTickers(assets: MarketIndexOverview[], input: string): MarketIndexOverview[] {
  const query = input.trim().toUpperCase();
  if (!query) return [];
  return assets
    .filter((asset) => {
      const name = asset.name.toUpperCase();
      return asset.symbol.includes(query) || name.includes(query);
    })
    .sort((a, b) => {
      const aStarts = a.symbol.startsWith(query) ? 0 : 1;
      const bStarts = b.symbol.startsWith(query) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      const aExact = a.symbol === query ? 0 : 1;
      const bExact = b.symbol === query ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return tileWeight(b) - tileWeight(a) || a.symbol.localeCompare(b.symbol);
    })
    .slice(0, 8);
}

function groupMarketAssets(assets: MarketIndexOverview[]): MarketGroup[] {
  const groups = new Map<string, MarketIndexOverview[]>();
  for (const asset of assets) {
    const industry = asset.industry?.trim() || (asset.kind === "index" ? "Market indexes" : "Unclassified");
    groups.set(industry, [...(groups.get(industry) ?? []), asset]);
  }

  return Array.from(groups, ([industry, groupAssets]) => {
    const assetsWithChange = groupAssets.filter((asset) => Number.isFinite(asset.changePct));
    const averageChangePct = assetsWithChange.length
      ? assetsWithChange.reduce((sum, asset) => sum + (asset.changePct ?? 0), 0) / assetsWithChange.length
      : 0;
    return {
      industry,
      assets: groupAssets.sort((a, b) => tileWeight(b) - tileWeight(a) || a.symbol.localeCompare(b.symbol)),
      advancing: groupAssets.filter((asset) => (asset.change ?? 0) > 0).length,
      declining: groupAssets.filter((asset) => (asset.change ?? 0) < 0).length,
      averageChangePct,
    };
  }).sort((a, b) => {
    if (a.industry === "Market indexes") return -1;
    if (b.industry === "Market indexes") return 1;
    return b.assets.length - a.assets.length || a.industry.localeCompare(b.industry);
  });
}

function compactMarketMapAssets(assets: MarketIndexOverview[], limit: number): MarketIndexOverview[] {
  const byIndustry = groupMarketAssets(assets);
  const picked = new Map<string, MarketIndexOverview>();
  const add = (asset: MarketIndexOverview) => {
    if (asset.latestClose == null && asset.changePct == null) return;
    picked.set(asset.symbol, asset);
  };

  for (const group of byIndustry) {
    for (const asset of group.assets.slice(0, 10)) add(asset);
  }

  for (const asset of [...assets].sort((a, b) => tileWeight(b) - tileWeight(a))) {
    if (picked.size >= limit) break;
    add(asset);
  }

  return Array.from(picked.values()).sort((a, b) => tileWeight(b) - tileWeight(a) || a.symbol.localeCompare(b.symbol));
}

function sectorToneClass(changePct: number): string {
  if (changePct > 0) return "is-up";
  if (changePct < 0) return "is-down";
  return "is-flat";
}

export function ChangePill({ index }: { index: MarketIndexOverview }) {
  const change = index.change ?? 0;
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return (
    <span className={`market-change is-${tone}`}>
      {change > 0 ? "+" : ""}
      {formatNumber(index.change)} · {formatPct(index.changePct)}
    </span>
  );
}

function Sparkline({ bars }: { bars: MarketIndexOverview["bars"] }) {
  const points = linePoints(bars, 160, 48, 4);
  const first = bars[0]?.c ?? 0;
  const last = bars.at(-1)?.c ?? first;
  const direction = last >= first ? "up" : "down";
  return (
    <svg className={`market-sparkline is-${direction}`} viewBox="0 0 160 48" aria-hidden="true">
      <path d={points} />
    </svg>
  );
}

function tileWeight(index: MarketIndexOverview): number {
  return index.marketCap ?? index.volume ?? 0;
}

export function MarketLineChart({ index, compact = false }: { index: MarketIndexOverview; compact?: boolean }) {
  const width = 760;
  const height = compact ? 260 : 360;
  const pad = { top: 18, right: 60, bottom: 36, left: 16 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const closeValues = index.bars.map((bar) => bar.c);
  const overlayValues = [
    ...(index.overlays?.sma20?.map((point) => point.value) ?? []),
    ...(index.overlays?.ema20?.map((point) => point.value) ?? []),
    ...(index.overlays?.rma14?.map((point) => point.value) ?? []),
  ];
  const values = [...closeValues, ...overlayValues];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const hasData = closeValues.length > 1 && Number.isFinite(min) && Number.isFinite(max);
  const domain = { min, max };
  const totalPoints = index.bars.length;
  const first = closeValues[0] ?? 0;
  const last = closeValues.at(-1) ?? first;
  const direction = last > first ? "up" : last < first ? "down" : "flat";
  const closePath = lineSeries(closeValues, chartWidth, chartHeight, 0, domain, totalPoints);
  const areaPath = closePath ? `${closePath} L ${chartWidth} ${chartHeight} L 0 ${chartHeight} Z` : "";
  const smaPath = lineSeries(index.overlays?.sma20?.map((point) => point.value) ?? [], chartWidth, chartHeight, 0, domain, totalPoints);
  const emaPath = lineSeries(index.overlays?.ema20?.map((point) => point.value) ?? [], chartWidth, chartHeight, 0, domain, totalPoints);
  const rmaPath = lineSeries(index.overlays?.rma14?.map((point) => point.value) ?? [], chartWidth, chartHeight, 0, domain, totalPoints);
  const endPoint = chartPoint(closeValues.at(-1) ?? 0, totalPoints - 1, chartWidth, chartHeight, 0, domain, totalPoints);
  const gradientId = `market-area-${index.symbol.replace(/[^A-Za-z0-9_-]/g, "")}`;

  if (!hasData) {
    return <div className="market-empty">{index.error ?? "Loading chart data..."}</div>;
  }

  return (
    <>
      <svg className={`market-line-chart is-${direction} ${compact ? "is-compact" : ""}`} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${index.name} chart`}>
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
              <text x={width - pad.right + 10} y={y + 4}>{formatNumber(value)}</text>
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
      <div className={`market-chart-legend is-${direction}`} aria-hidden="true">
        <span className="is-price">Close</span>
        <span className="is-rma">RMA14</span>
        <span className="is-ema">EMA20</span>
        <span className="is-sma">SMA20</span>
      </div>
    </>
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

export function StatRow({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="market-stat-row">
      <span>{label}</span>
      <strong className={tone ? `is-${tone}` : undefined}>{value}</strong>
    </div>
  );
}

function linePoints(
  bars: MarketIndexOverview["bars"],
  width: number,
  height: number,
  inset: number,
): string {
  const values = bars.map((bar) => bar.c);
  return lineSeries(values, width, height, inset);
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

export function forecastLabel(forecast: NonNullable<MarketIndexOverview["forecast"]>): string {
  const direction = forecast.direction === "up" ? "Up" : forecast.direction === "down" ? "Down" : "Flat";
  const target = forecast.nextClose != null ? ` ${formatNumber(forecast.nextClose)}` : "";
  const pct = forecast.changePct != null ? ` (${formatPct(forecast.changePct)})` : "";
  return `${direction}${target}${pct}`;
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

function roundCoord(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMarketLoadError(message: string): string {
  if (/No handler registered for 'market:(overview|asset)'/.test(message)) {
    return "Markets needs the updated Electron main process. Restart the desktop app or rerun pnpm --dir desktop dev.";
  }
  return message;
}
