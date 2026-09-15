import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { HoldingRow } from "../lib/types";
import { dirOf, fmtNum, fmtPct, fmtPriceVnd } from "../lib/format";
import ChangeBadge from "./ChangeBadge";
import Sparkline from "./Sparkline";
import "./HoldingsTable.css";

// Plain-VND aggregates (market value / cost / gain) format directly; only the
// board-unit `last` goes through fmtPriceVnd (× 1000).
function fmtVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v).toLocaleString("en-US")} ₫`;
}

function fmtSignedVnd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.round(Math.abs(v)).toLocaleString("en-US")} ₫`;
}

interface Props {
  holdings: HoldingRow[];
  onChanged: () => void;
}

export default function HoldingsTable({ holdings, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function edit(h: HoldingRow) {
    const qtyStr = window.prompt(`Quantity for ${h.ticker}`, String(h.quantity));
    if (qtyStr == null) return;
    const costStr = window.prompt(`Avg cost per share (₫) for ${h.ticker}`, String(h.avgCostVnd));
    if (costStr == null) return;

    const quantity = Number(qtyStr.replace(/[^0-9.]/g, ""));
    const avgCostVnd = Number(costStr.replace(/[^0-9.]/g, ""));
    const patch: { quantity?: number; avgCostVnd?: number } = {};
    if (Number.isFinite(quantity) && quantity > 0 && quantity !== h.quantity) patch.quantity = quantity;
    if (Number.isFinite(avgCostVnd) && avgCostVnd > 0 && avgCostVnd !== h.avgCostVnd) {
      patch.avgCostVnd = avgCostVnd;
    }
    if (Object.keys(patch).length === 0) return;

    setBusy(true);
    setError(null);
    try {
      await api.portfolios.updateHolding(h.id, patch);
      onChanged();
    } catch (e) {
      setError((e as Error)?.message || "Couldn't update holding.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(h: HoldingRow) {
    if (!window.confirm(`Remove ${h.ticker} from this portfolio?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api.portfolios.removeHolding(h.id);
      onChanged();
    } catch (e) {
      setError((e as Error)?.message || "Couldn't remove holding.");
    } finally {
      setBusy(false);
    }
  }

  if (holdings.length === 0) {
    return (
      <div className="gf-card holdings holdings--empty">
        <p className="holdings__empty-title">No holdings yet</p>
        <p className="text-secondary">Add one below to start tracking this portfolio.</p>
      </div>
    );
  }

  return (
    <section className="gf-card holdings">
      {error && <p className="holdings__err down">{error}</p>}
      <div className="holdings__scroll">
        <table className="holdings__table mono">
          <thead>
            <tr>
              <th className="holdings__th holdings__th--left">Symbol</th>
              <th className="holdings__th holdings__th--num">Qty</th>
              <th className="holdings__th holdings__th--num">Avg cost</th>
              <th className="holdings__th holdings__th--num">Price</th>
              <th className="holdings__th holdings__th--num">Day</th>
              <th className="holdings__th holdings__th--trend">Trend</th>
              <th className="holdings__th holdings__th--num">Mkt value</th>
              <th className="holdings__th holdings__th--num">Gain</th>
              <th className="holdings__th holdings__th--num">Weight</th>
              <th className="holdings__th holdings__th--actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const gd = dirOf(h.gainVnd);
              return (
                <tr key={h.id} className="holdings__row">
                  <td className="holdings__td holdings__td--left">
                    <Link to={`/quote/${h.ticker}`} className="holdings__sym">
                      <span className="holdings__ticker">{h.ticker}</span>
                      {h.name && <span className="holdings__name">{h.name}</span>}
                    </Link>
                  </td>
                  <td className="holdings__td holdings__td--num">
                    {h.quantity.toLocaleString("en-US")}
                  </td>
                  <td className="holdings__td holdings__td--num">{fmtVnd(h.avgCostVnd)}</td>
                  <td className="holdings__td holdings__td--num">{fmtPriceVnd(h.last)}</td>
                  <td className="holdings__td holdings__td--num">
                    <ChangeBadge pct={h.change_pct} size="sm" dot={false} />
                  </td>
                  <td className="holdings__td holdings__td--trend">
                    <Sparkline data={h.spark} width={72} height={26} fill />
                  </td>
                  <td className="holdings__td holdings__td--num">{fmtVnd(h.marketValueVnd)}</td>
                  <td className="holdings__td holdings__td--num">
                    <span className={`holdings__gain ${gd}`}>{fmtSignedVnd(h.gainVnd)}</span>
                    <span className="holdings__gain-pct text-muted">{fmtPct(h.gainPct)}</span>
                  </td>
                  <td className="holdings__td holdings__td--num">
                    {h.weightPct == null ? "—" : `${fmtNum(h.weightPct, 1)}%`}
                  </td>
                  <td className="holdings__td holdings__td--actions">
                    <div className="holdings__actions">
                      <button
                        type="button"
                        className="holdings__act"
                        title="Edit quantity / cost"
                        aria-label={`Edit ${h.ticker}`}
                        disabled={busy}
                        onClick={() => edit(h)}
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        className="holdings__act"
                        title="Remove holding"
                        aria-label={`Remove ${h.ticker}`}
                        disabled={busy}
                        onClick={() => remove(h)}
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
