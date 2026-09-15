import { dirOf } from "../lib/format";
import type { PortfolioTotals } from "../lib/types";
import ChangeBadge from "./ChangeBadge";
import "./PortfolioSummary.css";

// Portfolio totals are plain-VND aggregates (already scaled), so they are
// formatted directly — never multiplied by the board price scale.
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
  totals: PortfolioTotals;
}

export default function PortfolioSummary({ totals }: Props) {
  const gainDir = dirOf(totals.gainVnd);
  const dayDir = dirOf(totals.dayChangeVnd);

  return (
    <section className="gf-card psum">
      <div className="psum__primary">
        <div className="psum__label text-secondary">Total value</div>
        <div className="psum__value mono">{fmtVnd(totals.marketValueVnd)}</div>
        <div className="psum__primary-change">
          <ChangeBadge pct={totals.gainPct} size="lg" />
          <span className={`mono psum__primary-abs ${gainDir}`}>{fmtSignedVnd(totals.gainVnd)}</span>
          <span className="text-muted psum__primary-note">all time</span>
        </div>
      </div>

      <div className="psum__grid">
        <div className="psum__tile">
          <div className="psum__tile-label text-secondary">Today</div>
          <div className={`psum__tile-value mono ${dayDir}`}>{fmtSignedVnd(totals.dayChangeVnd)}</div>
          <ChangeBadge pct={totals.dayChangePct} size="sm" />
        </div>

        <div className="psum__tile">
          <div className="psum__tile-label text-secondary">Total gain/loss</div>
          <div className={`psum__tile-value mono ${gainDir}`}>{fmtSignedVnd(totals.gainVnd)}</div>
          <ChangeBadge pct={totals.gainPct} size="sm" />
        </div>

        <div className="psum__tile">
          <div className="psum__tile-label text-secondary">Cost basis</div>
          <div className="psum__tile-value mono">{fmtVnd(totals.costBasisVnd)}</div>
        </div>
      </div>
    </section>
  );
}
