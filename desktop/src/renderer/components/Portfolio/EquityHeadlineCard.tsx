import type { PortfolioSnapshot } from "../../../shared/ipc.js";
import { formatPercent, formatVndCompact } from "../../lib/format.js";

export function EquityHeadlineCard({
  snapshot,
  todayRealizedVnd,
}: {
  snapshot: PortfolioSnapshot | null;
  todayRealizedVnd: number;
}) {
  const totals = snapshot?.totals;
  const equity = snapshot?.total_equity_vnd ?? 0;
  const cash = snapshot?.cash_vnd ?? 0;
  const marketValue = totals?.market_value_vnd ?? 0;
  const cost = totals?.cost_basis_vnd ?? 0;
  const unrealized = totals?.unrealized_pnl_vnd ?? 0;
  const unrealizedPct = cost > 0 ? (unrealized / cost) * 100 : null;
  const investedPct = equity > 0 ? (marketValue / equity) * 100 : null;
  const today = todayRealizedVnd;
  const todayPct = equity > 0 ? (today / equity) * 100 : null;
  const tone = today > 0 ? "up" : today < 0 ? "down" : "flat";

  return (
    <section className="card equity-card">
      <div className="equity-head">
        <div>
          <p className="kicker">Net liquidation</p>
          <div className="equity-now">
            {formatVndCompact(equity).replace(" ₫", "")}
            <span className="unit"> ₫</span>
          </div>
          <div className="equity-delta">
            <span className={`num ${tone}`} style={{ fontWeight: 600 }}>
              {today > 0 ? "+" : ""}
              {formatVndCompact(today)}
            </span>
            <span className={`tone-pill ${tone}`}>{todayPct != null ? formatPercent(todayPct) : "—"} today</span>
            <span style={{ color: "var(--meta)", fontSize: "var(--text-sm)" }}>
              · {unrealized >= 0 ? "+" : ""}
              {formatVndCompact(unrealized)} unrealized
            </span>
          </div>
        </div>
        <div className="equity-meta">
          <div>
            <span className="k">Invested</span>
            <span className="v">{formatVndCompact(marketValue)}</span>
            <span className="sub">{investedPct != null ? formatPercent(investedPct) : "—"} of equity</span>
          </div>
          <div>
            <span className="k">Cash</span>
            <span className="v">{formatVndCompact(cash)}</span>
            <span className="sub">buying power</span>
          </div>
          <div>
            <span className="k">Unrealized P&amp;L</span>
            <span className={`v ${unrealized > 0 ? "up" : unrealized < 0 ? "down" : ""}`}>
              {unrealized >= 0 ? "+" : ""}
              {formatVndCompact(unrealized)}
            </span>
            <span className="sub">{unrealizedPct != null ? formatPercent(unrealizedPct) : "—"} on cost</span>
          </div>
          <div>
            <span className="k">Realized today</span>
            <span className={`v ${tone}`}>
              {today >= 0 ? "+" : ""}
              {formatVndCompact(today)}
            </span>
            <span className="sub">from filled trades</span>
          </div>
        </div>
      </div>

      <EquityCurvePlaceholder equity={equity} />
    </section>
  );
}

function EquityCurvePlaceholder({ equity }: { equity: number }) {
  // Synthetic curve: gently rising sine until equity (TODO: real portfolio:equityCurve IPC)
  const points = 64;
  const data = Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const drift = 0.92 + t * 0.08;
    const wobble = Math.sin(i / 4) * 0.012 + Math.sin(i / 11) * 0.018;
    return drift + wobble;
  });
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.0001, max - min);
  const W = 1280;
  const H = 220;
  const pad = 16;
  const xs = data.map((_, i) => pad + (i / (points - 1)) * (W - pad * 2));
  const ys = data.map((v) => H - pad - ((v - min) / range) * (H - pad * 2));
  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(0)},${ys[i]!.toFixed(0)}`).join(" ");
  const areaPath = `${linePath} L${xs.at(-1)!.toFixed(0)},${H} L${xs[0]!.toFixed(0)},${H} Z`;

  return (
    <div style={{ position: "relative" }}>
      <div className="row-between" style={{ marginBottom: "var(--space-3)" }}>
        <div className="kicker">Equity curve</div>
        <div className="seg" role="group">
          {(["1W", "1M", "3M", "6M", "YTD", "1Y", "All"] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              className={tf === "3M" ? "is-active" : ""}
              disabled
              title="Coming soon"
            >
              {tf}
            </button>
          ))}
        </div>
      </div>
      <svg className="equity-curve" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Equity curve preview">
        <g className="ec-grid">
          {[40, 100, 160, 200].map((y) => (
            <line key={y} x1="0" x2={W} y1={y} y2={y} />
          ))}
        </g>
        <line className="ec-baseline" x1="0" y1={H - pad} x2={W} y2={H - pad} />
        <path className="ec-area" d={areaPath} />
        <path className="ec-line" d={linePath} />
        <circle cx={xs.at(-1)} cy={ys.at(-1)} r="4" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
        <g className="ec-axis">
          <text x={W - 8} y="14" textAnchor="end">
            {formatVndCompact(equity * (max / 1))}
          </text>
          <text x={W - 8} y={H - 4} textAnchor="end">
            {formatVndCompact(equity * (min / 1))}
          </text>
        </g>
      </svg>
    </div>
  );
}
