import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import ChangeBadge from "../components/ChangeBadge";
import ConstituentTable from "../components/ConstituentTable";
import Sparkline from "../components/Sparkline";
import { api } from "../lib/api";
import type { SectorDetailResponse } from "../lib/types";
import { dirOf, fmtPct } from "../lib/format";
import "./SectorPage.css";

/**
 * Sector detail page. The "value" here is a synthetic index (constituent closes
 * rebased to 100 and averaged), so we show the trend shape and the average
 * daily move rather than a fake index level.
 */
export default function SectorPage() {
  const { key = "" } = useParams();

  const [data, setData] = useState<SectorDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    api
      .sector(key, ac.signal)
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
  }, [key]);

  if (!loading && error) {
    return (
      <div className="gf-card sect__error">
        <p>Couldn't load this sector.</p>
        <p className="text-secondary">{error}</p>
        <Link to="/" className="sect__back">
          ← Back to markets
        </Link>
      </div>
    );
  }

  const dir = dirOf(data?.change_pct);

  return (
    <div className="sect">
      <div className="sect__crumb">
        <Link to="/" className="sect__crumb-link">
          Home
        </Link>
        <span className="sect__crumb-sep"> / </span>
        <span className="text-muted">{data?.name ?? "Sector"}</span>
      </div>

      {loading || !data ? (
        <div className="sect__head-skel">
          <div className="gf-skeleton" style={{ height: 28, width: 200 }} />
          <div className="gf-skeleton" style={{ height: 34, width: 260 }} />
        </div>
      ) : (
        <header className="sect__head">
          <h1 className="sect__name">{data.name}</h1>
          <div className="sect__meta">
            <ChangeBadge
              pct={data.change_pct}
              text={`${fmtPct(data.change_pct)} today`}
              size="lg"
            />
            <span className="sect__count text-muted">
              {data.constituents.length} stocks · average daily move
            </span>
          </div>
          {data.spark.length > 1 && (
            <div className="sect__spark">
              <Sparkline data={data.spark} width={640} height={72} fill direction={dir} />
            </div>
          )}
        </header>
      )}

      <section className="sect__members">
        <h2 className="gf-section-title sect__members-title">Constituents</h2>
        <ConstituentTable rows={data?.constituents ?? []} loading={loading} />
      </section>
    </div>
  );
}
