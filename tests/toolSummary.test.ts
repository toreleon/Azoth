import { describe, it, expect } from "vitest";
import { summarizeToolInput } from "../src/tui/lib/toolSummary.js";

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
