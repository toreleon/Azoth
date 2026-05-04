import { describe, expect, it, vi } from "vitest";

const requestedSymbols: string[] = [];

const seriesByTicker: Record<string, Array<{ close: number; volume: number }>> = {
  AAA: makeSeries(10, 1_000_000),
  BBB: makeSeries(20, 1_000_000, -0.2),
  CCC: makeSeries(30, 1_000_000, 0.4),
  DDD: makeSeries(40, 1_000_000),
};

vi.mock("../src/data/cache.js", () => ({
  cached: (_key: string, _ttl: number, fn: () => unknown) => fn(),
}));

vi.mock("../src/data/sources/vndirectFinfo.js", () => ({
  getListedEquityTickers: vi.fn(async () => ["AAA", "BBB", "CCC"]),
}));

vi.mock("../src/data/sources/dnsePublic.js", () => ({
  getStockOhlcv: vi.fn(async (ticker: string) => {
    requestedSymbols.push(ticker);
    return (seriesByTicker[ticker] ?? makeSeries(10, 1_000_000)).map((b, i) => ({
      time: i + 1,
      open: b.close,
      high: b.close,
      low: b.close,
      close: b.close,
      volume: b.volume,
    }));
  }),
}));

function makeSeries(
  start: number,
  volume: number,
  dailyStep = 0.1,
): Array<{ close: number; volume: number }> {
  return Array.from({ length: 30 }, (_, i) => ({
    close: start + i * dailyStep,
    volume,
  }));
}

describe("discoverTickers", () => {
  it("uses explicit ticker baskets instead of a fixed universe", async () => {
    requestedSymbols.length = 0;
    const { discoverTickers } = await import("../src/tools/discover.js");

    const result = await discoverTickers({
      criterion: "top_gainers",
      tickers: ["ccc", " ddd ", "CCC"],
      limit: 3,
    });

    expect(result.universe).toBe("custom");
    expect(result.universe_size).toBe(2);
    expect(requestedSymbols.sort()).toEqual(["CCC", "DDD"]);
    expect(result.candidates.map((c) => c.ticker)).toEqual(["CCC", "DDD"]);
  });

  it("defaults to listed equities and maps strategy aliases to criteria", async () => {
    requestedSymbols.length = 0;
    const { discoverTickers } = await import("../src/tools/discover.js");

    const result = await discoverTickers({
      strategy: "mean_reversion",
      limit: 3,
    });

    expect(result.criterion).toBe("oversold");
    expect(result.universe).toBe("all_listed");
    expect(requestedSymbols.sort()).toEqual(["AAA", "BBB", "CCC"]);
  });
});
