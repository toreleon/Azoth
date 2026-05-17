import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { MarketIndexOverview } from "../../../shared/ipc.js";
import { RefreshIcon } from "../Icon.js";

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

export function MarketView() {
  const [state, setState] = useState<LoadState>({ status: "loading", data: [] });
  const [heatmap, setHeatmap] = useState<MarketIndexOverview[]>([]);
  const [assets, setAssets] = useState<MarketIndexOverview[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState("VNINDEX");
  const [inspectedSymbol, setInspectedSymbol] = useState<string | null>(null);
  const [tickerInput, setTickerInput] = useState("");
  const [assetLoading, setAssetLoading] = useState(false);
  const [assetError, setAssetError] = useState<string | null>(null);

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
      if (!overview.indices.some((index) => index.symbol === selectedSymbol) && assets.length === 0) {
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

  async function fetchTicker(symbolInput: string, silent = false) {
    const symbols = parseTickerInput(symbolInput);
    if (symbols.length === 0) return;
    setAssetError(null);
    if (!silent) setAssetLoading(true);
    try {
      const fetched = await Promise.all(
        symbols.map((symbol) =>
          window.azoth.invoke("market:asset", {
            symbol,
            resolution: "1D",
            bars: 120,
          }),
        ),
      );
      const existingAssets = [...state.data, ...assets, ...heatmap];
      const enriched = fetched.map((asset) => enrichAsset(asset, existingAssets));
      const errored = enriched.find((asset) => asset.error);
      if (errored?.error) setAssetError(`${errored.symbol}: ${errored.error}`);
      setAssets((current) => [
        ...enriched,
        ...current.filter((item) => !enriched.some((asset) => asset.symbol === item.symbol)),
      ]);
      setSelectedSymbol(enriched[0]?.symbol ?? symbols[0] ?? "VNINDEX");
      setInspectedSymbol(enriched[0]?.symbol ?? symbols[0] ?? null);
      setTickerInput("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setAssetError(formatMarketLoadError(message));
    } finally {
      if (!silent) setAssetLoading(false);
    }
  }

  async function refreshAssets() {
    const symbols = assets.map((asset) => asset.symbol);
    if (symbols.length === 0) return;
    const refreshed = await Promise.all(
      symbols.map((symbol) =>
        window.azoth.invoke("market:asset", {
          symbol,
          resolution: "1D",
          bars: 120,
        }),
      ),
    );
    const existingAssets = [...state.data, ...assets, ...heatmap];
    setAssets(refreshed.map((asset) => enrichAsset(asset, existingAssets)));
  }

  async function inspectAsset(asset: MarketIndexOverview) {
    setSelectedSymbol(asset.symbol);
    setInspectedSymbol(asset.symbol);
    if (asset.bars.length > 0) return;
    await fetchTicker(asset.symbol, true);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => {
      void load(true);
      void refreshAssets();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [assets]);

  const allAssets = useMemo(() => {
    const seen = new Set<string>();
    return [...state.data, ...assets, ...heatmap].filter((asset) => {
      if (seen.has(asset.symbol)) return false;
      seen.add(asset.symbol);
      return true;
    });
  }, [assets, heatmap, state.data]);
  const selected = useMemo(
    () => allAssets.find((index) => index.symbol === selectedSymbol) ?? allAssets[0],
    [allAssets, selectedSymbol],
  );
  const marketGroups = useMemo(() => groupMarketAssets(allAssets), [allAssets]);
  const advancing = allAssets.filter((index) => (index.change ?? 0) > 0).length;
  const declining = allAssets.filter((index) => (index.change ?? 0) < 0).length;
  const detailOpen = inspectedSymbol != null && selected?.symbol === inspectedSymbol;

  return (
    <section className="market-view">
      <header className="market-header">
        <div>
          <h1>Markets</h1>
          <p>Vietnam indexes, stock tickers, charts, and RMA trend projection.</p>
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
      {assetError ? <div className="market-error">{assetError}</div> : null}

      <div className={`market-shell ${detailOpen ? "has-detail" : "no-detail"}`}>
        <div className="market-workspace">
          <form
            className="market-search ds-card"
            onSubmit={(event) => {
              event.preventDefault();
              void fetchTicker(tickerInput);
            }}
          >
            <div>
              <label htmlFor="market-ticker">Add ticker or index</label>
              <span>Fetch OHLCV, quote, RMA, and projection.</span>
            </div>
            <input
              id="market-ticker"
              className="ds-input"
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value)}
              placeholder="FPT, HPG, VCB, VNINDEX"
            />
            <button className="ds-button primary" disabled={!tickerInput.trim() || assetLoading}>
              {assetLoading ? "Fetching" : "Fetch"}
            </button>
          </form>

          <div className="market-breadth-strip">
            <MetricPill label="Tracked" value={String(allAssets.length || 4)} />
            <MetricPill label="Advancing" value={String(advancing)} tone="up" />
            <MetricPill label="Declining" value={String(declining)} tone="down" />
            <MetricPill label="Refresh" value="30s" />
          </div>

          <div className="market-heatmap" aria-label="Market heatmap by industry">
            {marketGroups.length > 0
              ? marketGroups.map((group) => (
                  <section key={group.industry} className={`market-sector ${sectorToneClass(group.averageChangePct)}`}>
                    <header className="market-sector-head">
                      <div>
                        <h3>{group.industry}</h3>
                        <span>{group.assets.length} symbols · {group.advancing} up · {group.declining} down</span>
                      </div>
                      <strong className={group.averageChangePct > 0 ? "is-up" : group.averageChangePct < 0 ? "is-down" : undefined}>
                        {formatPct(group.averageChangePct)}
                      </strong>
                    </header>
                    <div className="market-sector-grid">
                      {group.assets.map((index) => (
                        <button
                          key={index.symbol}
                          type="button"
                          className={`market-heat-tile ${heatTileClass(index)} ${index.symbol === selected?.symbol ? "is-selected" : ""}`}
                          style={heatTileStyle(index)}
                          onClick={() => void inspectAsset(index)}
                        >
                          <div className="market-heat-head">
                            <span>{index.name}</span>
                            <strong>{index.symbol}</strong>
                          </div>
                          <div className="market-heat-price">{formatNumber(index.latestClose)}</div>
                          <ChangePill index={index} />
                          <Sparkline bars={index.bars} />
                          <div className="market-heat-meta">
                            <span>{index.exchange}</span>
                            <span>{index.error ? "Unavailable" : formatClock(index.updatedAt)}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              : [0, 1, 2, 3].map((item) => <div key={item} className="market-heat-tile is-loading" />)}
          </div>

        </div>

        {detailOpen ? (
          <TickerDetailPanel
            key={selected?.symbol ?? "empty"}
            selected={selected}
            total={allAssets.length || 4}
            advancing={advancing}
            declining={declining}
            onClose={() => setInspectedSymbol(null)}
          />
        ) : null}
      </div>
    </section>
  );
}

function TickerDetailPanel({
  selected,
  total,
  advancing,
  declining,
  onClose,
}: {
  selected: MarketIndexOverview | undefined;
  total: number;
  advancing: number;
  declining: number;
  onClose: () => void;
}) {
  if (!selected) {
    return null;
  }

  return (
    <aside className="market-detail-panel ds-card" aria-label={`${selected.symbol} details`}>
      <div className="market-detail-hero">
        <div className="market-detail-kicker">
          <span>{selected.kind === "stock" ? "Ticker detail" : "Index detail"}</span>
          <button type="button" aria-label="Close ticker details" title="Close details" onClick={onClose}>×</button>
        </div>
        <div className="market-detail-symbol">
          <h2>{selected.symbol}</h2>
          <ChangePill index={selected} />
        </div>
        <p>{selected.name}</p>
        <strong>{formatNumber(selected.latestClose)}</strong>
      </div>

      <div className="market-detail-chart">
        <MarketLineChart index={selected} compact />
      </div>

      {selected.forecast ? (
        <div className={`market-forecast-card is-${selected.forecast.direction}`}>
          <span>RMA forecast</span>
          <strong>{forecastLabel(selected.forecast)}</strong>
          <small>{selected.forecast.confidence} confidence</small>
        </div>
      ) : null}

      <div className="market-detail-section">
        <h3>Market</h3>
        <StatRow label="Industry" value={selected.industry ?? "Unclassified"} />
        <StatRow label="Exchange" value={selected.exchange} />
        <StatRow label="Kind" value={selected.kind ?? "index"} />
        <StatRow label="Previous close" value={formatNumber(selected.previousClose)} />
        <StatRow label="High / low" value={`${formatNumber(selected.high)} / ${formatNumber(selected.low)}`} />
        <StatRow label="Volume" value={formatNumber(selected.volume)} />
      </div>

      <div className="market-detail-section">
        <h3>Quote</h3>
        <StatRow label="Bid / offer" value={`${formatNumber(selected.quote?.bestBid)} / ${formatNumber(selected.quote?.bestOffer)}`} />
        <StatRow label="Matched volume" value={formatNumber(selected.quote?.matchedVolume)} />
        <StatRow label="Session" value={selected.quote?.session ?? "-"} />
        <StatRow label="Status" value={selected.quote?.tradingStatus ?? "-"} />
      </div>

      <div className="market-detail-section">
        <h3>Breadth</h3>
        <StatRow label="Tracked" value={String(total)} />
        <StatRow label="Advancing" value={String(advancing)} tone="up" />
        <StatRow label="Declining" value={String(declining)} tone="down" />
        <StatRow label="Bars" value={String(selected.bars.length)} />
      </div>
    </aside>
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

function parseTickerInput(input: string): string[] {
  const seen = new Set<string>();
  return input
    .split(/[\s,;]+/)
    .map((symbol) => symbol.trim().toUpperCase())
    .filter((symbol) => /^[A-Z0-9]{1,12}$/.test(symbol))
    .filter((symbol) => {
      if (seen.has(symbol)) return false;
      seen.add(symbol);
      return true;
    })
    .slice(0, 12);
}

function enrichAsset(
  asset: MarketIndexOverview,
  existingAssets: MarketIndexOverview[],
): MarketIndexOverview {
  const existing = existingAssets.find((item) => item.symbol === asset.symbol);
  return {
    ...asset,
    industry:
      asset.industry && asset.industry !== "Unclassified"
        ? asset.industry
        : existing?.industry ?? asset.industry,
    marketCap: asset.marketCap ?? existing?.marketCap,
  };
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

function sectorToneClass(changePct: number): string {
  if (changePct > 0) return "is-up";
  if (changePct < 0) return "is-down";
  return "is-flat";
}

function ChangePill({ index }: { index: MarketIndexOverview }) {
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

function heatTileClass(index: MarketIndexOverview): string {
  const pct = Math.abs(index.changePct ?? 0);
  const direction = (index.change ?? 0) > 0 ? "is-up" : (index.change ?? 0) < 0 ? "is-down" : "is-flat";
  const intensity = pct >= 2 ? "is-hot" : pct >= 0.75 ? "is-warm" : "is-cool";
  const size = index.kind === "index" || tileWeight(index) > 30_000 ? "is-wide" : "";
  return [direction, intensity, size].filter(Boolean).join(" ");
}

function heatTileStyle(index: MarketIndexOverview): CSSProperties {
  const weight = tileWeight(index);
  if (index.kind === "index" || weight >= 100_000) return { gridColumn: "span 4", gridRow: "span 3" };
  if (weight >= 35_000) return { gridColumn: "span 3", gridRow: "span 2" };
  if (weight >= 10_000) return { gridColumn: "span 2", gridRow: "span 2" };
  if (weight >= 3_000) return { gridColumn: "span 2" };
  return {};
}

function tileWeight(index: MarketIndexOverview): number {
  return index.marketCap ?? index.volume ?? 0;
}

function MarketLineChart({ index, compact = false }: { index: MarketIndexOverview; compact?: boolean }) {
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

function StatRow({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
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

function forecastLabel(forecast: NonNullable<MarketIndexOverview["forecast"]>): string {
  const direction = forecast.direction === "up" ? "Up" : forecast.direction === "down" ? "Down" : "Flat";
  const target = forecast.nextClose != null ? ` ${formatNumber(forecast.nextClose)}` : "";
  const pct = forecast.changePct != null ? ` (${formatPct(forecast.changePct)})` : "";
  return `${direction}${target}${pct}`;
}

function formatNumber(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function formatPct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatClock(value: number | undefined): string {
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
