import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { cached } from "../data/cache.js";
import {
  getTickerNews,
  parseCafefDate,
  type CafefNewsItem,
} from "../data/sources/cafef.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

const NEWS_TTL = 15 * 60; // 15 min

function absUrl(u?: string): string | undefined {
  if (!u) return undefined;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://cafef.vn${u.startsWith("/") ? "" : "/"}${u}`;
}

function shapeItem(n: CafefNewsItem) {
  return {
    title: n.Title,
    url: absUrl(n.LinkDetail ?? n.Url),
    publishedAt: parseCafefDate(n.DeployDate ?? n.PublishDate),
    source: n.Source,
    snippet: n.SubTitle?.slice(0, 280),
    type: n.NewsType,
  };
}

export const newsTool = tool(
  "ticker_news",
  "Fetch recent news for a Vietnamese stock ticker from CafeF. Use this to surface catalysts, earnings, regulatory events, or sector news that could affect a decision. Returns up to `limit` recent articles with title, URL, source, publish date, and snippet.",
  {
    symbol: z.string().describe("Ticker, e.g. HPG"),
    limit: z.number().int().min(1).max(40).default(15),
    include: z
      .array(z.enum(["news", "industry", "disclosure"]))
      .default(["news", "disclosure"])
      .describe(
        "What kinds of items to include: 'news' = general news, 'industry' = sector news, 'disclosure' = company internal disclosures (TTNB).",
      ),
  },
  async ({ symbol, limit, include }) => {
    const ticker = symbol.toUpperCase();
    const result = await cached(
      `news:${ticker}:${limit}:${include.sort().join(",")}`,
      NEWS_TTL,
      async () => {
        const buckets: Promise<CafefNewsItem[]>[] = [];
        if (include.includes("news")) buckets.push(getTickerNews(ticker, 0, limit));
        if (include.includes("industry")) buckets.push(getTickerNews(ticker, 96, limit));
        if (include.includes("disclosure")) buckets.push(getTickerNews(ticker, 97, limit));
        const all = (await Promise.all(buckets)).flat();
        // Dedup by Title+Url, sort by publishedAt desc.
        const seen = new Set<string>();
        const merged: CafefNewsItem[] = [];
        for (const item of all) {
          const key = `${item.Title}|${item.LinkDetail ?? item.Url ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(item);
        }
        merged.sort((a, b) => {
          const ka = parseCafefDate(a.DeployDate ?? a.PublishDate) ?? "";
          const kb = parseCafefDate(b.DeployDate ?? b.PublishDate) ?? "";
          return kb.localeCompare(ka);
        });
        return merged.slice(0, limit).map(shapeItem);
      },
    );
    return asText({ ticker, count: result.length, items: result });
  },
);
