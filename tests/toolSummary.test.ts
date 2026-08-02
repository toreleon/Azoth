import { describe, expect, it } from "vitest";
import { summarizeToolInput, summarizeToolResult } from "../src/tui/lib/toolSummary.js";

describe("summarizeToolInput", () => {
  it("returns empty string for undefined or empty input", () => {
    expect(summarizeToolInput(undefined)).toBe("");
    expect(summarizeToolInput("")).toBe("");
  });

  it("truncates invalid JSON or non-object JSON", () => {
    expect(summarizeToolInput("just a string")).toBe("just a string");
    expect(summarizeToolInput("123")).toBe("123");
    expect(summarizeToolInput("true")).toBe("true");

    const longString = "this is a very long string that should eventually be truncated because it exceeds the sixty character limit";
    expect(summarizeToolInput(longString)).toBe("this is a very long string that should eventually be trunca…");
  });

  it("extracts single ticker/symbol", () => {
    expect(summarizeToolInput(JSON.stringify({ ticker: "VND" }))).toBe("VND");
    expect(summarizeToolInput(JSON.stringify({ symbol: "SSI" }))).toBe("SSI");
    expect(summarizeToolInput(JSON.stringify({ tickers: "FPT" }))).toBe("FPT");
    expect(summarizeToolInput(JSON.stringify({ symbols: "HPG" }))).toBe("HPG");
  });

  it("truncates array of tickers/symbols to max 3", () => {
    expect(summarizeToolInput(JSON.stringify({ symbols: ["VND", "SSI", "FPT", "HPG"] }))).toBe("VND,SSI,FPT");
    expect(summarizeToolInput(JSON.stringify({ tickers: ["VND", "SSI"] }))).toBe("VND,SSI");
  });

  it("extracts timeframe or interval", () => {
    expect(summarizeToolInput(JSON.stringify({ interval: "1D" }))).toBe("1D");
    expect(summarizeToolInput(JSON.stringify({ ticker: "VND", timeframe: "1W" }))).toBe("VND 1W");
  });

  it("extracts criterion and limit", () => {
    expect(summarizeToolInput(JSON.stringify({ criterion: "volume", limit: 10 }))).toBe("volume n=10");
  });

  it("combines multiple extracted fields", () => {
    expect(
      summarizeToolInput(JSON.stringify({ ticker: "VND", interval: "1D", criterion: "rsi", limit: 5 }))
    ).toBe("VND 1D rsi n=5");
  });

  it("falls back to first 3 keys for unhandled objects", () => {
    expect(
      summarizeToolInput(JSON.stringify({ foo: "bar", baz: 123, qux: true }))
    ).toBe('foo="bar" baz=123 qux=true');
    expect(
      summarizeToolInput(JSON.stringify({ a: 1, b: 2, c: 3, d: 4 }))
    ).toBe("a=1 b=2 c=3");
  });

  it("truncates fallback string if it exceeds 60 characters", () => {
    const obj = {
      veryLongKeyNameThatWillTakeUpSpace: "some equally long value that pushes it over the limit",
      anotherKey: "value"
    };
    expect(summarizeToolInput(JSON.stringify(obj))).toBe(
      'veryLongKeyNameThatWillTakeUpSpace="some equally long value…'
    );
  });
});

