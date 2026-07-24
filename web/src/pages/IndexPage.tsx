import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import IndexChart from "../components/IndexChart";
import Sparkline from "../components/Sparkline";
import ChangeBadge from "../components/ChangeBadge";
import { api } from "../lib/api";
import type { IndexDetailResponse } from "../lib/types";
import { dirOf, fmtChangeAbs, fmtIndex, fmtPct, fmtPriceVnd } from "../lib/format";
import "./IndexPage.css";

/** Google-Finance-style detail page for a market index. */
export default function IndexPage() {
  const { symbol = "" } = useParams();
  const sym = symbol.toUpperCase();

  const [data, setData] = useState<IndexDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    api
      .index(sym, ac.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err?.message || "Failed to load");
        setLoading(false);
      });
    return () => ac.abort();
  }, [sym]);

  if (!loading && error) {
    return (
      <div className="gf-card idx__error">
        <p>Couldn't load {sym}.</p>
        <p className="text-secondary">{error}</p>
        <Link to="/" className="idx__back">
          ← Back to markets
        </Link>
      </div>
    );
  }

  const dir = dirOf(data?.change_pct_1d);
  const perf = data
    ? [
        { label: "1D", value: data.change_pct_1d },
        { label: "1W", value: data.change_pct_1w },
        { label: "1M", value: data.change_pct_1m },
      ]
    : [];

  return (
    <div className="idx">
      <div className="idx__crumb">
        <Link to="/" className="idx__crumb-link">
          Home
        </Link>
        <span className="idx__crumb-sep"> / </span>
        <span className="text-muted">{data?.name ?? sym}</span>
      </div>

      {loading || !data ? (
        <div className="idx__head-skel">
          <div className="gf-skeleton" style={{ height: 28, width: 220 }} />
          <div className="gf-skeleton" style={{ height: 40, width: 300 }} />
        </div>
      ) : (
        <header className="idx__head">
          <h1 className="idx__name">{data.name}</h1>
          <div className="idx__price-row">
            <span className="idx__value mono">{fmtIndex(data.latest_close)}</span>
            <span className={`idx__change ${dir}`}>
              <ChangeBadge
                pct={data.change_pct_1d}
                text={`${fmtChangeAbs(data.change_abs)} (${fmtPct(data.change_pct_1d)})`}
                size="lg"
              />
              <span className="idx__today">Today</span>
            </span>
          </div>
          <div className="idx__perf">
            {perf.map((p) => (
              <span className="idx__perf-item" key={p.label}>
                <span className="idx__perf-label text-muted">{p.label}</span>
                <span className={`idx__perf-val mono ${dirOf(p.value)}`}>{fmtPct(p.value)}</span>
              </span>
            ))}
          </div>
        </header>
      )}

      <IndexChart symbol={sym} />

      <section className="idx__members">
        <h2 className="gf-section-title idx__members-title">Constituents</h2>

        {loading && (
          <div className="gf-card idx__rows">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="gf-skeleton idx__row-skel" />
            ))}
          </div>
        )}

        {!loading && data && !data.hasConstituents && (
          <p className="idx__note text-muted">
            Constituent data isn't published for {data.name} by our sources.
          </p>
        )}

        {!loading && data && data.hasConstituents && data.constituents.length > 0 && (
          <div className="gf-card idx__table-wrap">
            <table className="idx__table">
              <thead>
                <tr>
                  <th scope="col">Symbol</th>
                  <th scope="col" className="idx__th-spark">
                    Trend
                  </th>
                  <th scope="col" className="idx__num">
                    Price
                  </th>
                  <th scope="col" className="idx__num">
                    Change
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.constituents.map((c) => (
                  <tr key={c.ticker}>
                    <td>
                      <Link to={`/quote/${c.ticker}`} className="idx__sym">
                        <span className="idx__sym-ticker">{c.ticker}</span>
                        {c.name && <span className="idx__sym-name text-secondary">{c.name}</span>}
                      </Link>
                    </td>
                    <td className="idx__td-spark">
                      <Sparkline
                        data={c.spark}
                        width={72}
                        height={26}
                        fill
                        direction={dirOf(c.change_pct)}
                      />
                    </td>
                    <td className="idx__num mono">{fmtPriceVnd(c.last)}</td>
                    <td className="idx__num">
                      <ChangeBadge pct={c.change_pct} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
