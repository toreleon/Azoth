import { describe, expect, it } from "vitest";
import { truncate } from "../src/tui/lib/format.js";

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
