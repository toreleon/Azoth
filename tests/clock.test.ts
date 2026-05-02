/**
 * Lookahead-discipline test. The harness's safety guarantee is that any tool
 * call dispatched while the as-of clock is set returns no bar with time
 * greater than the simulated date. If this fails, the backtest is lying.
 */
import { describe, expect, it } from "vitest";
import { asOfClock, setActiveAsOf, nowSec } from "../src/agent/clock.js";
import { getStockOhlcv, getIndexOhlcv } from "../src/data/sources/dnsePublic.js";

const DAY = 86400;

describe("as-of clock", () => {
  it("nowSec falls through to wall-clock with no override", () => {
    const wall = Math.floor(Date.now() / 1000);
    const got = nowSec();
    expect(Math.abs(got - wall)).toBeLessThan(2);
  });

  it("nowSec respects ALS context", () => {
    const t = 1_700_000_000;
    asOfClock.run({ asOfSec: t }, () => {
      expect(nowSec()).toBe(t);
    });
  });

  it("nowSec respects module-level override (cross-async)", async () => {
    const t = 1_700_000_000;
    setActiveAsOf({ asOfSec: t });
    try {
      await new Promise((r) => setTimeout(r, 5));
      expect(nowSec()).toBe(t);
    } finally {
      setActiveAsOf(null);
    }
  });
});

describe("OHLCV lookahead clamp", () => {
  it("getStockOhlcv returns no bar after asOfSec", async () => {
    const asOf = Math.floor(Date.parse("2025-03-01T15:00:00+07:00") / 1000);
    setActiveAsOf({ asOfSec: asOf });
    try {
      const bars = await getStockOhlcv("HPG", "1D", asOf - 90 * DAY, asOf + 90 * DAY);
      expect(bars.length).toBeGreaterThan(0);
      for (const b of bars) {
        expect(b.time).toBeLessThanOrEqual(asOf);
      }
    } finally {
      setActiveAsOf(null);
    }
  }, 30_000);

  it("getIndexOhlcv VNINDEX returns no bar after asOfSec", async () => {
    const asOf = Math.floor(Date.parse("2025-03-01T15:00:00+07:00") / 1000);
    setActiveAsOf({ asOfSec: asOf });
    try {
      const bars = await getIndexOhlcv("VNINDEX", "1D", asOf - 90 * DAY, asOf + 90 * DAY);
      expect(bars.length).toBeGreaterThan(0);
      for (const b of bars) {
        expect(b.time).toBeLessThanOrEqual(asOf);
      }
    } finally {
      setActiveAsOf(null);
    }
  }, 30_000);

  it("no clamp when override is unset", async () => {
    const bars = await getStockOhlcv("HPG", "1D", Math.floor(Date.now() / 1000) - 30 * DAY, Math.floor(Date.now() / 1000));
    expect(bars.length).toBeGreaterThan(0);
  }, 30_000);
});
