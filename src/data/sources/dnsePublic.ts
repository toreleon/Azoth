import { request } from "undici";
import { asOfClock, nowSec, isAsOfOverridden } from "../../agent/clock.js";

const DNSE_BASE = "https://services.entrade.com.vn";

export type Resolution = "1" | "5" | "15" | "30" | "1H" | "1D" | "1W" | "1M";

export interface OhlcvSeries {
  t: number[]; // unix seconds
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
  nextTime?: number;
}

export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function fetchOhlcs(
  kind: "stock" | "index",
  symbol: string,
  resolution: Resolution,
  from: number,
  to: number,
): Promise<OhlcvSeries> {
  const url = `${DNSE_BASE}/chart-api/v2/ohlcs/${kind}?symbol=${encodeURIComponent(
    symbol,
  )}&resolution=${resolution}&from=${from}&to=${to}`;
  const { statusCode, body } = await request(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (statusCode !== 200) {
    const text = await body.text();
    throw new Error(`DNSE ${kind} ${statusCode}: ${text.slice(0, 200)}`);
  }
  return (await body.json()) as OhlcvSeries;
}

/**
 * Uses binary search to find the last index where bar.time <= asOf.
 * Time series market data arrays are chronologically sorted.
 * @returns The index of the bar, or -1 if no such bar exists.
 */
export function findLastBarIndex(bars: Bar[], asOf: number): number {
  let l = 0;
  let r = bars.length - 1;
  let ans = -1;
  while (l <= r) {
    const m = Math.floor((l + r) / 2);
    if (bars[m]!.time <= asOf) {
      ans = m;
      l = m + 1;
    } else {
      r = m - 1;
    }
  }
  return ans;
}

export function seriesToBars(s: OhlcvSeries): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < s.t.length; i++) {
    if (s.c[i] == null) continue; // skip empty intraday slots
    out.push({
      time: s.t[i]!,
      open: s.o[i]!,
      high: s.h[i]!,
      low: s.l[i]!,
      close: s.c[i]!,
      volume: s.v[i]!,
    });
  }
  return out;
}

function clipBars(bars: Bar[]): Bar[] {
  // Clip when an as-of clock is active (ALS or module override). When neither
  // is set, fall through unchanged — DNSE only returns historical data anyway.
  const hasOverride =
    asOfClock.getStore()?.asOfSec != null || isAsOfOverridden();
  if (!hasOverride) return bars;
  const asOf = nowSec();

  // Use O(log n) binary search instead of O(n) array filter
  const idx = findLastBarIndex(bars, asOf);
  if (idx === -1) return [];
  return bars.slice(0, idx + 1);
}

export async function getStockOhlcv(
  symbol: string,
  resolution: Resolution,
  from: number,
  to: number,
): Promise<Bar[]> {
  const series = await fetchOhlcs("stock", symbol.toUpperCase(), resolution, from, to);
  return clipBars(seriesToBars(series));
}

export async function getIndexOhlcv(
  symbol: string,
  resolution: Resolution,
  from: number,
  to: number,
): Promise<Bar[]> {
  const series = await fetchOhlcs("index", symbol.toUpperCase(), resolution, from, to);
  return clipBars(seriesToBars(series));
}
