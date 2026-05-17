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
    <section className="portfolio-card ds-card">
      <div className="portfolio-card-header">
        <div>
          <span className="ds-kicker">Ledger</span>
          <h2 className="ds-title">Trade history</h2>
        </div>
        <div className="portfolio-history-controls">
          <input
            className="ds-input"
            type="date"
            value={range.from}
            onChange={(e) => onRangeChange({ ...range, from: e.target.value })}
            aria-label="History from date"
          />
          <span aria-hidden="true">to</span>
          <input
            className="ds-input"
            type="date"
            value={range.to}
            onChange={(e) => onRangeChange({ ...range, to: e.target.value })}
            aria-label="History to date"
          />
          <button type="button" className="ds-button" onClick={onRefresh}>
            Reload
          </button>
        </div>
      </div>

      {error ? <div className="portfolio-error">{error}</div> : null}

      {history && history.supported === false ? (
        <div className="portfolio-empty">{history.reason}</div>
      ) : (
        <>
          <div className="portfolio-tabs">
            <TabButton current={tab} value="fills" onChange={setTab} label="Fills" />
            <TabButton current={tab} value="orders" onChange={setTab} label="Orders" />
            <TabButton
              current={tab}
              value="transactions"
              onChange={setTab}
              label="Cash"
            />
            <TabButton current={tab} value="rights" onChange={setTab} label="Rights" />
          </div>
          {tab === "fills" && <FillsTable rows={history?.fills ?? []} />}
          {tab === "orders" && <OrdersTable rows={history?.orders ?? []} />}
          {tab === "transactions" && (
            <TransactionsTable rows={history?.transactions ?? []} />
          )}
          {tab === "rights" && <RightsTable rows={history?.rights ?? []} />}
        </>
      )}
    </section>
  );
}

function TabButton({
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
      className={`portfolio-tab ${current === value ? "is-active" : ""}`}
      onClick={() => onChange(value)}
    >
      {label}
    </button>
  );
}

function FillsTable({ rows }: { rows: BrokerHistoryFillUi[] }) {
  if (rows.length === 0) return <div className="portfolio-empty">No fills in range.</div>;
  return (
    <div className="portfolio-table-wrap">
      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticker</th>
            <th>Side</th>
            <th className="num">Qty</th>
            <th className="num">Price</th>
            <th className="num">Gross</th>
            <th className="num">Fees</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={`${f.orderId}-${i}`}>
              <td className="portfolio-mono">{f.tradeDate ?? "—"}</td>
              <td>
                <strong>{f.ticker}</strong>
              </td>
              <td>
                <span className={`portfolio-side portfolio-side-${f.side.toLowerCase()}`}>
                  {f.side}
                </span>
              </td>
              <td className="num">{formatQuantity(f.quantity)}</td>
              <td className="num">{formatThousandVnd(f.priceThousandVnd)}</td>
              <td className="num">{formatVndCompact(f.grossValueVnd)}</td>
              <td className="num">
                {formatVndCompact((f.feeVnd ?? 0) + (f.taxVnd ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTable({ rows }: { rows: BrokerHistoryOrderUi[] }) {
  if (rows.length === 0) return <div className="portfolio-empty">No orders in range.</div>;
  return (
    <div className="portfolio-table-wrap">
      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Ticker</th>
            <th>Side</th>
            <th>Type</th>
            <th>Status</th>
            <th className="num">Qty</th>
            <th className="num">Limit</th>
            <th className="num">Filled</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td className="portfolio-mono">{o.orderDate ?? "—"}</td>
              <td>
                <strong>{o.ticker}</strong>
              </td>
              <td>
                <span className={`portfolio-side portfolio-side-${o.side.toLowerCase()}`}>
                  {o.side}
                </span>
              </td>
              <td>{o.type}</td>
              <td>{o.status}</td>
              <td className="num">{formatQuantity(o.quantity)}</td>
              <td className="num">{formatThousandVnd(o.limitPriceThousandVnd)}</td>
              <td className="num">
                {formatQuantity(o.filledQty)}
                {o.filledPriceThousandVnd != null ? (
                  <span className="portfolio-sub-meta">
                    @ {formatThousandVnd(o.filledPriceThousandVnd)}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTable({ rows }: { rows: BrokerCashTransactionUi[] }) {
  if (rows.length === 0)
    return <div className="portfolio-empty">No cash transactions in range.</div>;
  return (
    <div className="portfolio-table-wrap">
      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Description</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="portfolio-mono">{t.transactionDate ?? "—"}</td>
              <td>{t.type ?? t.flow ?? "—"}</td>
              <td>{t.title ?? t.description ?? "—"}</td>
              <td className={`num ${pnlClass(t.amountVnd)}`}>
                {formatSignedVnd(t.amountVnd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RightsTable({ rows }: { rows: BrokerRightEventUi[] }) {
  if (rows.length === 0)
    return <div className="portfolio-empty">No rights events in range.</div>;
  return (
    <div className="portfolio-table-wrap">
      <table className="portfolio-table">
        <thead>
          <tr>
            <th>Report date</th>
            <th>Ticker</th>
            <th>Type</th>
            <th>Status</th>
            <th>Ratio</th>
            <th className="num">Owned</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="portfolio-mono">{r.reportDate ?? "—"}</td>
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
    </div>
  );
}
