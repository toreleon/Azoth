import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  LineStyle,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type UTCTimestamp,
} from "lightweight-charts";
import { RANGE_KEYS } from "../lib/types";
import type { RangeKey, IndexOhlcvResponse } from "../lib/types";
import { api } from "../lib/api";
import { dirOf, fmtChangeAbs, fmtChartTime, fmtIndex, fmtPct, rangeLabel } from "../lib/format";
import "./IndexChart.css";

interface IndexChartProps {
  symbol: string;
}

/** The point under the crosshair: its timestamp, index value, and move from baseline. */
interface HoverPoint {
  x: number;
  y: number;
  timeLabel: string;
  value: number;
  changeAbs: number | null;
  changePct: number | null;
}

interface ThemeColors {
  text: string;
  grid: string;
  up: string;
  down: string;
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
    muted: v("--text-muted") || "#80868b",
  };
}

/**
 * Area chart for a market index, mirroring PriceChart's setup (live theme colors,
 * resize + data-theme observers, ICT shift for intraday) minus the stock-only
 * overlays — indices have no indicators or compare mode here.
 */
export default function IndexChart({ symbol }: IndexChartProps) {
  const [range, setRange] = useState<RangeKey>("6M");
  const [data, setData] = useState<IndexOhlcvResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Crosshair readout. The subscription is installed once, so it reads live
  // values through a ref instead of closing over render-time state.
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const hoverCtx = useRef<{ intraday: boolean; baseline: number | null }>({
    intraday: false,
    baseline: null,
  });

  const intraday = data?.intraday ?? false;

  /** Previous close on intraday ranges (matching the dashed line), else the first bar. */
  const baseline = useMemo(() => {
    const rows = data?.bars ?? [];
    if (rows.length === 0) return null;
    const base = data?.prevClose ?? rows[0]!.close;
    return Number.isFinite(base) && base !== 0 ? base : null;
  }, [data]);

  /** Change across the whole selected range. */
  const periodChange = useMemo(() => {
    const rows = data?.bars ?? [];
    if (rows.length < 2 || baseline == null) return null;
    const last = rows[rows.length - 1]!.close;
    if (!Number.isFinite(last)) return null;
    return { abs: last - baseline, pct: (last / baseline - 1) * 100 };
  }, [data, baseline]);

  useEffect(() => {
    hoverCtx.current = { intraday, baseline };
  }, [intraday, baseline]);

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
      timeScale: { borderColor: c.grid, timeVisible: intraday, secondsVisible: false },
      crosshair: { mode: CrosshairMode.Normal },
    });
  }, [intraday]);

  // Create the chart once; watch for container resize and theme flips.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: 320,
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

    const onCrosshair = (param: MouseEventParams) => {
      const pt = param.point;
      const series = seriesRef.current;
      if (!pt || param.time == null || pt.x < 0 || pt.y < 0 || !series) {
        setHover(null);
        return;
      }
      const d = param.seriesData.get(series) as unknown as { value?: number } | undefined;
      const value = d?.value;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        setHover(null);
        return;
      }
      const base = hoverCtx.current.baseline;
      setHover({
        x: pt.x,
        y: pt.y,
        timeLabel: fmtChartTime(param.time as number, hoverCtx.current.intraday),
        value,
        changeAbs: base == null ? null : value - base,
        changePct: base == null ? null : (value / base - 1) * 100,
      });
    };
    chart.subscribeCrosshairMove(onCrosshair);

    const mo = new MutationObserver(() => setThemeVersion((v) => v + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      ro.disconnect();
      mo.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    applyTheme();
  }, [applyTheme, themeVersion]);

  // Fetch bars whenever the symbol or range changes.
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(false);
    setHover(null); // the old readout refers to bars we're replacing
    api
      .indexOhlcv(symbol, range, ac.signal)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        setError(true);
        setLoading(false);
      });
    return () => ac.abort();
  }, [symbol, range]);

  // Draw the series (redrawn on theme change so colors stay in sync).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !data) return;

    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    if (!data.bars.length) return;

    const c = readColors();
    const lastClose = data.bars[data.bars.length - 1]!.close;
    const base = data.prevClose ?? data.bars[0]!.close;
    const rising = lastClose >= base;
    const line = rising ? c.up : c.down;

    const series = chart.addAreaSeries({
      lineColor: line,
      topColor: `${line}33`,
      bottomColor: `${line}00`,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // Intraday bars arrive in UTC; shift so the axis reads Vietnam time (ICT).
    const tz = data.intraday ? 7 * 3600 : 0;
    series.setData(
      data.bars.map((b) => ({
        time: (b.time + tz) as UTCTimestamp,
        value: b.close,
      })),
    );

    // Only intraday ranges have a true previous close: on longer ranges the server
    // reports the range's own first bar, which would mislabel the line.
    if (data.intraday && data.prevClose != null) {
      series.createPriceLine({
        price: data.prevClose,
        color: c.muted,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Prev close",
      });
    }

    seriesRef.current = series;
    chart.timeScale().fitContent();
  }, [data, themeVersion]);

  const tipBelow = !!hover && hover.y < 72;
  const tipStyle = hover
    ? {
        left: (() => {
          const w = containerRef.current?.clientWidth ?? 0;
          if (!w) return hover.x;
          return Math.min(Math.max(hover.x, 78), Math.max(w - 78, 78));
        })(),
        top: tipBelow ? hover.y + 16 : hover.y - 14,
      }
    : undefined;

  return (
    <section className="gf-card ichart">
      <div className="ichart__ranges" role="group" aria-label="Chart range">
        {RANGE_KEYS.map((r) => (
          <button
            key={r}
            type="button"
            className={`gf-pill ichart__pill${r === range ? " gf-pill--active" : ""}`}
            aria-pressed={r === range}
            onClick={() => setRange(r)}
          >
            {r}
          </button>
        ))}
      </div>

      {periodChange && (
        <p className="ichart__period">
          <span className={`ichart__period-val mono ichart__period-val--${dirOf(periodChange.pct)}`}>
            {fmtChangeAbs(periodChange.abs)} ({fmtPct(periodChange.pct)})
          </span>{" "}
          <span className="text-muted">{rangeLabel(range)}</span>
        </p>
      )}

      <div className="ichart__wrap" onMouseLeave={() => setHover(null)}>
        <div ref={containerRef} className="ichart__chart" />

        {hover && (
          <div
            className={`ichart__tip${tipBelow ? " ichart__tip--below" : ""}`}
            style={tipStyle}
            role="status"
            aria-live="off"
          >
            <div className="ichart__tip-time">{hover.timeLabel}</div>
            <div className="ichart__tip-price mono">{fmtIndex(hover.value)}</div>
            {hover.changePct != null && (
              <div className={`ichart__tip-chg mono ichart__tip-chg--${dirOf(hover.changePct)}`}>
                {fmtChangeAbs(hover.changeAbs)} ({fmtPct(hover.changePct)})
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="ichart__overlay">
            <div className="ichart__spinner" aria-label="Loading chart" />
          </div>
        )}
        {!loading && error && (
          <div className="ichart__overlay">
            <p className="ichart__msg text-muted">Couldn't load chart data.</p>
          </div>
        )}
        {!loading && !error && data && data.bars.length === 0 && (
          <p className="ichart__empty text-muted">No data for this range.</p>
        )}
      </div>
    </section>
  );
}
