import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { RSI, MACD, SMA, EMA, BollingerBands } from "technicalindicators";
import { cached } from "../data/cache.js";
import {
  getStockOhlcv,
  getIndexOhlcv,
  type Bar,
  type Resolution,
} from "../data/sources/dnsePublic.js";
import { nowSec } from "../agent/clock.js";

const RESOLUTIONS = ["1", "5", "15", "30", "1H", "1D", "1W", "1M"] as const;

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

async function loadCloses(
  symbol: string,
  kind: "stock" | "index",
  resolution: Resolution,
  bars: number,
): Promise<Bar[]> {
  const to = nowSec();
  const lookbackDays =
    resolution === "1D" ? bars * 2 :
    resolution === "1W" ? bars * 14 :
    resolution === "1M" ? bars * 60 :
    Math.max(7, Math.ceil(bars / 50));
  const from = to - lookbackDays * 86400;
  const isDailyBucket =
    resolution === "1D" || resolution === "1W" || resolution === "1M";
  const ttl = isDailyBucket ? 600 : 60;
  const bucket = isDailyBucket
    ? `date=${new Date(to * 1000).toISOString().slice(0, 10)}`
    : `bucket=${Math.floor(to / ttl)}`;
  const key = `ohlcv:${kind}:${symbol}:${resolution}:${bars + 200}:${bucket}`;
  return cached(key, ttl, async () => {
    const fn = kind === "index" ? getIndexOhlcv : getStockOhlcv;
    const all = await fn(symbol, resolution, from, to);
    return all.slice(-(bars + 200)); // extra buffer for indicator warmup
  });
}

const last = <T>(a: T[]) => a[a.length - 1];

export const indicatorsTool = tool(
  "technical_indicators",
  "Compute common technical indicators (RSI, MACD, SMA, EMA, Bollinger) for a Vietnamese stock or index. Returns the indicator's value at each of the last `bars` time steps and the latest value. Period defaults follow standard convention.",
  {
    symbol: z.string(),
    kind: z.enum(["stock", "index"]).default("stock"),
    resolution: z.enum(RESOLUTIONS).default("1D"),
    bars: z.number().int().min(1).max(200).default(30),
    indicators: z
      .array(z.enum(["rsi", "macd", "sma", "ema", "bollinger"]))
      .default(["rsi", "macd", "sma", "bollinger"]),
    rsiPeriod: z.number().int().min(2).max(100).default(14),
    smaPeriod: z.number().int().min(2).max(200).default(20),
    emaPeriod: z.number().int().min(2).max(200).default(20),
    bbPeriod: z.number().int().min(2).max(100).default(20),
    bbStdDev: z.number().min(0.5).max(5).default(2),
  },
  async ({
    symbol,
    kind,
    resolution,
    bars,
    indicators,
    rsiPeriod,
    smaPeriod,
    emaPeriod,
    bbPeriod,
    bbStdDev,
  }) => {
    const series = await loadCloses(symbol, kind, resolution as Resolution, bars);
    const closes = series.map((b) => b.close);
    const out: Record<string, unknown> = {
      symbol,
      kind,
      resolution,
      bars: series.slice(-bars).map((b) => ({ time: b.time, close: b.close })),
      latest_close: last(closes),
    };

    if (indicators.includes("rsi")) {
      const v = RSI.calculate({ values: closes, period: rsiPeriod });
      out.rsi = { period: rsiPeriod, latest: last(v), recent: v.slice(-bars) };
    }
    if (indicators.includes("macd")) {
      const v = MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
        SimpleMAOscillator: false,
        SimpleMASignal: false,
      });
      out.macd = { latest: last(v), recent: v.slice(-bars) };
    }
    if (indicators.includes("sma")) {
      const v = SMA.calculate({ values: closes, period: smaPeriod });
      out.sma = { period: smaPeriod, latest: last(v), recent: v.slice(-bars) };
    }
    if (indicators.includes("ema")) {
      const v = EMA.calculate({ values: closes, period: emaPeriod });
      out.ema = { period: emaPeriod, latest: last(v), recent: v.slice(-bars) };
    }
    if (indicators.includes("bollinger")) {
      const v = BollingerBands.calculate({
        values: closes,
        period: bbPeriod,
        stdDev: bbStdDev,
      });
      out.bollinger = {
        period: bbPeriod,
        stdDev: bbStdDev,
        latest: last(v),
        recent: v.slice(-bars),
      };
    }

    return asText(out);
  },
);
