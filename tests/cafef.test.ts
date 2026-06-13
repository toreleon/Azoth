import { describe, it, expect } from "vitest";
import { parseCafefDate } from "../src/data/sources/cafef.js";

describe("parseCafefDate", () => {
  it("should return undefined for empty inputs", () => {
    expect(parseCafefDate(undefined)).toBeUndefined();
    expect(parseCafefDate("")).toBeUndefined();
  });

  it("should parse Microsoft date format correctly", () => {
    const timestamp = 1777512060000;
    const input = `/Date(${timestamp})/`;
    const expected = new Date(timestamp).toISOString();
    expect(parseCafefDate(input)).toBe(expected);
  });

  it("should parse normal date strings and return ISO string", () => {
    const input = "2024-05-15T10:30:00Z";
    const expected = new Date(input).toISOString();
    expect(parseCafefDate(input)).toBe(expected);
  });

  it("should return the original string if it is an invalid date string", () => {
    const input = "invalid-date-string";
    expect(parseCafefDate(input)).toBe(input);
  });

  it("should handle already ISO-ish strings correctly", () => {
    const input = "2023-12-01";
    const expected = new Date(input).toISOString();
    expect(parseCafefDate(input)).toBe(expected);
  });
});
