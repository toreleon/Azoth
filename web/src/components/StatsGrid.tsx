import "./StatsGrid.css";
import { fmtPriceVnd, fmtBigNum, fmtBigVnd, fmtNum, fmtPctPlain } from "../lib/format";
import type { QuoteResponse } from "../lib/types";

interface StatsGridProps {
  quote: QuoteResponse;
}

type Cell = {
  label: string;
  value: string;
  tone?: "ceiling" | "floor";
};

export default function StatsGrid({ quote }: StatsGridProps) {
  const s = quote.stats;

  // CafeF's ratios lag for some issuers (banks especially), so name the year
  // these four came from rather than implying they're current.
  const fy = s.ratios_year ? ` ’${String(s.ratios_year).slice(-2)}` : "";

  const cells: Cell[] = [
    { label: "Open", value: fmtPriceVnd(s.open) },
    { label: "High", value: fmtPriceVnd(s.high) },
    { label: "Low", value: fmtPriceVnd(s.low) },
    { label: "Prev close", value: fmtPriceVnd(quote.ref) },
    { label: "Ceiling", value: fmtPriceVnd(quote.ceiling), tone: "ceiling" },
    { label: "Floor", value: fmtPriceVnd(quote.floor), tone: "floor" },
    { label: "Volume", value: fmtBigNum(s.volume) },
    { label: "Avg volume", value: fmtBigNum(s.avg_vol) },
    { label: "Market cap", value: fmtBigVnd(s.market_cap_vnd) },
    { label: "P/E ratio", value: fmtNum(s.pe) },
    { label: "P/B ratio", value: fmtNum(s.pb) },
    { label: "P/S ratio", value: fmtNum(s.ps) },
    { label: `EPS${fy}`, value: fmtPriceVnd(s.eps_thousand_vnd) },
    { label: `BVPS${fy}`, value: fmtPriceVnd(s.bvps_thousand_vnd) },
    { label: `ROE${fy}`, value: fmtPctPlain(s.roe_pct) },
    { label: `ROA${fy}`, value: fmtPctPlain(s.roa_pct) },
    { label: "Div yield", value: fmtPctPlain(s.dividend_yield_pct) },
    { label: "Foreign own", value: fmtPctPlain(s.foreign_ownership_pct) },
    { label: "Shares out", value: fmtBigNum(s.shares_outstanding) },
    { label: "52-wk high", value: fmtPriceVnd(s.week52_high) },
    { label: "52-wk low", value: fmtPriceVnd(s.week52_low) },
  ];

  return (
    <section className="gf-card statsgrid">
      <h3 className="statsgrid__heading">Stats</h3>
      <div className="statsgrid__grid">
        {cells.map((c) => (
          <div className="statsgrid__row" key={c.label}>
            <span className="statsgrid__label">{c.label}</span>
            <span
              className={
                "statsgrid__value mono" +
                (c.tone === "ceiling"
                  ? " statsgrid__value--ceiling"
                  : c.tone === "floor"
                    ? " statsgrid__value--floor"
                    : "")
              }
            >
              {c.value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
