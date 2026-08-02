import { Link } from "react-router-dom";
import type { RelatedStock } from "../lib/types";
import { fmtPriceVnd } from "../lib/format";
import Sparkline from "./Sparkline";
import ChangeBadge from "./ChangeBadge";
import "./RelatedStocks.css";

interface Props {
  related: RelatedStock[];
}

export default function RelatedStocks({ related }: Props) {
  if (!related || related.length === 0) return null;

  return (
    <section className="related">
      <h2 className="gf-section-title">Related stocks</h2>
      <div className="related__row">
        {related.map((r) => (
          <Link key={r.ticker} to={`/quote/${r.ticker}`} className="gf-card related__card">
            <span className="related__ticker">{r.ticker}</span>
            {r.name && <span className="related__name">{r.name}</span>}
            <Sparkline data={r.spark} width={144} height={30} fill className="related__spark" />
            <div className="related__foot">
              <span className="mono related__last">{fmtPriceVnd(r.last, { suffix: false })}</span>
              <ChangeBadge pct={r.change_pct} size="sm" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
