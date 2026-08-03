import "./NewsList.css";
import type { NewsItem } from "../lib/types";
import { fmtRelativeTime } from "../lib/format";

interface NewsListProps {
  items: NewsItem[];
  loading?: boolean;
  title?: string;
  compact?: boolean;
}

/** First letter of a source name, uppercased, for the monogram avatar. */
function monogram(source: string | undefined): string {
  const ch = source?.trim()?.[0];
  return ch ? ch.toUpperCase() : "•";
}

function NewsRowInner({ item, compact }: { item: NewsItem; compact?: boolean }) {
  const rel = fmtRelativeTime(item.publishedAt);
  return (
    <>
      <div className="newslist__logo" aria-hidden="true">
        {monogram(item.source)}
      </div>
      <div className="newslist__body">
        <div className="newslist__meta">
          {item.source ? (
            <>
              <span className="newslist__source">{item.source}</span>
              {rel ? <span className="newslist__dot"> · </span> : null}
            </>
          ) : null}
          {rel ? <span className="newslist__time">{rel}</span> : null}
        </div>
        <div className="newslist__headline">{item.title}</div>
        {!compact && item.snippet ? (
          <div className="newslist__snippet">{item.snippet}</div>
        ) : null}
      </div>
    </>
  );
}

export default function NewsList({ items, loading, title, compact }: NewsListProps) {
  return (
    <section className="newslist">
      {title ? <h2 className="gf-section-title newslist__title">{title}</h2> : null}

      {loading ? (
        <div className="newslist__rows">
          {Array.from({ length: 5 }).map((_, i) => (
            <div className="newslist__row newslist__row--skeleton" key={i}>
              <div className="newslist__logo gf-skeleton" />
              <div className="newslist__body">
                <div className="gf-skeleton newslist__sk-line newslist__sk-line--meta" />
                <div className="gf-skeleton newslist__sk-line newslist__sk-line--title" />
                {!compact ? (
                  <div className="gf-skeleton newslist__sk-line newslist__sk-line--snippet" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="newslist__empty text-muted">No news available.</div>
      ) : (
        <div className="newslist__rows">
          {items.map((item, i) =>
            item.url ? (
              <a
                key={i}
                className="newslist__row"
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <NewsRowInner item={item} compact={compact} />
              </a>
            ) : (
              <div key={i} className="newslist__row">
                <NewsRowInner item={item} compact={compact} />
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
