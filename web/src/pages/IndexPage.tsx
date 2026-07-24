import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import IndexChart from "../components/IndexChart";
import ChangeBadge from "../components/ChangeBadge";
import ConstituentTable from "../components/ConstituentTable";
import NewsList from "../components/NewsList";
import { api } from "../lib/api";
import type { IndexDetailResponse, NewsItem } from "../lib/types";
import { dirOf, fmtChangeAbs, fmtIndex, fmtPct } from "../lib/format";
import "./IndexPage.css";

/** Google-Finance-style detail page for a market index. */
export default function IndexPage() {
  const { symbol = "" } = useParams();
  const sym = symbol.toUpperCase();

  const [data, setData] = useState<IndexDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setNewsLoading(true);
    setError(null);
    setData(null);
    setNews([]);

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

    // An index page carries market-wide news, which is what this feed is.
    api
      .marketNews(ac.signal)
      .then((res) => setNews(res.items.slice(0, 8)))
      .catch(() => {
        /* news is secondary */
      })
      .finally(() => setNewsLoading(false));

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

        {loading && <ConstituentTable rows={[]} loading />}

        {!loading && data && !data.hasConstituents && (
          <p className="idx__note text-muted">
            Constituent data isn't published for {data.name} by our sources.
          </p>
        )}

        {!loading && data && data.hasConstituents && (
          <ConstituentTable rows={data.constituents} />
        )}
      </section>

      {(newsLoading || news.length > 0) && (
        <NewsList items={news} loading={newsLoading} title="Market news" />
      )}
    </div>
  );
}
