import { useCallback, useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type UTCTimestamp,
} from "lightweight-charts";
import { RANGE_KEYS } from "../lib/types";
import type { RangeKey, OhlcvResponse, IndicatorsResponse } from "../lib/types";
import { api } from "../lib/api";
import "./PriceChart.css";

interface PriceChartProps {
  ticker: string;
  prevCloseHint?: number | null;
}

// A distinct muted orange for the SMA-50 overlay (readable in both themes).
const SMA50_COLOR = "#f9ab00";

// Palette for compare lines (base ticker uses the theme accent).
const COMPARE_PALETTE = ["#e8710a", "#12b5cb", "#9334e6", "#e52592", "#1e8e3e"];
const COMPARE_SUGGESTED = ["VNM", "VCB", "FPT", "HPG", "VIC", "MWG", "TCB", "MSN"];
const MAX_COMPARE = 4;

/** Convert a #rgb / #rrggbb hex string to an rgba() string with the given alpha. */
function hexToRgba(hex: string, a: number): string {
  let h = (hex || "").replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return `rgba(0,0,0,${a})`;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

interface ThemeColors {
  text: string;
  grid: string;
  up: string;
  down: string;
  accent: string;
  muted: string;
}

function readColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    text: v("--text-secondary") || "#5f6368",
    grid: v("--border-subtle") || "#e8eaed",
    up: v("--up-strong") || "#1e8e3e",
    down: v("--down-strong") || "#d93025",
    accent: v("--accent") || "#1a73e8",
    muted: v("--text-muted") || "#80868b",
  };
}

type TimedPoint = { time: UTCTimestamp; value: number };

/** Sort ascending by time, drop non-finite values, and collapse duplicate timestamps. */
function cleanLine<T extends { time: number }>(
  points: T[] | undefined,
  getVal: (p: T) => number,
): TimedPoint[] {
  if (!points || points.length === 0) return [];
  const out: TimedPoint[] = [];
  const sorted = [...points].sort((a, b) => a.time - b.time);
  let lastTime = -Infinity;
  for (const p of sorted) {
    const value = getVal(p);
    if (!Number.isFinite(p.time) || !Number.isFinite(value)) continue;
    if (p.time === lastTime) {
      out[out.length - 1] = { time: p.time as UTCTimestamp, value };
    } else {
      out.push({ time: p.time as UTCTimestamp, value });
    }
    lastTime = p.time;
  }
  return out;
}

