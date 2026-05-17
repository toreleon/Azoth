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
import { nowSec } from "../agent/clock.js";

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
    const to = nowSec();
    // Wide window so we definitely get `bars` back; clipped after fetch.
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
    const key = `ohlcv:${kind}:${symbol}:${resolution}:${bars}:${bucket}`;
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
  "Fetch the latest live quote from SSI iBoard, including matched price, change, volume, bid/ask, ref, ceiling, floor, exchange, and company info. Use this for realtime/current price before answering any 'now', 'live', or 'latest' price question.",
  {
    symbol: z.string().describe("Ticker, e.g. HPG, VCB"),
  },
  async ({ symbol }) => {
    const q = await cached(
      `ssi-quote:${symbol}:bucket=${Math.floor(nowSec() / 60)}`,
      60,
      () => getQuote(symbol),
    );
    return asText({
      ticker: q.ticker,
      exchange: q.exchange,
      ref: q.ref,
      ceiling: q.ceiling,
      floor: q.floor,
      matchedPrice: q.matchedPrice,
      matchedVolume: q.matchedVolume,
      priceChange: q.priceChange,
      priceChangePercent: q.priceChangePercent,
      openPrice: q.openPrice,
      highest: q.highest,
      lowest: q.lowest,
      avgPrice: q.avgPrice,
      totalTradedQty: q.totalTradedQty,
      totalTradedValue: q.totalTradedValue,
      bestBid: q.bestBid,
      bestBidVol: q.bestBidVol,
      bestOffer: q.bestOffer,
      bestOfferVol: q.bestOfferVol,
      tradingDate: q.tradingDate,
      session: q.session,
      tradingStatus: q.tradingStatus,
      expectedLastUpdate: q.expectedLastUpdate,
      companyNameVi: q.companyNameVi,
      companyNameEn: q.companyNameEn,
    });
  },
);
