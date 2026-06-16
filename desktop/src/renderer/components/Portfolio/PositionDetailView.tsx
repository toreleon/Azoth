import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MarketIndexOverview,
  PortfolioHistory,
  PortfolioHistoryRes,
  PortfolioSnapshot,
} from "../../../shared/ipc.js";
import {
  formatPercent,
  formatQuantity,
  formatSignedVnd,
  formatThousandVnd,
  formatVndCompact,
  pnlClass,
} from "../../lib/format.js";
import { MarketLineChart, formatNumber } from "../Market/MarketLineChart.js";

const REFRESH_MS = 30_000;

export function PositionDetailView({
  symbol,
  onOpenTicker,
  onBack,
}: {
  symbol: string;
  onOpenTicker: (symbol: string) => void;
  onBack: () => void;
}) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [history, setHistory] = useState<PortfolioHistoryRes | null>(null);
  const [asset, setAsset] = useState<MarketIndexOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const now = new Date();
      const from = new Date(now);
      from.setMonth(now.getMonth() - 6);
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      const [snap, hist, mkt] = await Promise.all([
        window.azoth.invoke("portfolio:snapshot", {}),
        window.azoth.invoke("portfolio:history", {
          kind: "all",
          fromDate: fmt(from),
          toDate: fmt(now),
          limit: 200,
        }),
        window.azoth.invoke("market:asset", { symbol, resolution: "1D", bars: 180 }),
      ]);
      setSnapshot(snap);
      setHistory(hist);
      setAsset(mkt);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, [symbol]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const positions = useMemo(
    () => (snapshot?.positions ?? []).filter((p) => p.ticker === symbol),
    [snapshot, symbol],
  );
  const totalQty = positions.reduce((sum, p) => sum + p.quantity, 0);
  const costBasis = positions.reduce((sum, p) => sum + p.cost_basis_vnd, 0);
  const marketValue = positions.reduce((sum, p) => sum + (p.market_value_vnd ?? 0), 0);
  const unrealized = positions.reduce((sum, p) => sum + (p.unrealized_pnl_vnd ?? 0), 0);
  const avgCost = totalQty > 0 ? costBasis / totalQty / 1000 : 0;
  const unrealizedPct = costBasis > 0 ? (unrealized / costBasis) * 100 : null;
  const concentrationPct =
    snapshot && snapshot.total_equity_vnd > 0 ? (marketValue / snapshot.total_equity_vnd) * 100 : 0;

  const tickerHistory = useMemo(() => filterHistoryByTicker(history, symbol), [history, symbol]);
  const realizedYtd = useMemo(() => {
    if (!history || history.supported === false) return 0;
    return history.transactions
      .filter((t) => t.title?.toUpperCase().includes(symbol) || t.description?.toUpperCase().includes(symbol))
      .reduce((sum, t) => sum + t.amountVnd, 0);
  }, [history, symbol]);

  return (
    <section className="ticker-detail-page" aria-label={`${symbol} position`}>
      <main className="page">
        <nav className="crumbs">
          <button type="button" onClick={onBack}>Portfolio</button>
          <span className="sep">/</span>
          <span>Holdings</span>
          <span className="sep">/</span>
          <span className="current">{symbol}</span>
        </nav>

        <section className="detail-head">
          <div className="sym-block">
            <span className="sym-mark lg">{symbol.slice(0, 3)}</span>
            <div className="sym-meta">
              <h1>{symbol} position</h1>
              <span className="name">
                {asset?.name ?? symbol} · {asset?.exchange ?? "VN"} · across {positions.length} sub-account{positions.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div />
          <div className="head-actions">
            <button type="button" className="btn btn-secondary" onClick={() => onOpenTicker(symbol)}>
              Market detail
            </button>
            <button type="button" className="btn btn-buy" onClick={() => onOpenTicker(symbol)}>
              Buy more
            </button>
            <button type="button" className="btn btn-sell" onClick={() => onOpenTicker(symbol)}>
              Sell
            </button>
          </div>
        </section>

        {error ? <div className="market-error">{error}</div> : null}

        <section className="metric-row">
          <Kpi
            label="Market value"
            value={formatVndCompact(marketValue)}
            sub={`${formatQuantity(totalQty)} shares · last ${formatThousandVnd(asset?.latestClose)} K`}
          />
          <Kpi
            label="Unrealized P&L"
            value={`${unrealized >= 0 ? "+" : ""}${formatVndCompact(unrealized)}`}
            tone={unrealized > 0 ? "up" : unrealized < 0 ? "down" : undefined}
            sub={unrealizedPct != null ? `${formatPercent(unrealizedPct)} on cost` : "—"}
          />
          <Kpi
            label="Avg cost"
            value={`${avgCost.toFixed(2)} K`}
            sub={`cost basis ${formatVndCompact(costBasis)}`}
          />
          <Kpi
            label="Realized YTD"
            value={formatSignedVnd(realizedYtd)}
            tone={realizedYtd > 0 ? "up" : realizedYtd < 0 ? "down" : undefined}
            sub="from filled trims and dividends"
          />
        </section>

        <div className="detail-grid">
          <div>
            <section className="chart-card">
              <div className="chart-head">
                <h3 className="card-title">Price vs cost basis</h3>
                <div className="chart-legend">
                  <span className="is-price">Close</span>
                  <span className="is-sma">Avg cost</span>
                </div>
              </div>
              <div className="chart-body">
                {asset && asset.bars.length > 0 ? (
                  <MarketLineChart index={asset} />
                ) : (
                  <div className="market-empty">Loading chart...</div>
                )}
              </div>
            </section>

            <section className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="card-pad" style={{ paddingBottom: "var(--space-3)" }}>
                <div className="row-between">
                  <h3 className="card-title">Lots by sub-account</h3>
                  <span className="preview-tag">from open positions</span>
                </div>
              </div>
              {positions.length === 0 ? (
                <div className="market-symbols-empty">No open lots in this position.</div>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Qty</th>
                      <th>Avg cost</th>
                      <th>Last</th>
                      <th>Market value</th>
                      <th>P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((p) => (
                      <tr key={`${p.sub_account_id ?? ""}-${p.custody_code ?? ""}`}>
                        <td>{p.sub_account_id ?? "—"}</td>
                        <td className="num">{formatQuantity(p.quantity)}</td>
                        <td className="num">{formatThousandVnd(p.avg_cost_thousand_vnd)}</td>
                        <td className="num">{formatThousandVnd(p.last_close_thousand_vnd)}</td>
                        <td className="num">{formatVndCompact(p.market_value_vnd)}</td>
                        <td className={`num ${pnlClass(p.unrealized_pnl_vnd)}`}>
                          {formatSignedVnd(p.unrealized_pnl_vnd)} · {formatPercent(p.unrealized_pnl_pct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="card-pad" style={{ paddingBottom: "var(--space-3)" }}>
                <div className="row-between">
                  <h3 className="card-title">All {symbol} activity</h3>
                  <span className="preview-tag">last 6 months</span>
                </div>
              </div>
              <ActivityList history={tickerHistory} />
            </section>
          </div>

          <aside>
            <section className="card card-pad">
              <h3 className="card-title">Position breakdown</h3>
              <div className="stat-list" style={{ marginTop: "var(--space-4)" }}>
                <Row k="Total shares" v={formatQuantity(totalQty)} />
                <Row k="Cost basis" v={formatVndCompact(costBasis)} />
                <Row k="Market value" v={formatVndCompact(marketValue)} />
                <Row k="Avg cost" v={`${avgCost.toFixed(2)} K`} />
                <Row k="Last close" v={`${formatNumber(asset?.latestClose)} K`} />
              </div>
            </section>

            <section className="card card-pad">
              <h3 className="card-title">Concentration</h3>
              <p style={{ fontSize: "var(--text-sm)", color: "var(--muted)", margin: "var(--space-3) 0 var(--space-4)" }}>
                {concentrationPct >= 25
                  ? `${symbol} exceeds the 25% concentration guardrail.`
                  : `${symbol} is ${concentrationPct.toFixed(1)}% of net liquidation.`}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
                <div className="alloc" style={{ flex: 1, height: 8 }}>
                  <span
                    style={{
                      width: `${Math.min(100, concentrationPct).toFixed(1)}%`,
                      background: concentrationPct >= 25 ? "var(--warn)" : "var(--accent)",
                    }}
                  />
                </div>
                <span className="num" style={{ fontWeight: 600 }}>
                  {concentrationPct.toFixed(1)}%
                </span>
              </div>
              <p style={{ fontSize: "var(--text-xs)", color: "var(--meta)", marginTop: "var(--space-3)" }}>
                Of net liquidation. Account guardrail warns at 25%.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </section>
  );
}

function Kpi({
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function filterHistoryByTicker(history: PortfolioHistoryRes | null, ticker: string): PortfolioHistory | null {
  if (!history || history.supported === false) return null;
  return {
    ...history,
    orders: history.orders.filter((o) => o.ticker === ticker),
    fills: history.fills.filter((f) => f.ticker === ticker),
    transactions: history.transactions.filter(
      (t) =>
        t.title?.toUpperCase().includes(ticker) ||
        t.description?.toUpperCase().includes(ticker) ||
        t.code?.toUpperCase().includes(ticker),
    ),
    rights: history.rights.filter((r) => r.ticker === ticker),
  };
}

function ActivityList({ history }: { history: PortfolioHistory | null }) {
  if (!history) return <div className="market-symbols-empty">No activity recorded.</div>;
  const rows = [...history.fills].sort((a, b) => (b.tradeDate ?? "").localeCompare(a.tradeDate ?? ""));
  if (rows.length === 0) return <div className="market-symbols-empty">No recent activity for this symbol.</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Date</th>
          <th>Side</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Gross</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f, i) => (
          <tr key={`${f.orderId}-${i}`}>
            <td className="mono">{f.tradeDate ?? "—"}</td>
            <td>
              <span className={`tone-pill ${f.side === "BUY" ? "up" : "down"}`}>{f.side}</span>
            </td>
            <td className="num">{formatQuantity(f.quantity)}</td>
            <td className="num">{formatThousandVnd(f.priceThousandVnd)}</td>
            <td className={`num ${f.side === "BUY" ? "down" : "up"}`}>
              {f.side === "BUY" ? "−" : "+"}
              {formatVndCompact(f.grossValueVnd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