describe("summarizeToolResult", () => {
  it("returns empty string for missing or empty raw input", () => {
    expect(summarizeToolResult("market_quote", undefined)).toBe("");
    expect(summarizeToolResult("market_quote", "")).toBe("");
  });

  it("returns truncated plain text for invalid JSON", () => {
    const invalidJson = "This is a plain text response from the tool that should just be truncated normally without crashing.";
    expect(summarizeToolResult("market_quote", invalidJson)).toBe("This is a plain text response from the tool that should just be truncated norma…");
  });

  describe("market_quote", () => {
    it("handles standard quote with calculated change", () => {
      const raw = JSON.stringify({ quote: { ticker: "FPT", last: 100, ref: 90 } });
      expect(summarizeToolResult("market_quote", raw)).toBe("FPT  100.00  +11.11%");
    });

    it("handles quote with direct change pct", () => {
      const raw = JSON.stringify({ ticker: "FPT", price: 100, change_pct: 5.5 });
      expect(summarizeToolResult("market_quote", raw)).toBe("FPT  100.00  +5.50%");
    });
  });

  describe("market_ohlcv", () => {
    it("summarizes bars", () => {
      const raw = JSON.stringify({
        bars: [
          { close: 90, volume: 1000 },
          { close: 100, volume: 2500000 },
        ],
      });
      expect(summarizeToolResult("market_ohlcv", raw)).toBe("2 bars · last 100.00 vol 2.5M");
    });

    it("handles empty bars", () => {
      const raw = JSON.stringify({ bars: [] });
      expect(summarizeToolResult("market_ohlcv", raw)).toBe("bars:[]");
    });
  });

  describe("technical_indicators", () => {
    it("summarizes indicators", () => {
      const raw = JSON.stringify({ rsi: 65.432, macd_hist: -0.123 });
      expect(summarizeToolResult("technical_indicators", raw)).toBe("rsi 65.4 · macd -0.12");
    });
  });

  describe("fundamentals_snapshot", () => {
    it("summarizes fundamentals", () => {
      const raw = JSON.stringify({ pe: 12.34, pb: 2.34, roe: 15.67 });
      expect(summarizeToolResult("fundamentals_snapshot", raw)).toBe("pe 12.3 · pb 2.3 · roe 15.7%");
    });
  });

  describe("ticker_news", () => {
    it("summarizes headlines", () => {
      const raw = JSON.stringify({
        items: [
          { title: "Very long headline that should be truncated to fit nicely" },
          { title: "Another news item" },
        ],
      });
      expect(summarizeToolResult("ticker_news", raw)).toBe("2 headlines · Very long headline that should be truncated to fi…");
    });
  });

  describe("foreign_flow", () => {
    it("summarizes foreign flow", () => {
      const raw = JSON.stringify({ net: 1500000000, foreign_ownership_pct: 49.5 });
      expect(summarizeToolResult("foreign_flow", raw)).toBe("net 1.50B · own 49.5%");
    });
  });

  describe("macro_indices", () => {
    it("summarizes specific index (VNINDEX)", () => {
      const raw = JSON.stringify([
        { symbol: "HNX", latest_close: 200, change_pct_1d: -1.2 },
        { symbol: "VNINDEX", latest_close: 1200, change_pct_1d: 1.5 },
      ]);
      expect(summarizeToolResult("macro_indices", raw)).toBe("VNINDEX 1200.00 +1.50%");
    });

    it("falls back to first index if VNINDEX not found", () => {
      const raw = JSON.stringify([{ symbol: "HNX", latest_close: 200, change_pct_1d: -1.2 }]);
      expect(summarizeToolResult("macro_indices", raw)).toBe("HNX 200.00 -1.20%");
    });
  });

  describe("discover_tickers", () => {
    it("summarizes candidate tickers", () => {
      const raw = JSON.stringify([
        { ticker: "FPT" },
        { ticker: "VNM" },
        { ticker: "VCB" },
        { ticker: "HPG" },
        { ticker: "TCB" },
      ]);
      expect(summarizeToolResult("discover_tickers", raw)).toBe("5 tickers · FPT, VNM, VCB, HPG");
    });
  });

  describe("broker_state", () => {
    it("summarizes broker state", () => {
      const raw = JSON.stringify({ cash: 5000000, positions: [{}, {}] });
      expect(summarizeToolResult("broker_state", raw)).toBe("cash 5.0M · 2 positions");
    });
  });

  describe("portfolio_list", () => {
    it("summarizes portfolio list", () => {
      const raw = JSON.stringify({
        totals: { market_value_vnd: 150000000 },
        cash_vnd: 25000000,
        positions: [{}, {}, {}],
      });
      expect(summarizeToolResult("portfolio_list", raw)).toBe("equity 150.0M · cash 25.0M · 3 positions");
    });
  });

  describe("account_history", () => {
    it("summarizes account history", () => {
      const raw = JSON.stringify({ orders: 5, fills: 3, transactions: 10, rights: 1 });
      expect(summarizeToolResult("account_history", raw)).toBe("orders 5 · fills 3 · tx 10 · rights 1");
    });
  });

  it("falls back to raw JSON string for unknown tool names", () => {
    const raw = JSON.stringify({ customField: 123, anotherField: "value" });
    expect(summarizeToolResult("unknown_tool", raw)).toBe("customField:123,anotherField:value");
  });
});
