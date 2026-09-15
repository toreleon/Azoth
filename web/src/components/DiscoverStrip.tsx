import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { MoverRow } from "../lib/types";
import { fmtPriceVnd } from "../lib/format";
import Sparkline from "./Sparkline";
import ChangeBadge from "./ChangeBadge";
import "./DiscoverStrip.css";

const COUNT = 8;

/** Merge active + gainers, dedupe by ticker (active first), cap at COUNT. */
function blend(active: MoverRow[], gainers: MoverRow[]): MoverRow[] {
  const seen = new Set<string>();
  const out: MoverRow[] = [];
  for (const row of [...active, ...gainers]) {
    if (seen.has(row.ticker)) continue;
    seen.add(row.ticker);
    out.push(row);
    if (out.length >= COUNT) break;
  }
  return out;
}

export default function DiscoverStrip() {
  const [rows, setRows] = useState<MoverRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setRows(null);
    setError(false);
    Promise.all([
      api.movers("active", "vn30", ctrl.signal),
      api.movers("gainers", "vn30", ctrl.signal),
    ])
      .then(([active, gainers]) => setRows(blend(active.rows, gainers.rows)))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(true);
      });
    return () => ctrl.abort();
  }, []);

  if (error) {
    return <p className="discover__msg text-muted">Couldn't load suggestions.</p>;
  }

  return (
    <div className="discover" role="list">
      {rows == null
        ? Array.from({ length: COUNT }).map((_, i) => (
            <div className="gf-card discover__card discover__card--skel" role="listitem" key={i}>
              <span className="gf-skeleton discover__skel-ticker" />
              <span className="gf-skeleton discover__skel-name" />
              <span className="gf-skeleton discover__skel-spark" />
              <span className="gf-skeleton discover__skel-price" />
            </div>
          ))
        : rows.map((row) => (
            <Link
              key={row.ticker}
              to={`/quote/${row.ticker}`}
              className="gf-card discover__card"
              role="listitem"
            >
              <div className="discover__head">
                <span className="discover__ticker">{row.ticker}</span>
                {row.name && <span className="discover__name">{row.name}</span>}
              </div>
              <span className="discover__spark">
                <Sparkline data={row.spark} width={148} height={36} fill />
              </span>
              <div className="discover__foot">
                <span className="mono discover__price">{fmtPriceVnd(row.last)}</span>
                <ChangeBadge pct={row.change_pct} size="sm" dot={false} />
              </div>
            </Link>
          ))}
    </div>
  );
}
