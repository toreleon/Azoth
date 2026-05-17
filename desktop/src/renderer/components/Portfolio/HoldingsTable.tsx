import type { PortfolioPosition } from "../../../shared/ipc.js";
import {
  formatPercent,
  formatQuantity,
  formatSignedVnd,
  formatThousandVnd,
  formatVndCompact,
  pnlClass,
} from "../../lib/format.js";

export function HoldingsTable({
  positions,
  onOpenTicker,
}: {
  positions: PortfolioPosition[];
  onOpenTicker: (symbol: string) => void;
}) {
  return (
    <section className="portfolio-card ds-card">
      <div className="portfolio-card-header">
        <div>
          <span className="ds-kicker">Exposure</span>
          <h2 className="ds-title">Holdings</h2>
        </div>
        <span className="portfolio-card-meta">{positions.length} positions</span>
      </div>
      {positions.length === 0 ? (
        <div className="portfolio-empty">No open positions.</div>
      ) : (
        <div className="portfolio-table-wrap">
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th className="num">Qty</th>
                <th className="num">Avg cost</th>
                <th className="num">Last</th>
                <th className="num">Market value</th>
                <th className="num">Unrealized P&L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={`${p.ticker}-${p.sub_account_id ?? ""}`}>
                  <td>
                    <button
                      type="button"
                      className="portfolio-ticker-button"
                      onClick={() => onOpenTicker(p.ticker)}
                    >
                      <strong>{p.ticker}</strong>
                      {p.sub_account_id ? (
                        <span className="portfolio-sub-tag">{p.sub_account_id}</span>
                      ) : null}
                    </button>
                  </td>
                  <td className="num">{formatQuantity(p.quantity)}</td>
                  <td className="num">{formatThousandVnd(p.avg_cost_thousand_vnd)}</td>
                  <td className="num">{formatThousandVnd(p.last_close_thousand_vnd)}</td>
                  <td className="num">{formatVndCompact(p.market_value_vnd)}</td>
                  <td className={`num ${pnlClass(p.unrealized_pnl_vnd)}`}>
                    <div>{formatSignedVnd(p.unrealized_pnl_vnd)}</div>
                    <div className="portfolio-sub-meta">
                      {formatPercent(p.unrealized_pnl_pct)}
                    </div>
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
