import { useEffect, useState } from "react";
import { api } from "../lib/api";
import NewsThumb from "./NewsThumb";
import type { NewsItem } from "../lib/types";
import { fmtRelativeTime } from "../lib/format";
import "./MarketSummary.css";

/**
 * Google-Finance-style "market summary" news block for the home page.
 * A titled card with a list of headline rows, each a link with a source chip,
 * relative time, and an optional clamped snippet. Replaces the plain NewsList
 * on Home (NewsList is still used by the Quote page news tab).
 */
export default function MarketSummary() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(false);
    api
      .marketNews(ac.signal)
      .then((r) => setItems(r.items))
      .catch((e) => {
        if (e?.name !== "AbortError") {
          setItems([]);
          setError(true);
        }
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  return (
    <section className="market-summary gf-card">
      <h2 className="gf-section-title market-summary__title">Today&apos;s financial news</h2>

      {loading ? (
        <div className="market-summary__rows">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="market-summary__row market-summary__row--skeleton" key={i}>
              <div className="market-summary__text">
                <div className="market-summary__meta">
                  <span className="gf-skeleton market-summary__sk-line market-summary__sk-line--chip" />
                </div>
                <span className="gf-skeleton market-summary__sk-line market-summary__sk-line--title" />
                <span className="gf-skeleton market-summary__sk-line market-summary__sk-line--snippet" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="market-summary__empty">Couldn&apos;t load market news.</div>
      ) : items.length === 0 ? (
        <div className="market-summary__empty">No market news available.</div>
      ) : (
        <div className="market-summary__rows">
          {items.map((item, i) => {
            const rel = fmtRelativeTime(item.publishedAt);
            const inner = (
              <>
                <div className="market-summary__text">
                  {item.source || rel ? (
                    <div className="market-summary__meta">
                      {item.source ? (
                        <span className="gf-chip market-summary__source">{item.source}</span>
                      ) : null}
                      {rel ? <span className="market-summary__time">{rel}</span> : null}
                    </div>
                  ) : null}
                  <div className="market-summary__headline">{item.title}</div>
                  {item.snippet ? (
                    <div className="market-summary__snippet">{item.snippet}</div>
                  ) : null}
                </div>
                <NewsThumb src={item.image} />
              </>
            );
            return item.url ? (
              <a
                key={i}
                className="market-summary__row"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {inner}
              </a>
            ) : (
              <div key={i} className="market-summary__row">
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
