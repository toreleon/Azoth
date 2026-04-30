import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { cached } from "../data/cache.js";
import { getIndexOhlcv, type Bar } from "../data/sources/dnsePublic.js";
import { getRatio } from "../data/sources/vndirectFinfo.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

const INDICES = ["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX"] as const;
type IndexCode = (typeof INDICES)[number];

interface IndexSnapshot {
  symbol: string;
  latest_close: number;
  latest_time: string;
  change_pct_1d: number | null;
  change_pct_1w: number | null;
  change_pct_1m: number | null;
}

function pctChange(now: number, prev?: number) {
  if (prev == null || prev === 0) return null;
  return ((now - prev) / prev) * 100;
}

async function snapshotIndex(symbol: IndexCode): Promise<IndexSnapshot | null> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 60 * 86400;
  const bars: Bar[] = await getIndexOhlcv(symbol, "1D", from, to).catch(() => []);
  if (!bars.length) return null;
  const last = bars[bars.length - 1]!;
  const prev1 = bars[bars.length - 2];
  const prev5 = bars[bars.length - 6];
  const prev22 = bars[bars.length - 23];
  return {
    symbol,
    latest_close: last.close,
    latest_time: new Date(last.time * 1000).toISOString(),
    change_pct_1d: pctChange(last.close, prev1?.close),
    change_pct_1w: pctChange(last.close, prev5?.close),
    change_pct_1m: pctChange(last.close, prev22?.close),
  };
}

export const indicesTool = tool(
  "macro_indices",
  "Snapshot of major Vietnamese indices (VNINDEX, VN30, HNXINDEX, HNX30, UPCOMINDEX): latest close + 1-day / 1-week / 1-month % change. Use this to gauge overall market regime before recommending action on individual tickers.",
  {
    indices: z
      .array(z.enum(INDICES))
      .default(["VNINDEX", "VN30", "HNXINDEX", "UPCOMINDEX"]),
  },
  async ({ indices }) => {
    const out = await cached(
      `macro:indices:${indices.sort().join(",")}:${Math.floor(Date.now() / 60000 / 5)}`,
      300,
      async () => Promise.all(indices.map(snapshotIndex)),
    );
    return asText({ snapshots: out.filter(Boolean) });
  },
);

export const foreignFlowTool = tool(
  "foreign_flow",
  "Per-ticker foreign-investor flow from VNDirect: foreign buy/sell value (week-to-date) and foreign ownership %. Use to detect institutional accumulation or distribution. Volumes are share counts; values are VND.",
  {
    symbol: z.string().describe("Ticker, e.g. HPG"),
  },
  async ({ symbol }) => {
    const ticker = symbol.toUpperCase();
    const out = await cached(
      `macro:foreign:${ticker}:${Math.floor(Date.now() / 60000 / 5)}`,
      300,
      async () => {
        const codes = [
          "FOREIGN_BUY_VALUE_CR_WTD",
          "FOREIGN_SELL_VALUE_CR_WTD",
          "FOREIGN_BUY_VOLUME_CR_WTD",
          "FOREIGN_SELL_VOLUME_CR_WTD",
          "FOREIGN_OWNERSHIP",
        ];
        const results = await Promise.all(
          codes.map((c) => getRatio(ticker, c, 1).catch(() => [])),
        );
        const [buyVal, sellVal, buyVol, sellVol, ownership] = results;
        const get = (a: { value: number }[]) => (a[0] ? a[0].value : null);
        const bv = get(buyVal);
        const sv = get(sellVal);
        return {
          ticker,
          foreign_buy_value_vnd_wtd: bv,
          foreign_sell_value_vnd_wtd: sv,
          foreign_net_value_vnd_wtd: bv != null && sv != null ? bv - sv : null,
          foreign_buy_volume_wtd: get(buyVol),
          foreign_sell_volume_wtd: get(sellVol),
          foreign_ownership_pct: get(ownership),
          report_date: buyVal[0]?.reportDate ?? null,
        };
      },
    );
    return asText(out);
  },
);
