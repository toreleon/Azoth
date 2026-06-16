import type { BrokerOrderUi } from "../../../shared/ipc.js";
import { formatQuantity, formatThousandVnd, formatVndCompact } from "../../lib/format.js";

function formatTime(unixSec: number): string {
  return new Date(unixSec * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function OpenOrdersStrip({
  orders,
  onCancel,
}: {
  orders: BrokerOrderUi[];
  onCancel: (id: string) => void;
}) {
  if (orders.length === 0) return null;
  return (
    <section>
      <div className="row-between" style={{ marginBottom: "var(--space-3)" }}>
        <h2 className="kicker" style={{ margin: 0 }}>
          Open orders · {orders.length}
        </h2>
      </div>
      <div className="order-strip">
        {orders.map((order) => {
          const side = order.side.toLowerCase();
          const notional =
            (order.limitPrice ?? 0) * order.quantity * 1000;
          return (
            <div key={order.id} className="order-card">
              <div className="head">
                <span className="sym">{order.ticker}</span>
                <span className={`side ${side}`}>
                  {order.side} · {order.type}
                </span>
              </div>
              <div className="body">
                <div>
                  <span className="k">Quantity</span>
                  <span className="v">{formatQuantity(order.quantity)}</span>
                </div>
                <div>
                  <span className="k">Limit</span>
                  <span className="v">{formatThousandVnd(order.limitPrice)} K</span>
                </div>
                <div>
                  <span className="k">Filled</span>
                  <span className="v">
                    {formatQuantity(order.filledQty ?? 0)} / {formatQuantity(order.quantity)}
                  </span>
                </div>
                <div>
                  <span className="k">Notional</span>
                  <span className="v">{formatVndCompact(notional)}</span>
                </div>
              </div>
              <div className="foot">
                <span>Placed {formatTime(order.createdAt)}</span>
                <button type="button" className="cancel-btn" onClick={() => onCancel(order.id)}>
                  Cancel
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
