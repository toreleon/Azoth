import { getDb } from "../storage/db.js";
import { isAsOfOverridden, asOfClock, nowSec } from "../agent/clock.js";

const inflight = new Map<string, Promise<unknown>>();

const stats = {
  hits: 0,
  misses: 0,
  inflight_collapses: 0,
};

export function getCacheStats() {
  return { ...stats };
}

export function resetCacheStats() {
  stats.hits = 0;
  stats.misses = 0;
  stats.inflight_collapses = 0;
}

/**
 * In backtest mode, prefix the key with the simulated as-of date so
 * cached payloads from different simulated sessions don't collide. Historical data
 * up to that as-of is immutable, so the prefix also unlocks safe reuse
 * across runs at the same as-of.
 */
function namespaced(key: string): string {
  if (asOfClock.getStore()?.asOfSec != null || isAsOfOverridden()) {
    const day = new Date(nowSec() * 1000).toISOString().slice(0, 10);
    return `asof=${day}|${key}`;
  }
  return key;
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const nsKey = namespaced(key);

  const existing = inflight.get(nsKey) as Promise<T> | undefined;
  if (existing) {
    stats.inflight_collapses++;
    return existing;
  }

  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const row = db
    .prepare("SELECT value, expires_at FROM kv_cache WHERE key = ?")
    .get(nsKey) as { value: string; expires_at: number } | undefined;

  if (row && row.expires_at > now) {
    stats.hits++;
    return JSON.parse(row.value) as T;
  }

  stats.misses++;

  const p = (async () => {
    const value = await fetcher();
    const effectiveTtl = isAsOfOverridden() || asOfClock.getStore()?.asOfSec != null
      ? Number.MAX_SAFE_INTEGER
      : ttlSeconds;
    const expiresAt =
      effectiveTtl >= Number.MAX_SAFE_INTEGER - now
        ? Number.MAX_SAFE_INTEGER
        : now + effectiveTtl;
    db.prepare(
      "INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, ?)",
    ).run(nsKey, JSON.stringify(value), expiresAt);
    return value;
  })().finally(() => {
    inflight.delete(nsKey);
  });

  inflight.set(nsKey, p);
  return p;
}
