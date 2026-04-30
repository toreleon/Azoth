import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { cached } from "../data/cache.js";
import {
  getStockOhlcv,
  getIndexOhlcv,
  type Bar,
  type Resolution,
} from "../data/sources/dnsePublic.js";
import { getQuote } from "../data/sources/ssiIboard.js";

const RESOLUTIONS = ["1", "5", "15", "30", "1H", "1D", "1W", "1M"] as const;

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

export const ohlcvTool = tool(
  "market_ohlcv",
  "Fetch OHLCV bars for a Vietnamese stock ticker or index from DNSE (HOSE/HNX/UPCOM). Use kind='index' for VNINDEX/HNXINDEX/UPCOMINDEX, otherwise 'stock'. Returns up to `bars` most recent bars.",
  {
    symbol: z.string().describe("Ticker, e.g. HPG, VCB, or VNINDEX"),
    kind: z.enum(["stock", "index"]).default("stock"),
    resolution: z.enum(RESOLUTIONS).default("1D").describe("Bar size"),
    bars: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(60)
      .describe("How many recent bars to return"),
  },
  async ({ symbol, kind, resolution, bars }) => {
    const to = Math.floor(Date.now() / 1000);
    // Wide window so we definitely get `bars` back; clipped after fetch.
    const lookbackDays =
      resolution === "1D" ? bars * 2 :
      resolution === "1W" ? bars * 14 :
      resolution === "1M" ? bars * 60 :
      Math.max(7, Math.ceil(bars / 50));
    const from = to - lookbackDays * 86400;
    const ttl = resolution === "1D" || resolution === "1W" || resolution === "1M" ? 600 : 60;
    const key = `ohlcv:${kind}:${symbol}:${resolution}:${bars}:${Math.floor(to / ttl)}`;
    const result = await cached(key, ttl, async () => {
      const fn = kind === "index" ? getIndexOhlcv : getStockOhlcv;
      const all: Bar[] = await fn(symbol, resolution as Resolution, from, to);
      return all.slice(-bars);
    });
    return asText({ symbol, kind, resolution, count: result.length, bars: result });
  },
);

export const quoteTool = tool(
  "market_quote",
  "Fetch latest quote info (ref, ceiling, floor, exchange, company name) for a Vietnamese stock from SSI iBoard. For the latest traded price, use market_ohlcv with resolution='1' and bars=1.",
  {
    symbol: z.string().describe("Ticker, e.g. HPG, VCB"),
  },
  async ({ symbol }) => {
    const q = await cached(`ssi-quote:${symbol}:${Math.floor(Date.now() / 60000)}`, 60, () =>
      getQuote(symbol),
    );
    return asText({
      ticker: q.ticker,
      exchange: q.exchange,
      ref: q.ref,
      ceiling: q.ceiling,
      floor: q.floor,
      companyNameVi: q.companyNameVi,
      companyNameEn: q.companyNameEn,
    });
  },
);
