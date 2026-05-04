import { describe, expect, it } from "vitest";
import { checkVnMarketSession } from "../src/risk/vnMarketSession.js";

describe("Vietnam market session checks", () => {
  it("accepts morning continuous trading time", () => {
    const result = checkVnMarketSession(new Date("2026-05-04T03:00:00.000Z"));
    expect(result.open).toBe(true);
    expect(result.session).toBe("morning");
  });

  it("rejects lunch break", () => {
    const result = checkVnMarketSession(new Date("2026-05-04T05:00:00.000Z"));
    expect(result.open).toBe(false);
    expect(result.reason).toContain("outside");
  });

  it("rejects exchange holidays", () => {
    const result = checkVnMarketSession(new Date("2026-05-01T03:00:00.000Z"));
    expect(result.open).toBe(false);
    expect(result.reason).toContain("holiday");
  });
});

