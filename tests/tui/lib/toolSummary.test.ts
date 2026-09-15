import { describe, expect, it } from "vitest";
import { summarizeToolResult } from "../../../src/tui/lib/toolSummary.js";

describe("summarizeToolResult", () => {
  it("returns empty string if raw is undefined or empty", () => {
    expect(summarizeToolResult("market_quote", undefined)).toBe("");
    expect(summarizeToolResult("market_quote", "")).toBe("");
  });

  it("truncates safe string if raw is invalid JSON", () => {
    const raw = "invalid json " + "a".repeat(100);
    const result = summarizeToolResult("market_quote", raw);
    expect(result.length).toBeLessThanOrEqual(80);
    expect(result).toContain("invalid json");
  });

  it("returns flattened object string for unknown tool names", () => {
    const result = summarizeToolResult("unknown_tool", JSON.stringify({ a: 1, b: "test" }));
    expect(result).toBe("a:1,b:test");
  });

  it("formats market_quote", () => {
    const q = { ticker: "AAPL", close: 150, ref: 145 };
    const result = summarizeToolResult("market_quote", JSON.stringify(q));
    expect(result).toBe("AAPL  150.00  +3.45%");

    const q2 = { quote: { ticker: "MSFT", price: 300, change_pct: -1.5 } };
    const result2 = summarizeToolResult("market_quote", JSON.stringify(q2));
    expect(result2).toBe("MSFT  300.00  -1.50%");
  });

  it("formats market_ohlcv", () => {
    const bars = [{ close: 140, volume: 1000 }, { close: 150, volume: 1500000 }];
    const result = summarizeToolResult("market_ohlcv", JSON.stringify({ bars }));
    expect(result).toBe("2 bars · last 150.00 vol 1.5M");
  });

  it("formats technical_indicators", () => {
    const ind = { rsi14: 65.432, macd: { hist: 1.234 } };
    const result = summarizeToolResult("technical_indicators", JSON.stringify(ind));
    expect(result).toBe("rsi 65.4 · macd 1.23");
  });

  it("formats fundamentals_snapshot", () => {
    const f = { pe: 15.56, pb: 2.34, roe: 18.91 };
    const result = summarizeToolResult("fundamentals_snapshot", JSON.stringify(f));
    expect(result).toBe("pe 15.6 · pb 2.3 · roe 18.9%");
  });

  it("formats ticker_news", () => {
    const items = [{ title: "Apple announces new iPhone" }, { title: "Stock drops" }];
    const result = summarizeToolResult("ticker_news", JSON.stringify({ items }));
    expect(result).toBe("2 headlines · Apple announces new iPhone");
  });

  it("formats foreign_flow", () => {
    const flow = { foreign_net_value_vnd_wtd: -1500000000, foreign_ownership_pct: 12.34 };
    const result = summarizeToolResult("foreign_flow", JSON.stringify(flow));
    expect(result).toBe("net -1.50B · own 12.3%");
  });

  it("formats macro_indices", () => {
    const indices = [
      { symbol: "HNX", latest_close: 200, change_pct_1d: 0.5 },
      { symbol: "VNINDEX", latest_close: 1200, change_pct_1d: -1.2 },
    ];
    const result = summarizeToolResult("macro_indices", JSON.stringify(indices));
    expect(result).toBe("VNINDEX 1200.00 -1.20%");
  });

  it("formats discover_tickers", () => {
    const candidates = [{ ticker: "AAPL" }, { ticker: "MSFT" }, { ticker: "GOOG" }, { ticker: "AMZN" }, { ticker: "TSLA" }];
    const result = summarizeToolResult("discover_tickers", JSON.stringify({ candidates }));
    expect(result).toBe("5 tickers · AAPL, MSFT, GOOG, AMZN");
  });

  it("formats broker_state", () => {
    const state = { cashVnd: 5000000, positions: [1, 2, 3] };
    const result = summarizeToolResult("broker_state", JSON.stringify(state));
    expect(result).toBe("cash 5.0M · 3 positions");
  });

  it("formats portfolio_list", () => {
    const list = { total_equity_vnd: 15000000, cash_vnd: 2000000, positions: [1, 2] };
    const result = summarizeToolResult("portfolio_list", JSON.stringify(list));
    expect(result).toBe("equity 15.0M · cash 2.0M · 2 positions");
  });

  it("formats account_history", () => {
    const history = { counts: { orders: 5, fills: 3, transactions: 10, rights: 0 } };
    const result = summarizeToolResult("account_history", JSON.stringify(history));
    expect(result).toBe("orders 5 · fills 3 · tx 10 · rights 0");
  });
});
