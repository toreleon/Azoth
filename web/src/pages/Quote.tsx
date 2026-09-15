import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import QuoteHeader from "../components/QuoteHeader";
import PriceChart from "../components/PriceChart";
import StatsGrid from "../components/StatsGrid";
import RelatedStocks from "../components/RelatedStocks";
import NewsList from "../components/NewsList";
import AboutCompany from "../components/AboutCompany";
import FinancialsTab from "../components/FinancialsTab";
import { api } from "../lib/api";
import type { AboutResponse, NewsItem, QuoteResponse } from "../lib/types";
import "./Quote.css";

type QuoteTab = "overview" | "financials" | "news";
const TABS: { key: QuoteTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "news", label: "News" },
];

export default function Quote() {
  const { ticker = "" } = useParams();
  const sym = ticker.toUpperCase();

  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [about, setAbout] = useState<AboutResponse | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<QuoteTab>("overview");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setNewsLoading(true);
    setError(null);
    setQuote(null);
    setAbout(null);
    setNews([]);
    setTab("overview");

    api
      .quote(sym, ac.signal)
      .then(setQuote)
      .catch((e) => {
        if (e?.name !== "AbortError") setError(e?.message || "Failed to load");
      })
      .finally(() => setLoading(false));

    api
      .about(sym, ac.signal)
      .then(setAbout)
      .catch(() => {
        /* about is secondary */
      });

    api
      .news(sym, ac.signal)
      .then((r) => setNews(r.items))
      .catch(() => {
        /* news is secondary */
      })
      .finally(() => setNewsLoading(false));

    return () => ac.abort();
  }, [sym]);

  if (error && !quote) {
    return (
      <div className="quote__error gf-card">
        <p>Couldn't load data for {sym}.</p>
        <p className="text-secondary">{error}</p>
        <Link to="/" className="quote__back">
          ← Back to markets
        </Link>
      </div>
    );
  }

  return (
    <div className="quote">
      {loading || !quote ? (
        <div className="quote__header-skel">
          <div className="gf-skeleton" style={{ height: 16, width: 160 }} />
          <div className="gf-skeleton" style={{ height: 30, width: 260 }} />
          <div className="gf-skeleton" style={{ height: 40, width: 320 }} />
        </div>
      ) : (
        <QuoteHeader quote={quote} />
      )}

      <PriceChart ticker={sym} prevCloseHint={quote?.ref ?? null} />

      <div className="quote__tabs" role="tablist" aria-label="Quote sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`quote__tab${tab === t.key ? " quote__tab--active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="quote__panel">
          {quote && <StatsGrid quote={quote} />}
          {about?.related?.length ? <RelatedStocks related={about.related} /> : null}
          {about?.company && <AboutCompany company={about.company} />}
        </div>
      )}

      {tab === "financials" && <FinancialsTab ticker={sym} />}

      {tab === "news" && <NewsList items={news} loading={newsLoading} title="Recent news" />}
    </div>
  );
}
