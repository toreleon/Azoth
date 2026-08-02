import { describe, it, expect } from "vitest";
import { seriesToBars, OhlcvSeries } from "../../../src/data/sources/dnsePublic.js";

describe("dnsePublic", () => {
  describe("seriesToBars", () => {
    it("converts OhlcvSeries to Bar[]", () => {
      const series: OhlcvSeries = {
        t: [1000, 2000],
        o: [10, 20],
        h: [15, 25],
        l: [5, 15],
        c: [12, 22],
        v: [100, 200],
      };

      const bars = seriesToBars(series);

      expect(bars).toEqual([
        { time: 1000, open: 10, high: 15, low: 5, close: 12, volume: 100 },
        { time: 2000, open: 20, high: 25, low: 15, close: 22, volume: 200 },
      ]);
    });

    it("handles empty series", () => {
      const series: OhlcvSeries = {
        t: [],
        o: [],
        h: [],
        l: [],
        c: [],
        v: [],
      };

      const bars = seriesToBars(series);

      expect(bars).toEqual([]);
    });

    it("skips intraday slots where close is null", () => {
      const series: OhlcvSeries = {
        t: [1000, 2000, 3000],
        o: [10, 20, 30],
        h: [15, 25, 35],
        l: [5, 15, 25],
        c: [12, null as unknown as number, 32],
        v: [100, 200, 300],
      };

      const bars = seriesToBars(series);

      expect(bars).toEqual([
        { time: 1000, open: 10, high: 15, low: 5, close: 12, volume: 100 },
        { time: 3000, open: 30, high: 35, low: 25, close: 32, volume: 300 },
      ]);
    });
  });
});
