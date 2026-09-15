import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { FinancialUnit, FinancialsResponse } from "../lib/types";
import { fmtNum, fmtPctPlain, fmtPriceVnd } from "../lib/format";
import "./FinancialsTab.css";

interface Props {
  ticker: string;
}

const UNIT_LABEL: Record<FinancialUnit, string> = {
  kVND: "thousand ₫",
  "%": "%",
  x: "×",
};

/** Full value for the table cells. */
function tableFmt(v: number | null, unit: FinancialUnit): string {
  if (v == null) return "—";
  if (unit === "kVND") return fmtPriceVnd(v);
  if (unit === "%") return fmtPctPlain(v);
  return fmtNum(v);
}

/** Compact value for the bar labels. */
function barFmt(v: number | null, unit: FinancialUnit): string {
  if (v == null) return "";
  if (unit === "%") return `${fmtNum(v, 1)}%`;
  return fmtNum(v, v != null && Math.abs(v) < 100 ? 1 : 0);
}

export default function FinancialsTab({ ticker }: Props) {
  const [data, setData] = useState<FinancialsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [metricKey, setMetricKey] = useState<string>("eps");

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(false);
    api
      .financials(ticker, "annual", ac.signal)
      .then((d) => {
        setData(d);
        if (d.metrics.length && !d.metrics.some((m) => m.key === metricKey)) {
          setMetricKey(d.metrics[0]!.key);
        }
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setError(true);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
    // metricKey intentionally excluded — we only reset it from the response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]);

  const selected = useMemo(
    () => data?.metrics.find((m) => m.key === metricKey) ?? data?.metrics[0] ?? null,
    [data, metricKey],
  );

  const maxAbs = useMemo(() => {
    if (!selected) return 1;
    const vals = selected.values.filter((v): v is number => v != null);
    const m = Math.max(...vals.map((v) => Math.abs(v)), 0);
    return m || 1;
  }, [selected]);

  if (loading) {
    return (
      <div className="gf-card fin">
        <div className="gf-skeleton" style={{ height: 20, width: 140, marginBottom: 16 }} />
        <div className="gf-skeleton" style={{ height: 180, width: "100%", marginBottom: 16 }} />
        <div className="gf-skeleton" style={{ height: 160, width: "100%" }} />
      </div>
    );
  }

  if (error || !data || data.metrics.length === 0 || data.columns.length === 0) {
    return (
      <div className="gf-card fin">
        <h2 className="gf-section-title">Financials</h2>
        <p className="text-muted fin__empty">No financial data available for {ticker}.</p>
      </div>
    );
  }

  const cols = data.columns;

  return (
    <div className="gf-card fin">
      <div className="fin__head">
        <h2 className="gf-section-title">Financials</h2>
        <span className="gf-chip fin__period">Annual</span>
      </div>

      {/* Metric selector */}
      <div className="fin__metrics" role="tablist" aria-label="Financial metric">
        {data.metrics.map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.key === selected?.key}
            className={`gf-pill fin__metric-pill${m.key === selected?.key ? " gf-pill--active" : ""}`}
            onClick={() => setMetricKey(m.key)}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Bar chart of the selected metric */}
      {selected && (
        <div className="fin__chart-wrap">
          <div className="fin__chart-title text-secondary">
            {selected.label}
            <span className="fin__unit"> · {UNIT_LABEL[selected.unit]}</span>
          </div>
          <div className="fin__chart" role="img" aria-label={`${selected.label} by year`}>
            {selected.values.map((v, i) => {
              const h = v != null && v > 0 ? Math.max(2, (Math.abs(v) / maxAbs) * 150) : v != null ? 2 : 0;
              return (
                <div className="fin__col" key={i}>
                  <div className="fin__val mono">{barFmt(v, selected.unit)}</div>
                  <div
                    className={`fin__bar${v != null && v < 0 ? " fin__bar--neg" : ""}`}
                    style={{ height: `${h}px` }}
                    title={`${cols[i]?.label}: ${tableFmt(v, selected.unit)}`}
                  />
                  <div className="fin__year mono">{cols[i]?.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Full metrics table */}
      <div className="fin__table-wrap">
        <table className="fin__table">
          <thead>
            <tr>
              <th className="fin__th-metric">Metric</th>
              {cols.map((c, i) => (
                <th key={i} className="mono">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.metrics.map((m) => (
              <tr
                key={m.key}
                className={m.key === selected?.key ? "fin__row--active" : undefined}
                onClick={() => setMetricKey(m.key)}
              >
                <th scope="row" className="fin__row-label">
                  {m.label}
                  <span className="fin__row-unit text-muted"> {m.unit === "kVND" ? "k₫" : m.unit}</span>
                </th>
                {m.values.map((v, i) => (
                  <td key={i} className="mono">
                    {tableFmt(v, m.unit)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="fin__source text-muted">Source: CafeF · figures are per-share values in thousand VND, ratios in %.</p>
    </div>
  );
}
