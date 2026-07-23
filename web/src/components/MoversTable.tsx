import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { MoverRow } from "../lib/types";
import { fmtPriceVnd } from "../lib/format";
import Sparkline from "./Sparkline";
import ChangeBadge from "./ChangeBadge";
import "./MoversTable.css";

type Tab = "gainers" | "losers" | "active";

const TABS: { key: Tab; label: string }[] = [
  { key: "gainers", label: "Gainers" },
  { key: "losers", label: "Losers" },
  { key: "active", label: "Active" },
];

export default function MoversTable() {
  const [activeTab, setActiveTab] = useState<Tab>("gainers");
  const [rows, setRows] = useState<MoverRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setRows(null);
    setError(false);
    api
      .movers(activeTab, "vn30", ctrl.signal)
      .then((res) => setRows(res.rows))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(true);
      });
    return () => ctrl.abort();
  }, [activeTab]);

  return (
    <section className="gf-card movers">
      <header className="movers__head">
        <h2 className="gf-section-title movers__title">VN30 movers</h2>
        <div className="movers__tabs" role="tablist" aria-label="Mover category">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={activeTab === t.key}
              className={`gf-pill movers__pill${activeTab === t.key ? " gf-pill--active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <div className="movers__colhead">
        <span className="movers__col-symbol">SYMBOL</span>
        <span className="movers__col-price">PRICE</span>
        <span className="movers__col-change">CHANGE</span>
      </div>

      {error ? (
        <p className="movers__msg text-muted">Couldn't load</p>
      ) : rows == null ? (
        <div className="movers__list">
          {Array.from({ length: 8 }).map((_, i) => (
            <div className="movers__skel-row" key={i}>
              <div className="movers__skel-left">
                <span className="gf-skeleton movers__skel-ticker" />
                <span className="gf-skeleton movers__skel-name" />
              </div>
              <span className="gf-skeleton movers__skel-spark" />
              <span className="gf-skeleton movers__skel-price" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="movers__msg text-muted">No movers.</p>
      ) : (
        <div className="movers__list">
          {rows.map((row) => (
            <Link key={row.ticker} to={`/quote/${row.ticker}`} className="movers__row">
              <div className="movers__left">
                <span className="movers__ticker">{row.ticker}</span>
                {row.name && <span className="movers__name">{row.name}</span>}
              </div>
              <span className="movers__spark">
                <Sparkline data={row.spark} width={64} height={26} fill />
              </span>
              <span className="movers__right">
                <span className="mono movers__price">{fmtPriceVnd(row.last, { suffix: false })}</span>
                <ChangeBadge pct={row.change_pct} size="sm" className="movers__badge" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
