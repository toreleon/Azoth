import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { SectorRow } from "../lib/types";
import { dirOf, fmtPct } from "../lib/format";
import Sparkline from "./Sparkline";
import "./SectorRail.css";

/**
 * Compact "Stock sectors" rail (Google Finance style): sector names with their
 * average daily % change (+ a tiny sparkline), each linking to its sector page.
 * The whole block hides on error/empty so the sidebar never shows a broken section.
 */
export default function SectorRail() {
  const [sectors, setSectors] = useState<SectorRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setSectors(null);
    setError(false);
    api
      .sectors(ctrl.signal)
      .then((res) => setSectors(res.sectors))
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(true);
      });
    return () => ctrl.abort();
  }, []);

  // Hide the whole section on error or when there's nothing to show.
  if (error) return null;
  if (sectors != null && sectors.length === 0) return null;

  const loading = sectors == null;

  return (
    <>
      <div className="gf-divider sidebar__rule" />
      <div className="sidebar__section-label">SECTORS</div>
      <div className="sector-rail">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div className="sector-rail__row sector-rail__row--skel" key={i}>
                <span className="gf-skeleton sector-rail__skel-name" />
                <span className="gf-skeleton sector-rail__skel-pct" />
              </div>
            ))
          : sectors!.map((s) => {
              const dir = dirOf(s.change_pct);
              return (
                <Link
                  to={`/sector/${s.key}`}
                  className="sector-rail__row"
                  key={s.key}
                  title={s.name}
                >
                  <span className="sector-rail__name">{s.name}</span>
                  {s.spark.length >= 2 && (
                    <span className="sector-rail__spark">
                      <Sparkline data={s.spark} width={40} height={18} direction={dir} />
                    </span>
                  )}
                  <span className={`mono sector-rail__pct ${dir}`}>{fmtPct(s.change_pct)}</span>
                </Link>
              );
            })}
      </div>
    </>
  );
}
