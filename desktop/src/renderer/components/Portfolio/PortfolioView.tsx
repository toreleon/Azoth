import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BrokerOrderUi,
  PortfolioHistoryRes,
  PortfolioSnapshot,
} from "../../../shared/ipc.js";
import { RefreshIcon } from "../Icon.js";
import { formatVndCompact } from "../../lib/format.js";
import { AllocationCard } from "./AllocationCard.js";
import { EquityHeadlineCard } from "./EquityHeadlineCard.js";
import { HoldingsBoard } from "./HoldingsBoard.js";
import { OpenOrdersStrip } from "./OpenOrdersStrip.js";
import { TradeHistoryTable } from "./TradeHistoryTable.js";

const REFRESH_MS = 30_000;

function formatClock(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(now) };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PortfolioView({
  onOpenTicker,
  onOpenPosition,
}: {
  onOpenTicker: (symbol: string) => void;
  onOpenPosition: (symbol: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [orders, setOrders] = useState<BrokerOrderUi[]>([]);
  const [history, setHistory] = useState<PortfolioHistoryRes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState(defaultRange);

  const loadCore = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [snap, ords] = await Promise.all([
        window.azoth.invoke("portfolio:snapshot", {}),
        window.azoth.invoke("portfolio:orders", { limit: 100 }),
      ]);
      setSnapshot(snap);
      setOrders(ords.orders);
      setUpdatedAt(Math.floor(Date.now() / 1000));
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryError(null);
    try {
      const res = await window.azoth.invoke("portfolio:history", {
        kind: "all",
        fromDate: range.from,
        toDate: range.to,
        limit: 200,
      });
      setHistory(res);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setHistoryError(message);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void loadCore();
    const timer = window.setInterval(() => void loadCore(true), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [loadCore]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const openOrders = orders.filter((o) => o.status === "PENDING");
  const subAccountCount = snapshot?.sub_accounts.length ?? 0;

  const todayStats = useMemo(() => computeToday(history), [history]);

  async function handleCancel(id: string): Promise<void> {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "CANCELLED" } : o)));
    try {
      const res = await window.azoth.invoke("portfolio:cancelOrder", { id });
      setOrders((prev) => prev.map((o) => (o.id === id ? res.order : o)));
      void loadCore(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Cancel failed: ${message}`);
      void loadCore(true);
    }
  }

  async function refresh(): Promise<void> {
    await Promise.all([loadCore(), loadHistory()]);
  }

  return (
    <section className="portfolio-view">
      <div className="portfolio-page">
        <header className="portfolio-header">
          <div>
            <p className="kicker">
              {snapshot ? `${snapshot.broker} · ${subAccountCount} sub-account${subAccountCount === 1 ? "" : "s"}` : "Broker"}
            </p>
            <h1>Portfolio</h1>
            <p className="page-sub">
              {updatedAt ? `Updated ${formatClock(updatedAt)} · ` : ""}auto-refreshes every 30s
            </p>
          </div>
          <div className="portfolio-header-actions">
            <span className="status-bar">
              <span className="dot" />
              <span>Connected · trading enabled</span>
            </span>
            <button
              type="button"
              className="btn btn-secondary portfolio-refresh-btn"
              onClick={() => void refresh()}
              disabled={loading}
              title="Refresh"
            >
              <RefreshIcon />
              <span>Refresh</span>
            </button>
          </div>
        </header>

        {error ? <div className="portfolio-error">{error}</div> : null}

        <EquityHeadlineCard snapshot={snapshot} todayRealizedVnd={todayStats.realized} />

        <div className="portfolio-layout">
          <div className="portfolio-main">
            <HoldingsBoard snapshot={snapshot} onOpenPosition={onOpenPosition} />
            <OpenOrdersStrip orders={openOrders} onCancel={handleCancel} />
            <TradeHistoryTable
              history={history}
              error={historyError}
              range={range}
              onRangeChange={setRange}
              onRefresh={() => void loadHistory()}
            />
          </div>
          <aside className="portfolio-side">
            <AllocationCard snapshot={snapshot} />
            <section className="card card-pad">
              <h3 className="card-title">Today</h3>
              <div className="stat-list" style={{ marginTop: "var(--space-4)" }}>
                <div className="row">
                  <span className="k">Trades</span>
                  <span className="v">{todayStats.trades}</span>
                </div>
                <div className="row">
                  <span className="k">Realized P&amp;L</span>
                  <span className={`v ${todayStats.realized > 0 ? "up" : todayStats.realized < 0 ? "down" : ""}`}>
                    {todayStats.realized >= 0 ? "+" : ""}
                    {formatVndCompact(todayStats.realized)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Fees</span>
                  <span className="v">{formatVndCompact(todayStats.fees)}</span>
                </div>
                <div className="row">
                  <span className="k">Dividends</span>
                  <span className={`v ${todayStats.dividends > 0 ? "up" : ""}`}>
                    {todayStats.dividends >= 0 ? "+" : ""}
                    {formatVndCompact(todayStats.dividends)}
                  </span>
                </div>
                <div className="row">
                  <span className="k">Transfers</span>
                  <span className="v">{formatVndCompact(todayStats.transfers)}</span>
                </div>
              </div>
              <hr className="divider" style={{ margin: "var(--space-4) 0" }} />
              <h3 className="card-title">Risk</h3>
              <div className="stat-list" style={{ marginTop: "var(--space-4)" }}>
                <div className="row">
                  <span className="k">Max concentration</span>
                  <span className="v">{computeMaxConcentration(snapshot)}</span>
                </div>
                <div className="row">
                  <span className="k">Beta-weighted</span>
                  <span className="v">—</span>
                </div>
                <div className="row">
                  <span className="k">Margin used</span>
                  <span className="v">{formatVndCompact(snapshot?.margin_used_vnd ?? 0)}</span>
                </div>
                <div className="row">
                  <span className="k">Drawdown 3M</span>
                  <span className="v">—</span>
                </div>
              </div>
            </section>

            <section className="card card-pad">
              <h3 className="card-title">Quick trade</h3>
              <p style={{ color: "var(--muted)", fontSize: "var(--text-sm)", margin: "var(--space-3) 0 var(--space-4)" }}>
                Open a symbol to use the trade panel with full context.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: "100%", justifyContent: "center", height: 40 }}
                onClick={() => {
                  const first = snapshot?.positions[0]?.ticker;
                  if (first) onOpenTicker(first);
                }}
              >
                Open market detail
              </button>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

function computeToday(history: PortfolioHistoryRes | null): {
  trades: number;
  realized: number;
  fees: number;
  dividends: number;
  transfers: number;
} {
  const today = todayIso();
  const empty = { trades: 0, realized: 0, fees: 0, dividends: 0, transfers: 0 };
  if (!history || history.supported === false) return empty;
  let trades = 0;
  let fees = 0;
  for (const fill of history.fills) {
    if (fill.tradeDate === today) {
      trades += 1;
      fees += (fill.feeVnd ?? 0) + (fill.taxVnd ?? 0);
    }
  }
  let realized = 0;
  let dividends = 0;
  let transfers = 0;
  for (const tx of history.transactions) {
    if (tx.transactionDate !== today) continue;
    const type = (tx.type || tx.flow || "").toLowerCase();
    if (type.includes("dividend") || type.includes("co tuc")) dividends += tx.amountVnd;
    else if (type.includes("transfer") || type.includes("nop") || type.includes("rut")) transfers += tx.amountVnd;
    else realized += tx.amountVnd;
  }
  return { trades, realized, fees, dividends, transfers };
}

function computeMaxConcentration(snapshot: PortfolioSnapshot | null): string {
  if (!snapshot || snapshot.total_equity_vnd <= 0 || snapshot.positions.length === 0) return "—";
  let topTicker = "";
  let topValue = 0;
  for (const p of snapshot.positions) {
    const value = p.market_value_vnd ?? 0;
    if (value > topValue) {
      topValue = value;
      topTicker = p.ticker;
    }
  }
  if (!topTicker) return "—";
  const pct = (topValue / snapshot.total_equity_vnd) * 100;
  return `${topTicker} · ${pct.toFixed(1)}%`;
}
