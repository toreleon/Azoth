import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import type { IndexSnapshot, MoverRow } from "../lib/types";
import { fmtPriceVnd } from "../lib/format";
import Sparkline from "../components/Sparkline";
import ChangeBadge from "../components/ChangeBadge";
import IndexCard from "../components/IndexCard";
import "./MarketTrends.css";

const KINDS = ["active", "gainers", "losers", "indexes"] as const;
type Kind = (typeof KINDS)[number];

const TABS: { key: Kind; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "gainers", label: "Gainers" },
  { key: "losers", label: "Losers" },
  { key: "indexes", label: "Indexes" },
];

const CAPTION: Record<Kind, string> = {
  active: "Most actively traded stocks today",
  gainers: "Biggest gainers today",
  losers: "Biggest losers today",
  indexes: "Vietnam market indices",
};

type Universe = "default" | "vn30";
const UNIVERSES: { key: Universe; label: string }[] = [
  { key: "default", label: "Liquid" },
  { key: "vn30", label: "VN30" },
];

export default function MarketTrends() {
  const { kind: raw } = useParams();
  const kind: Kind = KINDS.includes(raw as Kind) ? (raw as Kind) : "active";

  const [universe, setUniverse] = useState<Universe>("default");
  const [rows, setRows] = useState<MoverRow[] | null>(null);
  const [indices, setIndices] = useState<IndexSnapshot[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setError(false);

    if (kind === "indexes") {
      setIndices(null);
      api
        .indices(ac.signal)
        .then((r) => setIndices(r.indices))
        .catch((e) => {
          if (e?.name !== "AbortError") setError(true);
        });
    } else {
      setRows(null);
      api
        .movers(kind, universe, ac.signal)
        .then((r) => setRows(r.rows))
        .catch((e) => {
          if (e?.name !== "AbortError") setError(true);
        });
    }

    return () => ac.abort();
  }, [kind, universe]);

  return (
    <div className="markets">
      <header className="markets__head">
        <h1 className="markets__title">Market trends</h1>
        <p className="markets__caption text-secondary">{CAPTION[kind]}</p>
      </header>

      <nav className="markets__tabs" aria-label="Market trend category">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to={`/markets/${t.key}`}
            className={`markets__tab${kind === t.key ? " markets__tab--active" : ""}`}
            aria-current={kind === t.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {kind === "indexes" ? (
        <IndexesView indices={indices} error={error} />
      ) : (
        <>
          <div className="markets__toolbar">
            <div className="markets__universe" role="group" aria-label="Universe">
              {UNIVERSES.map((u) => (
                <button
                  key={u.key}
                  type="button"
                  className={`gf-pill markets__uni-pill${universe === u.key ? " gf-pill--active" : ""}`}
                  aria-pressed={universe === u.key}
                  onClick={() => setUniverse(u.key)}
                >
                  {u.label}
                </button>
              ))}
            </div>
          </div>
          <MoversView rows={rows} error={error} />
        </>
      )}
    </div>
  );
}

function MoversView({ rows, error }: { rows: MoverRow[] | null; error: boolean }) {
  return (
    <section className="gf-card markets__table">
      <div className="markets__thead">
        <span className="markets__th markets__th-sym">Symbol</span>
        <span className="markets__th markets__th-spark" aria-hidden="true" />
        <span className="markets__th markets__th-price">Price</span>
        <span className="markets__th markets__th-change">Change</span>
      </div>

      {error ? (
        <p className="markets__msg text-muted">Couldn't load market trends.</p>
      ) : rows == null ? (
        <div className="markets__list">
          {Array.from({ length: 12 }).map((_, i) => (
            <div className="markets__skel-row" key={i}>
              <div className="markets__skel-sym">
                <span className="gf-skeleton markets__skel-ticker" />
                <span className="gf-skeleton markets__skel-name" />
              </div>
              <span className="gf-skeleton markets__skel-spark" />
              <span className="gf-skeleton markets__skel-price" />
              <span className="gf-skeleton markets__skel-badge" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="markets__msg text-muted">No stocks to show.</p>
      ) : (
        <div className="markets__list">
          {rows.map((row) => (
            <Link key={row.ticker} to={`/quote/${row.ticker}`} className="markets__row">
              <span className="markets__sym">
                <span className="markets__ticker">{row.ticker}</span>
                {row.name && <span className="markets__name">{row.name}</span>}
              </span>
              <span className="markets__spark">
                <Sparkline data={row.spark} width={96} height={30} fill />
              </span>
              <span className="mono markets__price">{fmtPriceVnd(row.last)}</span>
              <span className="markets__change">
                <ChangeBadge pct={row.change_pct} size="sm" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function IndexesView({ indices, error }: { indices: IndexSnapshot[] | null; error: boolean }) {
  if (error) {
    return (
      <section className="gf-card markets__table">
        <p className="markets__msg text-muted">Couldn't load market indices.</p>
      </section>
    );
  }

  return (
    <div className="markets__index-grid">
      {indices == null
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="gf-skeleton markets__index-skel" />
          ))
        : indices.map((idx) => <IndexCard key={idx.symbol} index={idx} />)}
    </div>
  );
}
