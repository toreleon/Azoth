import type { BrokerOrderUi } from "../../../shared/ipc.js";
import { formatQuantity, formatThousandVnd } from "../../lib/format.js";

function formatTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleString();
}

export function OpenOrdersTable({
  orders,
  onCancel,
}: {
  orders: BrokerOrderUi[];
  onCancel: (id: string) => void;
}) {
  return (
    <section className="portfolio-card ds-card">
      <div className="portfolio-card-header">
        <div>
          <span className="ds-kicker">Working</span>
          <h2 className="ds-title">Open orders</h2>
        </div>
        <span className="portfolio-card-meta">{orders.length}</span>
      </div>
      {orders.length === 0 ? (
        <div className="portfolio-empty">No open orders.</div>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Ticker</th>
                <th>Side</th>
                <th>Type</th>
                <th className="num">Qty</th>
                <th className="num">Limit</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="portfolio-mono">{formatTime(o.createdAt)}</td>
                  <td>
                    <strong>{o.ticker}</strong>
                  </td>
                  <td>
                    <span className={`portfolio-side portfolio-side-${o.side.toLowerCase()}`}>
                      {o.side}
                    </span>
                  </td>
                  <td>{o.type}</td>
                  <td className="num">{formatQuantity(o.quantity)}</td>
                  <td className="num">{formatThousandVnd(o.limitPrice)}</td>
                  <td className="portfolio-row-action">
                    <button
                      type="button"
                      className="ds-button danger portfolio-compact-action"
                      onClick={() => onCancel(o.id)}
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