export default function PriceChart({ ticker, prevCloseHint }: PriceChartProps) {
  const [range, setRange] = useState<RangeKey>("6M");
  const [chartType, setChartType] = useState<"area" | "candlestick">("area");
  const [showSMA, setShowSMA] = useState(false);
  const [showBoll, setShowBoll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [bars, setBars] = useState<OhlcvResponse | null>(null);
  const [indicators, setIndicators] = useState<IndicatorsResponse | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);

  // Compare (multi-ticker normalized % overlay).
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [compareBars, setCompareBars] = useState<Record<string, OhlcvResponse>>({});
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareInput, setCompareInput] = useState("");

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Area" | "Candlestick"> | null>(null);
  const overlayRefs = useRef<ISeriesApi<"Line">[]>([]);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const compareSeriesRef = useRef<ISeriesApi<"Line">[]>([]);

  const intraday = bars?.intraday ?? false;
  const compareMode = compareTickers.length > 0;

  const addCompare = (raw: string) => {
    const t = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
    if (!t || t === ticker || compareTickers.includes(t) || compareTickers.length >= MAX_COMPARE) return;
    setCompareTickers((prev) => [...prev, t]);
    setCompareInput("");
  };
  const removeCompare = (t: string) => setCompareTickers((prev) => prev.filter((x) => x !== t));

  // Reset comparisons when navigating to a different ticker.
  useEffect(() => {
    setCompareTickers([]);
    setCompareOpen(false);
    setCompareInput("");
  }, [ticker]);

  // Apply theme-derived layout/axis options to the chart. Reads colors live.
  const applyTheme = useCallback(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = readColors();
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: c.text,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: c.grid },
      },
      rightPriceScale: { borderColor: c.grid },
      timeScale: {
        borderColor: c.grid,
        timeVisible: intraday,
        secondsVisible: false,
      },
      crosshair: { mode: CrosshairMode.Normal },
    });
  }, [intraday]);

  // (1) Create the chart once, plus resize + theme observers.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 380,
      autoSize: false,
    });
    chartRef.current = chart;
    applyTheme();

    const ro = new ResizeObserver(() => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth });
      }
    });
    ro.observe(container);

    const mo = new MutationObserver(() => {
      setThemeVersion((v) => v + 1);
    });
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => {
      ro.disconnect();
      mo.disconnect();
      overlayRefs.current = [];
      mainSeriesRef.current = null;
      priceLineRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
    // Create exactly once for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (2) Re-apply theme options whenever the theme flips or intraday-ness changes.
  useEffect(() => {
    applyTheme();
  }, [applyTheme, themeVersion]);

  // (3) Fetch bars + indicators on [ticker, range].
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(false);
    Promise.all([
      api.ohlcv(ticker, range, ctrl.signal),
      api.indicators(ticker, range, ctrl.signal),
    ])
      .then(([ohlcv, ind]) => {
        if (ctrl.signal.aborted) return;
        setBars(ohlcv);
        setIndicators(ind);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted || (err as { name?: string })?.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [ticker, range]);

  // (4) Draw the main series on [bars, chartType, themeVersion].
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Remove previous main series (and its price line).
    if (mainSeriesRef.current) {
      try {
        chart.removeSeries(mainSeriesRef.current);
      } catch {
        /* series already gone */
      }
      mainSeriesRef.current = null;
      priceLineRef.current = null;
    }

    // In compare mode the compare-draw effect owns the chart's series.
    if (compareMode) return;

    const rows = bars?.bars ?? [];
    if (rows.length === 0) return;

    const c = readColors();
    const firstClose = rows[0].close;
    const lastClose = rows[rows.length - 1].close;
    const dirColor = lastClose >= firstClose ? c.up : c.down;

    // lightweight-charts renders timestamps in UTC. For intraday ranges, shift by
    // +7h so the axis/crosshair show Vietnam exchange-local time (ICT). Daily+ bars
    // are left untouched (shifting could cross a day boundary and mislabel dates).
    const tz = bars?.intraday ? 7 * 3600 : 0;
    const rowsTz = tz ? rows.map((b) => ({ ...b, time: b.time + tz })) : rows;

    if (chartType === "area") {
      const series = chart.addAreaSeries({
        lineColor: dirColor,
        topColor: hexToRgba(dirColor, 0.2),
        bottomColor: hexToRgba(dirColor, 0),
        lineWidth: 2,
        priceLineVisible: false,
      });
      series.setData(cleanLine(rowsTz, (b) => b.close));
      mainSeriesRef.current = series;
    } else {
      const series = chart.addCandlestickSeries({
        upColor: c.up,
        downColor: c.down,
        borderVisible: false,
        wickUpColor: c.up,
        wickDownColor: c.down,
      });
      // Candles need ascending unique times; dedupe by timestamp.
      const seen = new Set<number>();
      const data = [...rowsTz]
        .sort((a, b) => a.time - b.time)
        .filter((b) => {
          if (
            seen.has(b.time) ||
            ![b.open, b.high, b.low, b.close].every((n) => Number.isFinite(n))
          ) {
            return false;
          }
          seen.add(b.time);
          return true;
        })
        .map((b) => ({
          time: b.time as UTCTimestamp,
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        }));
      series.setData(data);
      mainSeriesRef.current = series;
    }

    // Previous-close dashed line for intraday ranges.
    if (range === "1D" || range === "5D") {
      const prev = bars?.prevClose ?? prevCloseHint;
      if (prev != null && Number.isFinite(prev) && mainSeriesRef.current) {
        priceLineRef.current = mainSeriesRef.current.createPriceLine({
          price: prev,
          color: c.muted,
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: true,
          title: "Prev close",
        });
      }
    }

    chart.timeScale().fitContent();
  }, [bars, chartType, themeVersion, range, prevCloseHint, compareMode]);

  // (5) Draw indicator overlays on [indicators, showSMA, showBoll, bars, themeVersion].
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Clear existing overlays.
    for (const s of overlayRefs.current) {
      try {
        chart.removeSeries(s);
      } catch {
        /* already gone */
      }
    }
    overlayRefs.current = [];

    // Overlays only make sense on non-intraday ranges, and not while comparing.
    if (!bars || bars.intraday || !indicators || compareMode) return;
    const c = readColors();

    const addLine = (
      data: TimedPoint[],
      color: string,
      opts?: { width?: number; dashed?: boolean },
    ) => {
      if (data.length === 0) return;
      const s = chart.addLineSeries({
        color,
        lineWidth: (opts?.width ?? 1.5) as 1 | 2 | 3 | 4,
        lineStyle: opts?.dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      s.setData(data);
      overlayRefs.current.push(s);
    };

    if (showSMA) {
      addLine(cleanLine(indicators.sma20, (p) => p.value), c.accent, { width: 1.5 });
      addLine(cleanLine(indicators.sma50, (p) => p.value), SMA50_COLOR, { width: 1.5 });
    }

    if (showBoll) {
      addLine(cleanLine(indicators.bollinger, (p) => p.upper), c.muted, {
        width: 1,
        dashed: true,
      });
      addLine(cleanLine(indicators.bollinger, (p) => p.middle), c.muted, { width: 1 });
      addLine(cleanLine(indicators.bollinger, (p) => p.lower), c.muted, {
        width: 1,
        dashed: true,
      });
    }
  }, [indicators, showSMA, showBoll, bars, themeVersion, compareMode]);

  // (6a) Fetch OHLCV for each compare ticker on [compareTickers, range].
  useEffect(() => {
    if (compareTickers.length === 0) {
      setCompareBars({});
      return;
    }
    const ctrl = new AbortController();
    Promise.all(
      compareTickers.map((t) =>
        api
          .ohlcv(t, range, ctrl.signal)
          .then((r) => [t, r] as const)
          .catch(() => null),
      ),
    ).then((pairs) => {
      if (ctrl.signal.aborted) return;
      const map: Record<string, OhlcvResponse> = {};
      for (const p of pairs) if (p) map[p[0]] = p[1];
      setCompareBars(map);
    });
    return () => ctrl.abort();
  }, [compareTickers, range]);

  // (6b) Draw normalized % comparison lines.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    for (const s of compareSeriesRef.current) {
      try {
        chart.removeSeries(s);
      } catch {
        /* already gone */
      }
    }
    compareSeriesRef.current = [];

    if (!compareMode || !bars || bars.bars.length === 0) return;
    const c = readColors();

    const pctFmt = {
      type: "custom" as const,
      minMove: 0.01,
      formatter: (p: number) => `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`,
    };

    // Normalize a series to % change from its first bar (with intraday tz shift).
    const normalized = (ohlcv: OhlcvResponse): TimedPoint[] => {
      const rows = ohlcv.bars;
      const base = rows[0]?.close;
      if (!base) return [];
      const tzS = ohlcv.intraday ? 7 * 3600 : 0;
      return cleanLine(
        rows.map((b) => ({ time: b.time + tzS, value: (b.close / base - 1) * 100 })),
        (p) => p.value,
      );
    };

    const addNorm = (data: TimedPoint[], color: string) => {
      if (data.length === 0) return;
      const s = chart.addLineSeries({
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        priceFormat: pctFmt,
      });
      s.setData(data);
      compareSeriesRef.current.push(s);
    };

    // Base ticker first (accent), then each compare from the palette.
    addNorm(normalized(bars), c.accent);
    compareTickers.forEach((t, i) => {
      const ob = compareBars[t];
      if (ob) addNorm(normalized(ob), COMPARE_PALETTE[i % COMPARE_PALETTE.length]!);
    });

    chart.timeScale().fitContent();
  }, [compareMode, compareBars, bars, range, themeVersion, compareTickers]);

  const hasData = !!bars && bars.bars.length > 0;
  const overlaysDisabled = intraday;

  return (
    <div className="gf-card pchart">
      <div className="pchart__toolbar">
        <div className="pchart__group">
          <button
            type="button"
            className={`gf-pill pchart__pill${chartType === "area" ? " gf-pill--active" : ""}`}
            aria-pressed={chartType === "area"}
            disabled={compareMode}
            title={compareMode ? "Unavailable while comparing" : undefined}
            onClick={() => setChartType("area")}
          >
            Area
          </button>
          <button
            type="button"
            className={`gf-pill pchart__pill${chartType === "candlestick" ? " gf-pill--active" : ""}`}
            aria-pressed={chartType === "candlestick"}
            disabled={compareMode}
            title={compareMode ? "Unavailable while comparing" : undefined}
            onClick={() => setChartType("candlestick")}
          >
            Candles
          </button>

          <span className="pchart__sep" aria-hidden="true" />

          <button
            type="button"
            className={`gf-pill pchart__pill${showSMA ? " gf-pill--active" : ""}`}
            aria-pressed={showSMA}
            disabled={overlaysDisabled || compareMode}
            title={overlaysDisabled ? "Available on longer ranges" : compareMode ? "Unavailable while comparing" : undefined}
            onClick={() => setShowSMA((v) => !v)}
          >
            SMA
          </button>
          <button
            type="button"
            className={`gf-pill pchart__pill${showBoll ? " gf-pill--active" : ""}`}
            aria-pressed={showBoll}
            disabled={overlaysDisabled || compareMode}
            title={overlaysDisabled ? "Available on longer ranges" : compareMode ? "Unavailable while comparing" : undefined}
            onClick={() => setShowBoll((v) => !v)}
          >
            Bollinger
          </button>

          <span className="pchart__sep" aria-hidden="true" />

          <div className="pchart__compare">
            <button
              type="button"
              className={`gf-pill pchart__pill${compareMode ? " gf-pill--active" : ""}`}
              aria-expanded={compareOpen}
              onClick={() => setCompareOpen((o) => !o)}
            >
              + Compare
            </button>
            {compareOpen && (
              <div className="gf-card pchart__compare-pop">
                <input
                  className="pchart__compare-input"
                  placeholder="Add ticker…"
                  value={compareInput}
                  autoFocus
                  onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCompare(compareInput);
                    else if (e.key === "Escape") setCompareOpen(false);
                  }}
                  maxLength={12}
                  aria-label="Add a ticker to compare"
                />
                <div className="pchart__compare-suggest">
                  {COMPARE_SUGGESTED.filter((t) => t !== ticker && !compareTickers.includes(t))
                    .slice(0, 6)
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        className="gf-chip pchart__compare-chip"
                        onClick={() => addCompare(t)}
                      >
                        {t}
                      </button>
                    ))}
                </div>
                {compareTickers.length >= MAX_COMPARE && (
                  <span className="pchart__compare-note text-muted">Max {MAX_COMPARE} comparisons</span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="pchart__group" role="group" aria-label="Chart range">
          {RANGE_KEYS.map((r) => (
            <button
              key={r}
              type="button"
              className={`gf-pill pchart__pill${range === r ? " gf-pill--active" : ""}`}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {compareMode && (
        <div className="pchart__legend">
          <span className="pchart__legend-item">
            <span className="pchart__legend-dot" style={{ background: "var(--accent)" }} />
            {ticker}
          </span>
          {compareTickers.map((t, i) => (
            <span className="pchart__legend-item" key={t}>
              <span
                className="pchart__legend-dot"
                style={{ background: COMPARE_PALETTE[i % COMPARE_PALETTE.length] }}
              />
              {t}
              <button
                type="button"
                className="pchart__legend-x"
                aria-label={`Remove ${t}`}
                onClick={() => removeCompare(t)}
              >
                ×
              </button>
            </span>
          ))}
          <span className="pchart__legend-note text-muted">% change over {range}</span>
        </div>
      )}

      <div className="pchart__chart-wrap">
        <div ref={containerRef} className="pchart__chart" />

        {loading && (
          <div className="pchart__overlay" role="status" aria-label="Loading chart">
            <div className="pchart__spinner" />
          </div>
        )}
        {!loading && error && (
          <div className="pchart__overlay">
            <span className="pchart__error">Couldn't load chart</span>
          </div>
        )}
        {!loading && !error && !hasData && (
          <div className="pchart__empty">No price data</div>
        )}
      </div>
    </div>
  );
}
