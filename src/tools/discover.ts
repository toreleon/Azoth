import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getStockOhlcv } from "../data/sources/dnsePublic.js";
import { nowSec } from "../agent/clock.js";
import { cached } from "../data/cache.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

/**
 * Curated liquid universe (~28 tickers): VN30 large caps + the most active
 * mid-caps across banking, real estate, retail, steel, brokers, F&B, energy.
 * The discovery tool ranks within this set so we don't have to scan all
 * ~1,600 listed names. Edit here to expand the search space.
 */
export const DISCOVERY_UNIVERSE: readonly string[] = [
  // Banks
  "VCB", "BID", "CTG", "TCB", "MBB", "ACB", "VPB", "STB", "HDB",
  // Real estate
  "VHM", "VIC", "NVL", "DXG", "KDH",
  // Industrials / steel / energy
  "HPG", "GAS", "PLX", "POW", "GVR",
  // Consumer / retail
  "VNM", "MWG", "MSN", "SAB", "PNJ",
  // Brokers / financials
  "SSI", "VND", "VCI",
  // Tech / chemicals
  "FPT", "DGC",
];

export const TICKER_UNIVERSES = {
  default: DISCOVERY_UNIVERSE,
  vn30: ["VCB", "BID", "CTG", "TCB", "MBB", "ACB", "VPB", "STB", "HDB", "VHM", "VIC", "HPG", "GAS", "PLX", "VNM", "MWG", "MSN", "SAB", "FPT", "GVR", "POW", "SSI", "PNJ", "NVL"] as const,
  banks: ["VCB", "BID", "CTG", "TCB", "MBB", "ACB", "VPB", "STB", "HDB"] as const,
  bluechip: ["VCB", "FPT", "HPG", "VNM", "VHM", "VIC", "MWG", "GAS"] as const,
} as const;

interface Candidate {
  ticker: string;
  metric: number | null;
  latest_close: number | null;
  ret_1w: number | null;
  ret_1m: number | null;
  rsi14: number | null;
  vol_ratio: number | null; // last 5d avg vol / prior 20d avg vol
}

const DAY = 86400;

function pct(now: number, prev: number | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

function rsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  const window = closes.slice(-15);
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < window.length; i++) {
    const d = window[i]! - window[i - 1]!;
    if (d > 0) gains += d;
    else losses -= d;
  }
  const avgG = gains / 14;
  const avgL = losses / 14;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}

async function buildCandidate(ticker: string): Promise<Candidate> {
  const to = nowSec();
  const from = to - 90 * DAY;
  const day = new Date(to * 1000).toISOString().slice(0, 10);
  const bars = await cached(
    `ohlcv:stock:${ticker}:1D:90d:date=${day}`,
    600,
    () => getStockOhlcv(ticker, "1D", from, to),
  ).catch(() => [] as Awaited<ReturnType<typeof getStockOhlcv>>);
  if (bars.length < 25) {
    return {
      ticker,
      metric: null,
      latest_close: null,
      ret_1w: null,
      ret_1m: null,
      rsi14: null,
      vol_ratio: null,
    };
  }
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const last = closes[closes.length - 1]!;
  const prev1w = closes[closes.length - 6];
  const prev1m = closes[closes.length - 22];
  const recentVol = vols.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const priorVol =
    vols.length >= 25
      ? vols.slice(-25, -5).reduce((a, b) => a + b, 0) / 20
      : null;
  const volRatio = priorVol != null && priorVol > 0 ? recentVol / priorVol : null;
  return {
    ticker,
    metric: null,
    latest_close: last,
    ret_1w: pct(last, prev1w),
    ret_1m: pct(last, prev1m),
    rsi14: rsi14(closes),
    vol_ratio: volRatio,
  };
}

export type DiscoverCriterion =
  | "momentum"
  | "breakout"
  | "oversold"
  | "low_volatility"
  | "high_volume"
  | "top_gainers"
  | "top_losers";

export type DiscoverUniverse = keyof typeof TICKER_UNIVERSES;

export interface DiscoverResult {
  criterion: DiscoverCriterion;
  universe: DiscoverUniverse;
  universe_size: number;
  returned: number;
  candidates: Array<{
    ticker: string;
    metric: number | null;
    latest_close: number | null;
    ret_1w_pct: number | null;
    ret_1m_pct: number | null;
    rsi14: number | null;
    vol_ratio_5_20: number | null;
  }>;
}

