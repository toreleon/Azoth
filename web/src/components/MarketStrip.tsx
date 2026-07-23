import { useEffect, useState } from "react";
import type { IndexSnapshot } from "../lib/types";
import { api, ApiError } from "../lib/api";
import IndexCard from "./IndexCard";
import "./MarketStrip.css";

export default function MarketStrip() {
  const [indices, setIndices] = useState<IndexSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setError(null);
    setIndices(null);
    api
      .indices(ctrl.signal)
      .then((res) => setIndices(res.indices))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(err instanceof ApiError ? err.message : "Couldn't load market indices.");
      });
    return () => ctrl.abort();
  }, []);

  return (
    <section className="marketstrip" aria-label="Market indices">
      <div className="marketstrip__tabs" role="presentation">
        <button type="button" className="gf-pill gf-pill--active">
          Vietnam
        </button>
        <span className="gf-pill marketstrip__tab--disabled" aria-hidden="true">
          Global
        </span>
      </div>

      {error ? (
        <p className="marketstrip__error text-muted">Couldn't load market indices.</p>
      ) : (
        <div className="marketstrip__row" role="list">
          {indices == null
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="gf-skeleton marketstrip__skeleton" role="listitem" />
              ))
            : indices.map((idx) => (
                <div key={idx.symbol} className="marketstrip__item" role="listitem">
                  <IndexCard index={idx} />
                </div>
              ))}
        </div>
      )}
    </section>
  );
}
