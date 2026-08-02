import { describe, expect, it } from "vitest";
import { formatTokens, truncate } from "../src/tui/lib/format.js";

describe("truncate", () => {
  it("returns the original string if it is shorter than the limit", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("returns the original string if its length is exactly the limit", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });

  it("truncates and appends an ellipsis if the string is longer than the limit", () => {
    expect(truncate("hello world", 5)).toBe("hell…");
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("handles empty strings correctly", () => {
    expect(truncate("", 5)).toBe("");
    expect(truncate("", 0)).toBe("");
  });

  it("handles limit of 0 correctly", () => {
    expect(truncate("hello", 0)).toBe("…");
  });

  it("handles limit of 1 correctly", () => {
    expect(truncate("hello", 1)).toBe("…");
  });

  it("handles negative limits correctly", () => {
    expect(truncate("hello", -5)).toBe("…");
  });
});

describe("formatTokens", () => {
  it('returns "0" for null', () => {
    expect(formatTokens(null)).toBe("0");
  });

  it('returns "0" for undefined', () => {
    expect(formatTokens(undefined)).toBe("0");
  });

  it("formats values less than 1000 as strings without k suffix", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(5)).toBe("5");
    expect(formatTokens(999)).toBe("999");
    expect(formatTokens(999.9)).toBe("999.9");
  });

  it("formats values greater than or equal to 1000 with a k suffix", () => {
    expect(formatTokens(1000)).toBe("1.0k");
    expect(formatTokens(1500)).toBe("1.5k");
    expect(formatTokens(1550)).toBe("1.6k");
    expect(formatTokens(10000)).toBe("10.0k");
    expect(formatTokens(1234567)).toBe("1234.6k");
  });
});
