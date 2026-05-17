import { useState } from "react";
import type {
  BrokerCashTransactionUi,
  BrokerHistoryFillUi,
  BrokerHistoryOrderUi,
  BrokerRightEventUi,
  PortfolioHistoryRes,
} from "../../../shared/ipc.js";
import {
  formatQuantity,
  formatSignedVnd,
  formatThousandVnd,
  formatVndCompact,
  pnlClass,
} from "../../lib/format.js";

type Tab = "fills" | "orders" | "transactions" | "rights";

export function TradeHistoryTable({
  history,
  error,
  range,
  onRangeChange,
  onRefresh,
}: {
  history: PortfolioHistoryRes | null;
  error: string | null;
  range: { from: string; to: string };
  onRangeChange: (r: { from: string; to: string }) => void;
  onRefresh: () => void;
}) {
  const [tab, setTab] = useState<Tab>("fills");

  return (
    <section className="tbl-card">
      <div className="tbl-toolbar">
        <div className="tbl-tabs" role="tablist">
          <TabBtn current={tab} value="fills" onChange={setTab} label="Fills" />
          <TabBtn current={tab} value="orders" onChange={setTab} label="Orders" />
          <TabBtn current={tab} value="transactions" onChange={setTab} label="Cash" />
          <TabBtn current={tab} value="rights" onChange={setTab} label="Rights" />
        </div>
        <div className="portfolio-history-controls">
          <input
            type="date"
            value={range.from}
            onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
            aria-label="History from date"
          />
          <span aria-hidden="true">to</span>
          <input
            type="date"
            value={range.to}
            onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
            aria-label="History to date"
          />
          <button type="button" className="btn btn-secondary" onClick={onRefresh}>
            Reload
          </button>
        </div>
      </div>

      {error ? <div className="portfolio-error" style={{ margin: "var(--space-4) var(--space-5)" }}>{error}</div> : null}

      {history && history.supported === false ? (
        <div className="market-symbols-empty">{history.reason}</div>
      ) : (
        <>
          {tab === "fills" && <FillsTable rows={history?.fills ?? []} />}
          {tab === "orders" && <OrdersTable rows={history?.orders ?? []} />}
          {tab === "transactions" && <TransactionsTable rows={history?.transactions ?? []} />}
          {tab === "rights" && <RightsTable rows={history?.rights ?? []} />}
        </>
      )}
    </section>
  );
}

function TabBtn({
  current,
  value,
  onChange,
  label,
}: {
  current: Tab;
  value: Tab;
  onChange: (t: Tab) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={`tbl-tab ${current === value ? "is-active" : ""}`}
      onClick={() => onChange(value)}
      role="tab"
      aria-selected={current === value}
    >
      {label}
    </button>
  );
}

function SideBadge({ side }: { side: "BUY" | "SELL" }) {
  return <span className={`order-card-side side ${side.toLowerCase()}`}>{side}</span>;
}

function FillsTable({ rows }: { rows: BrokerHistoryFillUi[] }) {
  if (rows.length === 0) return <div className="market-symbols-empty">No fills in range.</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Date</th>
          <th>Ticker</th>
          <th>Side</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Gross</th>
          <th>Fees</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f, i) => (
          <tr key={`${f.orderId}-${i}`}>
            <td className="mono">{f.tradeDate ?? "—"}</td>
            <td>
              <strong>{f.ticker}</strong>
            </td>
            <td>
              <SideBadge side={f.side} />
            </td>
            <td className="num">{formatQuantity(f.quantity)}</td>
            <td className="num">{formatThousandVnd(f.priceThousandVnd)}</td>
            <td className="num">{formatVndCompact(f.grossValueVnd)}</td>
            <td className="num">{formatVndCompact((f.feeVnd ?? 0) + (f.taxVnd ?? 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrdersTable({ rows }: { rows: BrokerHistoryOrderUi[] }) {
  if (rows.length === 0) return <div className="market-symbols-empty">No orders in range.</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Date</th>
          <th>Ticker</th>
          <th>Side</th>
          <th>Type</th>
          <th>Status</th>
          <th>Qty</th>
          <th>Limit</th>
          <th>Filled</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => (
          <tr key={o.id}>
            <td className="mono">{o.orderDate ?? "—"}</td>
            <td>
              <strong>{o.ticker}</strong>
            </td>
            <td>
              <SideBadge side={o.side} />
            </td>
            <td>{o.type}</td>
            <td>{o.status}</td>
            <td className="num">{formatQuantity(o.quantity)}</td>
            <td className="num">{formatThousandVnd(o.limitPriceThousandVnd)}</td>
            <td className="num">
              {formatQuantity(o.filledQty)}
              {o.filledPriceThousandVnd != null ? (
                <div style={{ color: "var(--muted)", fontSize: "var(--text-xs)" }}>
                  @ {formatThousandVnd(o.filledPriceThousandVnd)}
                </div>
              ) : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TransactionsTable({ rows }: { rows: BrokerCashTransactionUi[] }) {
  if (rows.length === 0) return <div className="market-symbols-empty">No cash transactions in range.</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Date</th>
          <th>Type</th>
          <th>Description</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => (
          <tr key={t.id}>
            <td className="mono">{t.transactionDate ?? "—"}</td>
            <td>{t.type ?? t.flow ?? "—"}</td>
            <td>{t.title ?? t.description ?? "—"}</td>
            <td className={`num ${pnlClass(t.amountVnd)}`}>{formatSignedVnd(t.amountVnd)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RightsTable({ rows }: { rows: BrokerRightEventUi[] }) {
  if (rows.length === 0) return <div className="market-symbols-empty">No rights events in range.</div>;
  return (
    <table className="tbl">
      <thead>
        <tr>
          <th>Report date</th>
          <th>Ticker</th>
          <th>Type</th>
          <th>Status</th>
          <th>Ratio</th>
          <th>Owned</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="mono">{r.reportDate ?? "—"}</td>
            <td>
              <strong>{r.ticker}</strong>
            </td>
            <td>{r.type ?? "—"}</td>
            <td>{r.status ?? "—"}</td>
            <td>{r.ratio ?? "—"}</td>
            <td className="num">{formatQuantity(r.ownedShares)}</td>
            <td className="num">{formatVndCompact(r.amountVnd ?? null)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
