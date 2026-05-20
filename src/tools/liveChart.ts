import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { cached } from "../data/cache.js";
import {
  getIndexOhlcv,
  getStockOhlcv,
  type Bar,
  type Resolution,
} from "../data/sources/dnsePublic.js";
import { nowSec } from "../agent/clock.js";

const RESOLUTIONS = ["1", "5", "15", "30", "1H", "1D", "1W", "1M"] as const;

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

function lookbackDaysFor(resolution: Resolution, bars: number): number {
  if (resolution === "1D") return bars * 2;
  if (resolution === "1W") return bars * 14;
  if (resolution === "1M") return bars * 60;
  return Math.max(3, Math.ceil(bars / 50));
}

function chartTtlFor(resolution: Resolution): number {
  if (resolution === "1" || resolution === "5") return 30;
  if (resolution === "15" || resolution === "30" || resolution === "1H") return 60;
  return 600;
}

function compactBars(bars: Bar[]) {
  return bars.map((bar) => ({
    t: bar.time,
    o: roundPrice(bar.open),
    h: roundPrice(bar.high),
    l: roundPrice(bar.low),
    c: roundPrice(bar.close),
    v: Math.round(bar.volume),
  }));
}

function roundPrice(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function pctChange(first: number | undefined, last: number | undefined): number | null {
  if (first == null || last == null || first === 0) return null;
  return Math.round(((last - first) / first) * 10000) / 100;
}

export const liveChartTool = tool(
  "live_chart",
  "Fetch a realtime/intraday OHLCV chart for a Vietnamese stock or index and show it in the desktop app. For live/current chart requests, use resolution='1' or '5'. Use resolution='1D' only when the user explicitly asks for daily or historical candles.",
  {
    symbol: z.string().describe("Ticker or index, e.g. FPT, HPG, VNINDEX"),
    kind: z.enum(["stock", "index"]).default("stock"),
    resolution: z.enum(RESOLUTIONS).default("1").describe("Chart bar size. Use 1 for live intraday, 1D for daily."),
    bars: z.number().int().min(20).max(240).default(120).describe("Number of visible candles"),
  },
  async ({ symbol, kind, resolution, bars }) => {
    const normalizedSymbol = symbol.toUpperCase();
    const normalizedResolution = resolution as Resolution;
    const to = nowSec();
    const from = to - lookbackDaysFor(normalizedResolution, bars) * 86400;
    const ttl = chartTtlFor(normalizedResolution);
    const key = `live-chart:${kind}:${normalizedSymbol}:${normalizedResolution}:${bars}:bucket=${Math.floor(to / ttl)}`;
    const result = await cached(key, ttl, async () => {
      const fn = kind === "index" ? getIndexOhlcv : getStockOhlcv;
      const all = await fn(normalizedSymbol, normalizedResolution, from, to);
      return all.slice(-bars);
    });

    const first = result[0];
    const latest = result[result.length - 1];
    return asText({
      ok: true,
      tool: "live_chart",
      symbol: normalizedSymbol,
      kind,
      resolution: normalizedResolution,
      count: result.length,
      updatedAt: to,
      unit: "thousand VND for stocks; index points for indices",
      summary: latest
        ? {
            latestClose: roundPrice(latest.close),
            latestTime: latest.time,
            dataAgeSeconds: to - latest.time,
            changePct: pctChange(first?.close, latest.close),
            high: roundPrice(Math.max(...result.map((bar) => bar.high))),
            low: roundPrice(Math.min(...result.map((bar) => bar.low))),
            volume: Math.round(result.reduce((sum, bar) => sum + bar.volume, 0)),
          }
        : null,
      bars: compactBars(result),
    });
  },
);
