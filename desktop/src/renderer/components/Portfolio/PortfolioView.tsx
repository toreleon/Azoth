import { useCallback, useEffect, useState } from "react";
import type {
  BrokerOrderUi,
  PortfolioHistoryRes,
  PortfolioSnapshot,
} from "../../../shared/ipc.js";
import { BrokerIcon, PositionsIcon, RefreshIcon } from "../Icon.js";
import { AccountOverview } from "./AccountOverview.js";
import { AccountSplitView } from "./AccountSplitView.js";
import { HoldingsTable } from "./HoldingsTable.js";
import { OpenOrdersTable } from "./OpenOrdersTable.js";
import { OrderEntryPanel } from "./OrderEntryPanel.js";
import { TradeHistoryTable } from "./TradeHistoryTable.js";

const REFRESH_MS = 30_000;

function formatClock(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString();
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setDate(now.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(now) };
}

export function PortfolioView({
  onOpenTicker,
}: {
  onOpenTicker: (symbol: string) => void;
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
  const positionCount = snapshot?.positions.length ?? 0;
  const subAccountCount = snapshot?.sub_accounts.length ?? 0;

  async function handleCancel(id: string): Promise<void> {
    setOrders((prev) =>
      prev.map((o) => (o.id === id ? { ...o, status: "CANCELLED" } : o)),
    );
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
      <header className="portfolio-header">
        <div className="portfolio-heading">
          <span className="ds-kicker">
            {snapshot ? `Broker: ${snapshot.broker}` : "Broker"}
          </span>
          <h1 className="ds-title">My Portfolio</h1>
          <div className="portfolio-header-meta" aria-label="Portfolio summary">
            <span>
              <BrokerIcon />
              {subAccountCount} sub-account{subAccountCount === 1 ? "" : "s"}
            </span>
            <span>
              <PositionsIcon />
              {positionCount} position{positionCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="portfolio-header-actions">
          <span className="portfolio-refresh-label">
            {updatedAt ? `Updated ${formatClock(updatedAt)}` : "Waiting for data"}
          </span>
          <button
            type="button"
            className="ds-button portfolio-refresh-btn"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {error ? <div className="portfolio-error">{error}</div> : null}

      <div className="portfolio-layout">
        <div className="portfolio-main">
          <AccountOverview snapshot={snapshot} />
          <AccountSplitView
            snapshot={snapshot}
            onOpenTicker={onOpenTicker}
          />
          <HoldingsTable
            positions={snapshot?.positions ?? []}
            onOpenTicker={onOpenTicker}
          />
          <OpenOrdersTable orders={openOrders} onCancel={handleCancel} />
          <TradeHistoryTable
            history={history}
            error={historyError}
            range={range}
            onRangeChange={setRange}
            onRefresh={() => void loadHistory()}
          />
        </div>
        <aside className="portfolio-side-panel" aria-label="Order entry">
          <OrderEntryPanel onPlaced={() => void loadCore(true)} />
        </aside>
      </div>
    </section>
  );
}
