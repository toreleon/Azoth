import { useEffect, useMemo, useState } from "react";
import type { MarketIndexOverview } from "../../../shared/ipc.js";
import { RefreshIcon, SearchIcon } from "../Icon.js";
import {
  Sparkline,
  formatClock,
  formatNumber,
  formatPct,
} from "./MarketLineChart.js";
import { MarketSymbolsTable } from "./MarketSymbolsTable.js";

type LoadState =
  | { status: "loading"; data: MarketIndexOverview[]; updatedAt?: number; error?: string }
  | { status: "ready"; data: MarketIndexOverview[]; updatedAt: number; error?: string }
  | { status: "error"; data: MarketIndexOverview[]; updatedAt?: number; error: string };

const REFRESH_MS = 30_000;

type Timeframe = "1D" | "1W" | "1M" | "YTD";

export function MarketView({ onOpenTicker }: { onOpenTicker: (symbol: string) => void }) {
  const [state, setState] = useState<LoadState>({ status: "loading", data: [] });
  const [heatmap, setHeatmap] = useState<MarketIndexOverview[]>([]);
  const [tickerInput, setTickerInput] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1D");
  const [watchlist, setWatchlist] = useState<Set<string>>(() => loadWatchlist());

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
        window.azoth.invoke("market:overview", { resolution: "1D", bars: 90 }),
        window.azoth.invoke("market:heatmap", { includeIndexes: false }),
      ]);
      setState({ status: "ready", data: overview.indices, updatedAt: overview.updatedAt });
      setHeatmap(heatmapData.assets);
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

  function openTicker(symbol: string) {
    const normalized = symbol.toUpperCase();
    setTickerInput("");
    onOpenTicker(normalized);
  }

  function toggleWatch(symbol: string) {
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      saveWatchlist(next);
      return next;
    });
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(true), REFRESH_MS);
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

  const stocks = useMemo(() => allAssets.filter((a) => a.kind !== "index"), [allAssets]);
  const tickerSuggestions = useMemo(() => suggestTickers(allAssets, tickerInput), [allAssets, tickerInput]);
  const indexAssets =
    state.data.length > 0 ? state.data : allAssets.filter((asset) => asset.kind === "index");

  const advancing = stocks.filter((a) => (a.change ?? 0) > 0).length;
  const declining = stocks.filter((a) => (a.change ?? 0) < 0).length;
  const unchanged = Math.max(0, stocks.length - advancing - declining);
  const total = stocks.length || 0;
  const matchedValue = stocks.reduce((sum, a) => sum + ((a.volume ?? 0) * (a.latestClose ?? 0)), 0);

  const sectorAggregates = useMemo(() => aggregateSectors(stocks), [stocks]);
  const visibleAssets = useMemo(() => {
    if (!sectorFilter) return stocks;
    return stocks.filter((a) => (a.industry ?? "").toLowerCase() === sectorFilter.toLowerCase());
  }, [stocks, sectorFilter]);

  return (
    <section className="market-view">
      <div className="market-page">
        <header className="market-header">
          <div>
            <p className="kicker">Vietnam market desk · auto-refreshes every 30s</p>
            <h1>Markets</h1>
            <p className="page-sub">
              Tracking {total} symbols across HOSE, HNX and UPCOM
              {state.updatedAt ? ` · updated ${formatClock(state.updatedAt)}` : ""}
            </p>
          </div>
          <div className="market-header-actions">
            <span className="status-bar">
              <span className="dot" />
              <span>Session live</span>
            </span>
            <button
              type="button"
              className="market-refresh-btn"
              title="Refresh markets"
              aria-label="Refresh markets"
              onClick={() => void load()}
            >
              <RefreshIcon />
            </button>
          </div>
        </header>

        {state.status === "error" ? <div className="market-error">{state.error}</div> : null}

        <form
          className="market-search"
          onSubmit={(event) => {
            event.preventDefault();
            const symbol = tickerSuggestions[0]?.symbol ?? parseTickerSymbol(tickerInput);
            if (symbol) openTicker(symbol);
          }}
        >
          <label className="market-search-input" htmlFor="market-ticker">
            <SearchIcon />
            <input
              id="market-ticker"
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value)}
              placeholder="Search ticker or company"
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
                  <em>—</em>
                </button>
              )}
            </div>
          ) : null}
        </form>

        <section className="index-strip" aria-label="Index overview">
          {indexAssets.length > 0
            ? indexAssets.slice(0, 4).map((index) => {
                const change = index.change ?? 0;
                const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
                return (
                  <button key={index.symbol} type="button" className="index-cell" onClick={() => openTicker(index.symbol)}>
                    <span className="index-name">{index.name}</span>
                    <span className="index-value num">{formatNumber(index.latestClose)}</span>
                    <div className="index-foot">
                      <span className={`index-delta num ${tone}`}>
                        {change > 0 ? "+" : ""}
                        {formatNumber(index.change)} · {formatPct(index.changePct)}
                      </span>
                      <Sparkline bars={index.bars} width={120} height={32} />
                    </div>
                  </button>
                );
              })
            : [0, 1, 2, 3].map((i) => <div key={i} className="index-cell is-loading" />)}
        </section>

        <section className="metric-row" aria-label="Market breadth">
          <Cell label="Advancing" value={String(advancing)} tone="up" sub={pctOf(advancing, total)} />
          <Cell label="Declining" value={String(declining)} tone="down" sub={pctOf(declining, total)} />
          <Cell label="Unchanged" value={String(unchanged)} sub={pctOf(unchanged, total)} />
          <Cell
            label="Matched value"
            value={formatCompact(matchedValue)}
            sub={total ? `${total} symbols tracked` : "—"}
          />
        </section>

        <section>
          <div className="market-section-label">
            <span className="kicker">Sectors</span>
            <div className="seg" role="group" aria-label="Timeframe">
              {(["1D", "1W", "1M", "YTD"] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  className={tf === timeframe ? "is-active" : ""}
                  onClick={() => setTimeframe(tf)}
                  disabled={tf !== "1D"}
                  title={tf === "1D" ? undefined : "Coming soon"}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div className="chip-row">
            <button
              type="button"
              className={`chip ${sectorFilter == null ? "is-active" : ""}`}
              onClick={() => setSectorFilter(null)}
            >
              All <span className="chip-delta flat">·</span>
            </button>
            {sectorAggregates.slice(0, 12).map((sector) => {
              const tone = sector.avg > 0 ? "up" : sector.avg < 0 ? "down" : "flat";
              return (
                <button
                  key={sector.name}
                  type="button"
                  className={`chip ${sectorFilter === sector.name ? "is-active" : ""}`}
                  onClick={() =>
                    setSectorFilter((current) => (current === sector.name ? null : sector.name))
                  }
                  title={`${sector.name}: ${sector.count} symbols`}
                >
                  {sector.name} <span className={`chip-delta ${tone} num`}>{formatPct(sector.avg)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <MarketSymbolsTable
          assets={visibleAssets}
          watchlist={watchlist}
          onToggleWatch={toggleWatch}
          onOpen={openTicker}
          totalCount={stocks.length}
        />

        <p className="market-symbols-footer">
          Showing up to 80 of {visibleAssets.length} symbols · prices in thousand VND
        </p>
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="metric-cell">
      <span className="metric-label">{label}</span>
      <span className={`metric-value ${tone ?? ""}`}>{value}</span>
      {sub ? <span className="metric-sub">{sub}</span> : null}
    </div>
  );
}

function pctOf(part: number, total: number): string {
  if (!total) return "—";
  return `${Math.round((part / total) * 100)}% of tracked`;
}

function formatCompact(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

function aggregateSectors(assets: MarketIndexOverview[]): Array<{ name: string; avg: number; count: number }> {
  const groups = new Map<string, { sum: number; count: number }>();
  for (const asset of assets) {
    const name = (asset.industry ?? "").trim();
    if (!name) continue;
    const pct = asset.changePct;
    if (!Number.isFinite(pct ?? NaN)) continue;
    const slot = groups.get(name) ?? { sum: 0, count: 0 };
    slot.sum += pct as number;
    slot.count += 1;
    groups.set(name, slot);
  }
  return Array.from(groups, ([name, slot]) => ({ name, avg: slot.sum / slot.count, count: slot.count })).sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
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
    .filter((asset) => asset.symbol.includes(query) || asset.name.toUpperCase().includes(query))
    .sort((a, b) => {
      const aStarts = a.symbol.startsWith(query) ? 0 : 1;
      const bStarts = b.symbol.startsWith(query) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return (b.marketCap ?? 0) - (a.marketCap ?? 0) || a.symbol.localeCompare(b.symbol);
    })
    .slice(0, 8);
}

function loadWatchlist(): Set<string> {
  try {
    const raw = localStorage.getItem("azoth.watchlist");
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveWatchlist(set: Set<string>): void {
  try {
    localStorage.setItem("azoth.watchlist", JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function formatMarketLoadError(message: string): string {
  if (/No handler registered for 'market:(overview|asset)'/.test(message)) {
    return "Markets needs the updated Electron main process. Restart the desktop app or rerun pnpm --dir desktop dev.";
  }
  return message;
}
