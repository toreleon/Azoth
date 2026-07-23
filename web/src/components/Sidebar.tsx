import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { fmtPriceVnd } from "../lib/format";
import type { WatchlistResponse } from "../lib/types";
import Sparkline from "./Sparkline";
import ChangeBadge from "./ChangeBadge";
import "./Sidebar.css";

export default function Sidebar() {
  const [data, setData] = useState<WatchlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    api
      .watchlist(ctrl.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar__header">
        <h2 className="sidebar__title">Lists</h2>
        <button type="button" className="gf-icon-btn" aria-label="List options">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="5" r="1.6" fill="currentColor" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" />
            <circle cx="12" cy="19" r="1.6" fill="currentColor" />
          </svg>
        </button>
      </div>

      <button type="button" className="sidebar__create">
        <span className="sidebar__create-plus" aria-hidden>
          +
        </span>
        Create portfolio
      </button>

      <div className="sidebar__section-label">WATCHLIST</div>

      {loading && (
        <div className="sidebar__rows">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="gf-skeleton sidebar__skeleton" />
          ))}
        </div>
      )}

      {!loading && error && <div className="sidebar__error text-muted">Couldn't load watchlist</div>}

      {!loading && !error && data && (
        <div className="sidebar__rows">
          {data.rows.map((row) => (
            <Link key={row.ticker} to={`/quote/${row.ticker}`} className="sidebar__row">
              <div className="sidebar__row-id">
                <span className="sidebar__ticker">{row.ticker}</span>
                {row.name && <span className="sidebar__name text-secondary">{row.name}</span>}
              </div>
              <Sparkline data={row.spark} width={54} height={22} fill className="sidebar__spark" />
              <div className="sidebar__row-quote">
                <span className="sidebar__last mono">{fmtPriceVnd(row.last, { suffix: false })}</span>
                <ChangeBadge pct={row.change_pct} size="sm" dot={false} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </aside>
  );
}
