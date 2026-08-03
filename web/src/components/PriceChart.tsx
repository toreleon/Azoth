import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type IPriceLine,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { RANGE_KEYS } from "../lib/types";
import type { RangeKey, OhlcvResponse, IndicatorsResponse } from "../lib/types";
import { api } from "../lib/api";
import {
  dirOf,
  fmtChangeVnd,
  fmtChartTime,
  fmtPct,
  fmtPriceVnd,
  rangeLabel,
} from "../lib/format";
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

/** Which toolbar dropdown is currently open (mutually exclusive). */
type MenuKey = "type" | "indicators" | "compare" | null;

/**
 * What the crosshair is currently over, mirroring Google Finance's hover readout:
 * the point's timestamp plus its price and move from the range baseline. While
 * comparing, the price fields are null and `legend` carries each series' % instead.
 */
interface HoverPoint {
  x: number;
  y: number;
  timeLabel: string;
  value: number | null; // board price (thousand VND)
  changeAbs: number | null;
  changePct: number | null;
  legend: { label: string; color: string; pct: number }[];
}

/** Small downward chevron for dropdown triggers. */
function Caret() {
  return (
    <svg
      className="pchart__caret"
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m6 9 6 6 6-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Checkmark used by menu items that reflect on/off or selected state. */
function MenuCheck() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 6 9 17l-5-5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
  const [compareInput, setCompareInput] = useState("");

  // Toolbar dropdowns — only one open at a time (chart type / indicators / compare).
  const [openMenu, setOpenMenu] = useState<MenuKey>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<"Area" | "Candlestick"> | null>(null);
  const overlayRefs = useRef<ISeriesApi<"Line">[]>([]);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const compareSeriesRef = useRef<ISeriesApi<"Line">[]>([]);
  /** Labels/colors for compareSeriesRef, pushed in the same order it is filled. */
  const compareLabelsRef = useRef<{ label: string; color: string }[]>([]);

  // Crosshair hover readout. The subscription is installed once, so it reads
  // live values through a ref rather than closing over render-time state.
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const hoverCtx = useRef<{ intraday: boolean; baseline: number | null }>({
    intraday: false,
    baseline: null,
  });

  const intraday = bars?.intraday ?? false;
  const compareMode = compareTickers.length > 0;

  /**
   * Baseline the hover readout and period summary measure against: the previous
   * close on intraday ranges (matching the dashed line and the header's "Today"),
   * otherwise the first bar of the range.
   */
  const baseline = useMemo(() => {
    const rows = bars?.bars ?? [];
    if (rows.length === 0) return null;
    const prev = range === "1D" || range === "5D" ? (bars?.prevClose ?? prevCloseHint) : null;
    const base = prev ?? rows[0]!.close;
    return Number.isFinite(base) && base !== 0 ? base : null;
  }, [bars, range, prevCloseHint]);

  /** Change over the whole selected range — Google Finance's "past 6 months" line. */
  const periodChange = useMemo(() => {
    const rows = bars?.bars ?? [];
    if (rows.length < 2 || baseline == null) return null;
    const last = rows[rows.length - 1]!.close;
    if (!Number.isFinite(last)) return null;
    return { abs: last - baseline, pct: (last / baseline - 1) * 100 };
  }, [bars, baseline]);

  // Keep the crosshair handler's view of the data current.
  useEffect(() => {
    hoverCtx.current = { intraday, baseline };
  }, [intraday, baseline]);

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
    setOpenMenu(null);
    setCompareInput("");
  }, [ticker]);

  // Close whichever toolbar dropdown is open on outside click or Escape.
  useEffect(() => {
    if (!openMenu) return;
    const onDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenu]);

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
        // Re-fit after a width change: the time scale otherwise keeps its old bar
        // spacing and right-anchors, leaving the new width empty on the left.
        chartRef.current.timeScale().fitContent();
      }
    });
    ro.observe(container);

    // Hover readout: report the bar under the crosshair, priced against the
    // range baseline. Series come from refs because this runs once.
    const onCrosshair = (param: MouseEventParams) => {
      const pt = param.point;
      if (!pt || param.time == null || pt.x < 0 || pt.y < 0) {
        setHover(null);
        return;
      }
      const timeLabel = fmtChartTime(param.time as number, hoverCtx.current.intraday);
      const read = (s: ISeriesApi<"Area" | "Candlestick" | "Line">): number | null => {
        const d = param.seriesData.get(s) as unknown as
          | { value?: number; close?: number }
          | undefined;
        const v = d?.value ?? d?.close;
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      };

      // While comparing, every series is a normalized % line — show them all.
      if (compareSeriesRef.current.length > 0) {
        const legend = compareSeriesRef.current.flatMap((s, i) => {
          const pct = read(s);
          const meta = compareLabelsRef.current[i];
          return pct != null && meta ? [{ ...meta, pct }] : [];
        });
        setHover(
          legend.length
            ? { x: pt.x, y: pt.y, timeLabel, value: null, changeAbs: null, changePct: null, legend }
            : null,
        );
        return;
      }

      const main = mainSeriesRef.current;
      const value = main ? read(main) : null;
      if (value == null) {
        setHover(null);
        return;
      }
      const base = hoverCtx.current.baseline;
      setHover({
        x: pt.x,
        y: pt.y,
        timeLabel,
        value,
        changeAbs: base == null ? null : value - base,
        changePct: base == null ? null : (value / base - 1) * 100,
        legend: [],
      });
    };
    chart.subscribeCrosshairMove(onCrosshair);

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
      chart.unsubscribeCrosshairMove(onCrosshair);
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
    setHover(null); // the old readout refers to bars we're replacing
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
        // Google Finance labels this line inline at the top-right of the plot
        // ("Prev. close $333.43") rather than on the price axis.
        priceLineRef.current = mainSeriesRef.current.createPriceLine({
          price: prev,
          color: c.muted,
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: false,
          title: "",
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
    compareLabelsRef.current = [];

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

    const addNorm = (data: TimedPoint[], color: string, label: string) => {
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
      // Kept index-aligned with compareSeriesRef so the hover readout can label rows.
      compareLabelsRef.current.push({ label, color });
    };

    // Base ticker first (accent), then each compare from the palette.
    addNorm(normalized(bars), c.accent, ticker);
    compareTickers.forEach((t, i) => {
      const ob = compareBars[t];
      if (ob) addNorm(normalized(ob), COMPARE_PALETTE[i % COMPARE_PALETTE.length]!, t);
    });

    chart.timeScale().fitContent();
  }, [compareMode, compareBars, bars, range, themeVersion, compareTickers, ticker]);

  const hasData = !!bars && bars.bars.length > 0;
  const overlaysDisabled = intraday;

  // The dashed previous-close line only exists on intraday ranges; label it inline.
  const prevCloseShown =
    !compareMode && (range === "1D" || range === "5D")
      ? (bars?.prevClose ?? prevCloseHint ?? null)
      : null;

  // Place the readout beside the crosshair, kept inside the plot. It flips below
  // the cursor near the top edge so it never clips out of the card.
  const tipBelow = !!hover && hover.y < 72;
  const tipStyle = hover
    ? {
        left: (() => {
          const w = containerRef.current?.clientWidth ?? 0;
          if (!w) return hover.x;
          return Math.min(Math.max(hover.x, 84), Math.max(w - 84, 84));
        })(),
        top: tipBelow ? hover.y + 16 : hover.y - 14,
      }
    : undefined;

  return (
    <div className="gf-card pchart">
      <div className="pchart__toolbar">
        <div className="pchart__group" ref={toolbarRef}>
          {/* Chart type ▾ — Area vs Candlestick (drives the same chartType state). */}
          <div className="pchart__menu">
            <button
              type="button"
              className="gf-pill pchart__trigger"
              aria-haspopup="menu"
              aria-expanded={openMenu === "type"}
              disabled={compareMode}
              title={compareMode ? "Unavailable while comparing" : undefined}
              onClick={() => setOpenMenu((m) => (m === "type" ? null : "type"))}
            >
              <span>Chart type</span>
              <Caret />
            </button>
            {openMenu === "type" && (
              <div className="gf-card pchart__menu-pop" role="menu" aria-label="Chart type">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={chartType === "area"}
                  className={`pchart__menu-item${chartType === "area" ? " is-checked" : ""}`}
                  onClick={() => {
                    setChartType("area");
                    setOpenMenu(null);
                  }}
                >
                  <span className="pchart__menu-mark" aria-hidden="true">
                    {chartType === "area" && <MenuCheck />}
                  </span>
                  <span>Area</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={chartType === "candlestick"}
                  className={`pchart__menu-item${chartType === "candlestick" ? " is-checked" : ""}`}
                  onClick={() => {
                    setChartType("candlestick");
                    setOpenMenu(null);
                  }}
                >
                  <span className="pchart__menu-mark" aria-hidden="true">
                    {chartType === "candlestick" && <MenuCheck />}
                  </span>
                  <span>Candlestick</span>
                </button>
              </div>
            )}
          </div>

          {/* Indicators ▾ — SMA / Bollinger toggles (same showSMA / showBoll state). */}
          <div className="pchart__menu">
            <button
              type="button"
              className={`gf-pill pchart__trigger${!compareMode && (showSMA || showBoll) ? " gf-pill--active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={openMenu === "indicators"}
              disabled={overlaysDisabled || compareMode}
              title={
                overlaysDisabled
                  ? "Available on longer ranges"
                  : compareMode
                    ? "Unavailable while comparing"
                    : undefined
              }
              onClick={() => setOpenMenu((m) => (m === "indicators" ? null : "indicators"))}
            >
              <span>Indicators</span>
              <Caret />
            </button>
            {openMenu === "indicators" && (
              <div className="gf-card pchart__menu-pop" role="menu" aria-label="Indicators">
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={showSMA}
                  className={`pchart__menu-item${showSMA ? " is-checked" : ""}`}
                  onClick={() => setShowSMA((v) => !v)}
                >
                  <span className="pchart__menu-box" aria-hidden="true">
                    {showSMA && <MenuCheck />}
                  </span>
                  <span>SMA (20 / 50)</span>
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={showBoll}
                  className={`pchart__menu-item${showBoll ? " is-checked" : ""}`}
                  onClick={() => setShowBoll((v) => !v)}
                >
                  <span className="pchart__menu-box" aria-hidden="true">
                    {showBoll && <MenuCheck />}
                  </span>
                  <span>Bollinger Bands</span>
                </button>
              </div>
            )}
          </div>

          {/* Compare ▾ — existing multi-ticker popover, trigger restyled to match. */}
          <div className="pchart__menu">
            <button
              type="button"
              className={`gf-pill pchart__trigger${compareMode ? " gf-pill--active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={openMenu === "compare"}
              onClick={() => setOpenMenu((m) => (m === "compare" ? null : "compare"))}
            >
              <span>Compare</span>
              <Caret />
            </button>
            {openMenu === "compare" && (
              <div className="gf-card pchart__menu-pop pchart__compare-pop" role="menu" aria-label="Compare tickers">
                <input
                  className="pchart__compare-input"
                  placeholder="Add ticker…"
                  value={compareInput}
                  autoFocus
                  onChange={(e) => setCompareInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addCompare(compareInput);
                    else if (e.key === "Escape") setOpenMenu(null);
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

      </div>

      {!compareMode && periodChange && (
        <p className="pchart__period">
          <span className={`pchart__period-val mono pchart__period-val--${dirOf(periodChange.pct)}`}>
            {fmtChangeVnd(periodChange.abs)} ({fmtPct(periodChange.pct)})
          </span>{" "}
          <span className="text-muted">{rangeLabel(range)}</span>
        </p>
      )}

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

      <div className="pchart__chart-wrap" onMouseLeave={() => setHover(null)}>
        <div ref={containerRef} className="pchart__chart" />

        {hasData && prevCloseShown != null && (
          <span className="pchart__prevclose text-muted">
            Prev. close <span className="mono">{fmtPriceVnd(prevCloseShown)}</span>
          </span>
        )}

        {hover && (
          <div
            className={`pchart__tip${tipBelow ? " pchart__tip--below" : ""}`}
            style={tipStyle}
            role="status"
            aria-live="off"
          >
            <div className="pchart__tip-time">{hover.timeLabel}</div>
            {hover.legend.length > 0 ? (
              <ul className="pchart__tip-list">
                {hover.legend.map((l) => (
                  <li className="pchart__tip-row" key={l.label}>
                    <span className="pchart__tip-dot" style={{ background: l.color }} />
                    <span className="pchart__tip-label">{l.label}</span>
                    <span className={`pchart__tip-pct mono pchart__tip-pct--${dirOf(l.pct)}`}>
                      {fmtPct(l.pct)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div className="pchart__tip-price mono">{fmtPriceVnd(hover.value)}</div>
                {hover.changePct != null && (
                  <div className={`pchart__tip-chg mono pchart__tip-chg--${dirOf(hover.changePct)}`}>
                    {fmtChangeVnd(hover.changeAbs)} ({fmtPct(hover.changePct)})
                  </div>
                )}
              </>
            )}
          </div>
        )}

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

      {/* Google Finance puts the range buttons under the plot, not in the toolbar. */}
      <div className="pchart__ranges" role="group" aria-label="Chart range">
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
  );
}
