import { describe, expect, it, vi, beforeEach } from "vitest";
import { getCacheStats, resetCacheStats, cached } from "../src/data/cache.js";
import { getDb } from "../src/storage/db.js";

// Mock the DB
vi.mock("../src/storage/db.js", () => {
  return {
    getDb: vi.fn(),
  };
});

describe("cache stats", () => {
  beforeEach(() => {
    resetCacheStats();
    vi.clearAllMocks();
  });

  it("getCacheStats returns initial stats", () => {
    const stats = getCacheStats();
    expect(stats).toEqual({
      hits: 0,
      misses: 0,
      inflight_collapses: 0,
    });
  });

  it("getCacheStats returns a copy of the stats, not a reference", () => {
    const stats = getCacheStats();
    stats.hits = 999;

    const newStats = getCacheStats();
    expect(newStats.hits).toBe(0); // The internal stats should not be affected
  });

  it("resetCacheStats correctly resets mutated stats", async () => {
    // We need to mutate the stats by simulating a miss, hit, and inflight collapse
    const dbMock = {
      prepare: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue(undefined), // Simulating a miss
        run: vi.fn(),
      }),
    };
    (getDb as any).mockReturnValue(dbMock);

    // Trigger a miss and inflight collapse
    const fetcher1 = vi.fn().mockResolvedValue("value1");

    const p1 = cached("key1", 60, fetcher1);
    const p2 = cached("key1", 60, fetcher1); // Should trigger inflight collapse

    await Promise.all([p1, p2]);

    let currentStats = getCacheStats();
    expect(currentStats.misses).toBe(1);
    expect(currentStats.inflight_collapses).toBe(1);
    expect(currentStats.hits).toBe(0);

    // Now simulate a hit
    dbMock.prepare = vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ value: JSON.stringify("value2"), expires_at: Math.floor(Date.now() / 1000) + 100 }), // Simulating a hit
    });

    await cached("key2", 60, fetcher1);

    currentStats = getCacheStats();
    expect(currentStats.hits).toBe(1);

    // Reset the stats
    resetCacheStats();
    currentStats = getCacheStats();
    expect(currentStats).toEqual({
      hits: 0,
      misses: 0,
      inflight_collapses: 0,
    });
  });
});