export async function discoverTickers(input: {
  criterion: DiscoverCriterion;
  limit?: number;
  universe?: DiscoverUniverse;
}): Promise<DiscoverResult> {
  const criterion = input.criterion;
  const limit = input.limit ?? 8;
  const universe = input.universe ?? "default";
  const tickers = TICKER_UNIVERSES[universe];
  const candidates = await Promise.all(tickers.map(buildCandidate));
  const valid = candidates.filter((c) => c.latest_close != null);

  let scored: Candidate[];
  switch (criterion) {
    case "momentum":
      scored = valid
        .filter((c) => c.rsi14 != null && c.rsi14 >= 50 && c.rsi14 <= 75)
        .map((c) => ({ ...c, metric: c.ret_1m ?? -Infinity }))
        .sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity));
      break;
    case "breakout":
      scored = valid
        .filter((c) => (c.vol_ratio ?? 0) > 1.3)
        .map((c) => ({ ...c, metric: c.ret_1w ?? -Infinity }))
        .sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity));
      break;
    case "oversold":
      scored = valid
        .map((c) => ({ ...c, metric: c.rsi14 ?? Infinity }))
        .sort((a, b) => (a.metric ?? Infinity) - (b.metric ?? Infinity));
      break;
    case "low_volatility":
      scored = valid
        .filter((c) => (c.ret_1w ?? -Infinity) > 0)
        .map((c) => ({ ...c, metric: Math.abs(c.ret_1m ?? Infinity) }))
        .sort((a, b) => (a.metric ?? Infinity) - (b.metric ?? Infinity));
      break;
    case "high_volume":
      scored = valid
        .map((c) => ({ ...c, metric: c.vol_ratio ?? -Infinity }))
        .sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity));
      break;
    case "top_gainers":
      scored = valid
        .map((c) => ({ ...c, metric: c.ret_1w ?? -Infinity }))
        .sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity));
      break;
    case "top_losers":
      scored = valid
        .map((c) => ({ ...c, metric: c.ret_1w ?? Infinity }))
        .sort((a, b) => (a.metric ?? Infinity) - (b.metric ?? Infinity));
      break;
  }

  const top = scored.slice(0, limit).map((c) => ({
    ticker: c.ticker,
    metric: c.metric != null ? Number(c.metric.toFixed(3)) : null,
    latest_close: c.latest_close,
    ret_1w_pct: c.ret_1w != null ? Number(c.ret_1w.toFixed(2)) : null,
    ret_1m_pct: c.ret_1m != null ? Number(c.ret_1m.toFixed(2)) : null,
    rsi14: c.rsi14 != null ? Number(c.rsi14.toFixed(1)) : null,
    vol_ratio_5_20: c.vol_ratio != null ? Number(c.vol_ratio.toFixed(2)) : null,
  }));

  return {
    criterion,
    universe,
    universe_size: tickers.length,
    returned: top.length,
    candidates: top,
  };
}

export const discoverTickersTool = tool(
  "discover_tickers",
  [
    "Discover Vietnamese stocks matching a strategy criterion. Use this at the START of each turn to build a focused 5–10 ticker candidate set for THIS week.",
    "Searches a curated liquid universe (~28 names: VN30 + active mid-caps). Returns candidates ranked by the chosen metric, with 1w/1m return, RSI14, and 5d/20d volume ratio.",
    "Criteria:",
    "- 'momentum': highest 1-month return, breaking out (rsi 50-75, rising vol).",
    "- 'breakout': highest 1-week return with vol_ratio > 1.3.",
    "- 'oversold': lowest RSI14 (mean-reversion candidates).",
    "- 'low_volatility': smallest |1m return| with positive 1w (defensive).",
    "- 'high_volume': highest 5d/20d volume surge (interest spike).",
    "- 'top_gainers' / 'top_losers': simple 1w-return ranking.",
  ].join(" "),
  {
    criterion: z.enum([
      "momentum",
      "breakout",
      "oversold",
      "low_volatility",
      "high_volume",
      "top_gainers",
      "top_losers",
    ]),
    limit: z.number().int().min(3).max(15).default(8),
    universe: z.enum(["default", "vn30", "banks", "bluechip"]).default("default"),
  },
  async ({ criterion, limit, universe }) => {
    const result = await discoverTickers({ criterion, limit, universe });
    return asText(result);
  },
);
