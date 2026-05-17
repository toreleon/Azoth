import type { PortfolioSnapshot } from "../../../shared/ipc.js";
import {
  formatPercent,
  formatVndCompact,
  formatSignedVnd,
  pnlClass,
} from "../../lib/format.js";

export function AccountOverview({
  snapshot,
}: {
  snapshot: PortfolioSnapshot | null;
}) {
  const totals = snapshot?.totals;
  const cost = totals?.cost_basis_vnd ?? 0;
  const unrealized = totals?.unrealized_pnl_vnd ?? null;
  const unrealizedPct =
    unrealized != null && cost > 0 ? (unrealized / cost) * 100 : null;

  return (
    <div className="portfolio-stats">
      <Stat label="Total equity" value={formatVndCompact(snapshot?.total_equity_vnd)} />
      <Stat label="Cash" value={formatVndCompact(snapshot?.cash_vnd)} />
      <Stat
        label="Market value"
        value={formatVndCompact(totals?.market_value_vnd ?? null)}
      />
      <Stat
        label="Unrealized P&L"
        value={formatSignedVnd(unrealized)}
        sub={unrealizedPct != null ? formatPercent(unrealizedPct) : undefined}
        className={pnlClass(unrealized)}
      />
      <Stat
        label="Margin used"
        value={formatVndCompact(snapshot?.margin_used_vnd ?? 0)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={["portfolio-stat", className].filter(Boolean).join(" ")}>
      <div className="portfolio-stat-label">{label}</div>
      <div className="portfolio-stat-value">{value}</div>
      {sub ? <div className="portfolio-stat-sub">{sub}</div> : null}
    </div>
  );
}
