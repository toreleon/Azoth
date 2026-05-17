import { useMemo, useState } from "react";
import type { MarketIndexOverview } from "../../../shared/ipc.js";
import { Sparkline, formatNumber, formatPct } from "./MarketLineChart.js";

type Tab = "all" | "watchlist" | "gainers" | "losers" | "active";

const STAR_PATH =
  "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z";

export function MarketSymbolsTable({
  assets,
  watchlist,
  onToggleWatch,
  onOpen,
  totalCount,
}: {
  assets: MarketIndexOverview[];
  watchlist: Set<string>;
  onToggleWatch: (symbol: string) => void;
  onOpen: (symbol: string) => void;
  totalCount: number;
}) {
  const [tab, setTab] = useState<Tab>("all");

  const filtered = useMemo(() => {
    const stocks = assets.filter((a) => a.kind !== "index");
    if (tab === "watchlist") return stocks.filter((a) => watchlist.has(a.symbol));
    if (tab === "gainers") {
      return [...stocks].sort((a, b) => (b.changePct ?? -Infinity) - (a.changePct ?? -Infinity));
    }
    if (tab === "losers") {
      return [...stocks].sort((a, b) => (a.changePct ?? Infinity) - (b.changePct ?? Infinity));
    }
    if (tab === "active") {
      return [...stocks].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0));
    }
    return stocks;
  }, [assets, tab, watchlist]);

  const rows = filtered.slice(0, 80);

  return (
    <section className="tbl-card">
      <div className="tbl-toolbar">
        <div className="tbl-tabs" role="tablist">
          <TabBtn current={tab} value="all" onClick={setTab} label="All symbols" />
          <TabBtn
            current={tab}
            value="watchlist"
            onClick={setTab}
            label={`Watchlist · ${watchlist.size}`}
          />
          <TabBtn current={tab} value="gainers" onClick={setTab} label="Top gainers" />
          <TabBtn current={tab} value="losers" onClick={setTab} label="Top losers" />
          <TabBtn current={tab} value="active" onClick={setTab} label="Most active" />
        </div>
        <div className="market-symbols-toolbar-right">
          <span className="kicker" style={{ textTransform: "none", letterSpacing: 0, color: "var(--meta)" }}>
            {totalCount} symbols
          </span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="market-symbols-empty">
          {tab === "watchlist" ? "No symbols on watchlist yet." : "No symbols match."}
        </div>
      ) : (
        <table className="tbl market-symbols-table">
          <thead>
            <tr>
              <th style={{ width: 36 }} aria-label="Watch" />
              <th>Symbol</th>
              <th>Last</th>
              <th>Change</th>
              <th>% Change</th>
              <th>Volume</th>
              <th>Market cap</th>
              <th style={{ minWidth: 140 }}>1D</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((asset) => {
              const change = asset.change ?? 0;
              const pct = asset.changePct ?? 0;
              const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
              const isOn = watchlist.has(asset.symbol);
              return (
                <tr key={asset.symbol}>
                  <td>
                    <button
                      type="button"
                      className={`star ${isOn ? "is-on" : ""}`}
                      aria-label={isOn ? "Unwatch" : "Watch"}
                      onClick={() => onToggleWatch(asset.symbol)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={isOn ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
                        <path d={STAR_PATH} />
                      </svg>
                    </button>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="symbol"
                      onClick={() => onOpen(asset.symbol)}
                      style={{ background: "none", border: 0, padding: 0, cursor: "pointer" }}
                    >
                      <span className="sym-mark">{asset.symbol.slice(0, 3)}</span>
                      <span className="sym-text">
                        <strong>{asset.symbol}</strong>
                        <span className="name">
                          {asset.name}
                          {asset.exchange ? ` · ${asset.exchange}` : ""}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="num">{formatNumber(asset.latestClose)}</td>
                  <td className={`num ${tone}`}>
                    {change > 0 ? "+" : ""}
                    {formatNumber(asset.change)}
                  </td>
                  <td>
                    <span className={`tone-pill ${tone}`}>{formatPct(pct)}</span>
                  </td>
                  <td className="num">{formatNumber(asset.volume)}</td>
                  <td className="num">{formatNumber(asset.marketCap)}</td>
                  <td>
                    <Sparkline bars={asset.bars} width={140} height={28} />
                  </td>
                  <td>
                    <button type="button" className="btn btn-ghost" onClick={() => onOpen(asset.symbol)}>
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function TabBtn({
  current,
  value,
  onClick,
  label,
}: {
  current: Tab;
  value: Tab;
  onClick: (t: Tab) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`tbl-tab ${current === value ? "is-active" : ""}`}
      role="tab"
      aria-selected={current === value}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}
