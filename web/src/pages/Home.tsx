import { useEffect, useState } from "react";
import MarketStrip from "../components/MarketStrip";
import MoversTable from "../components/MoversTable";
import NewsList from "../components/NewsList";
import { api } from "../lib/api";
import type { NewsItem } from "../lib/types";
import "./Home.css";

export default function Home() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    api
      .marketNews(ac.signal)
      .then((r) => setNews(r.items))
      .catch((e) => {
        if (e?.name !== "AbortError") setNews([]);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  return (
    <div className="home">
      <section className="home__section">
        <h1 className="home__title">Markets</h1>
        <MarketStrip />
      </section>

      <section className="home__section">
        <MoversTable />
      </section>

      <section className="home__section">
        <NewsList items={news} loading={loading} title="Today's financial news" />
      </section>
    </div>
  );
}
