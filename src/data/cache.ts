import type { Database, Statement } from "better-sqlite3";
import { getDb } from "../storage/db.js";
import { isAsOfOverridden, asOfClock, nowSec } from "../agent/clock.js";

const inflight = new Map<string, Promise<unknown>>();

let _cachedDb: Database | null = null;
let _getStmt: Statement | null = null;
let _setStmt: Statement | null = null;

function getStmts(db: Database) {
  if (db !== _cachedDb) {
    _cachedDb = db;
    _getStmt = db.prepare("SELECT value, expires_at FROM kv_cache WHERE key = ?");
    _setStmt = db.prepare("INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, ?)");
  }
  return { getStmt: _getStmt!, setStmt: _setStmt! };
}

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
    // ⚡ Bolt: Optimize cache key generation by replacing slow Date/String
    // allocations (new Date(...).toISOString().slice(0, 10)) with integer math,
    // grouping by UTC day since epoch to maintain the same invalidation semantics.
    const day = Math.floor(nowSec() / 86400);
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
  const { getStmt, setStmt } = getStmts(db);
  const now = Math.floor(Date.now() / 1000);

  const row = getStmt.get(nsKey) as { value: string; expires_at: number } | undefined;

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
    setStmt.run(nsKey, JSON.stringify(value), expiresAt);
    return value;
  })().finally(() => {
    inflight.delete(nsKey);
  });

  inflight.set(nsKey, p);
  return p;
}
