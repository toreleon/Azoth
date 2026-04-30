import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { cached } from "../data/cache.js";
import {
  getRatio,
  getCompanyProfile,
  RATIOS,
  type RatioPoint,
} from "../data/sources/vndirectFinfo.js";
import {
  getCompanyIntro,
  getFinancialRatios,
  type CafefRatioBucket,
} from "../data/sources/cafef.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

const TTL = 6 * 60 * 60; // fundamentals change slowly — 6h

interface RatioMap {
  EPS?: number;
  BV?: number;
  PE?: number;
  ROA?: number;
  ROE?: number;
  ROS?: number;
  DAR?: number;
  GOS?: number;
}

function flattenBucket(b: CafefRatioBucket): RatioMap {
  const out: RatioMap = {};
  for (const v of b.Value ?? []) {
    out[v.Code as keyof RatioMap] = v.Value;
  }
  return out;
}

export const fundamentalsTool = tool(
  "fundamentals_snapshot",
  "Fetch a fundamentals snapshot for a Vietnamese ticker. Returns latest P/E, P/B, P/S, dividend yield, market cap, foreign ownership, and 1M/1Y price change from VNDirect; plus EPS, BVPS (BV), ROE, ROA, ROS, gross margin (GOS), and debt/asset (DAR) from CafeF. EPS, BV, ROA, ROE, ROS, DAR, GOS are quoted as percentages or in thousand VND for monetary values — see field comments.",
  {
    symbol: z.string().describe("Ticker, e.g. HPG, VCB"),
    periods: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(4)
      .describe("How many recent CafeF reporting periods to include"),
  },
  async ({ symbol, periods }) => {
    const ticker = symbol.toUpperCase();
    const result = await cached(`fundamentals:v2:${ticker}:${periods}`, TTL, async () => {
      const safe = <T,>(p: Promise<T>, fallback: T) =>
        p.catch(() => fallback);
      const empty: RatioPoint[] = [];

      const [
        pe,
        pb,
        ps,
        divYield,
        marketCap,
        sharesOut,
        foreignOwn,
        chg1m,
        chg1y,
        profile,
        intro,
        cafefRatios,
      ] = await Promise.all([
        safe(getRatio(ticker, RATIOS.PE, 4), empty),
        safe(getRatio(ticker, RATIOS.PB, 4), empty),
        safe(getRatio(ticker, RATIOS.PS, 1), empty),
        safe(getRatio(ticker, RATIOS.DIV_YIELD, 1), empty),
        safe(getRatio(ticker, RATIOS.MARKETCAP, 1), empty),
        safe(getRatio(ticker, RATIOS.SHARES_OUTSTANDING, 1), empty),
        safe(getRatio(ticker, RATIOS.FOREIGN_OWNERSHIP, 1), empty),
        safe(getRatio(ticker, RATIOS.PRICE_CHG_PCT_1M, 1), empty),
        safe(getRatio(ticker, RATIOS.PRICE_CHG_PCT_1Y, 1), empty),
        safe(getCompanyProfile(ticker), null),
        safe(getCompanyIntro(ticker), null),
        safe(getFinancialRatios(ticker, "QUY", periods), [] as CafefRatioBucket[]),
      ]);

      const latest = (arr: RatioPoint[]) =>
        arr[0] ? { value: arr[0].value, reportDate: arr[0].reportDate } : null;
      const series = (arr: RatioPoint[]) =>
        arr.map((p) => ({ value: p.value, reportDate: p.reportDate }));

      const cafefShaped = cafefRatios.map((b) => ({
        time: b.Time,
        year: b.Year,
        quarter: b.Quater,
        ratios: flattenBucket(b),
      }));
      const latestCafef = cafefShaped[0]?.ratios ?? {};

      return {
        ticker,
        sources: ["VNDirect Finfo", "CafeF"],
        company: {
          vnName: profile?.vnName,
          enName: profile?.enName,
          floor: profile?.floor,
          website: profile?.website,
          summary: profile?.vnSummary?.slice(0, 600),
          intro: intro?.Intro?.slice(0, 600),
        },
        latest: {
          // VNDirect (trading-level)
          pe: latest(pe),
          pb: latest(pb),
          ps: latest(ps),
          dividend_yield_pct: latest(divYield),
          market_cap_vnd: latest(marketCap),
          shares_outstanding: latest(sharesOut),
          foreign_ownership_pct: latest(foreignOwn),
          price_change_pct_1m: latest(chg1m),
          price_change_pct_1y: latest(chg1y),
          // CafeF (most recent reporting period)
          eps_thousand_vnd: latestCafef.EPS ?? null,
          bvps_thousand_vnd: latestCafef.BV ?? null,
          roe_pct: latestCafef.ROE ?? null,
          roa_pct: latestCafef.ROA ?? null,
          ros_pct: latestCafef.ROS ?? null,
          debt_to_assets_pct: latestCafef.DAR ?? null,
          gross_margin_pct: latestCafef.GOS ?? null,
        },
        history: {
          pe: series(pe),
          pb: series(pb),
          cafef_periods: cafefShaped,
        },
      };
    });
    return asText(result);
  },
);
