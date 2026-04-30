import { getDb } from "../storage/db.js";

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>,
): Promise<T> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);

  const row = db
    .prepare("SELECT value, expires_at FROM kv_cache WHERE key = ?")
    .get(key) as { value: string; expires_at: number } | undefined;

  if (row && row.expires_at > now) {
    return JSON.parse(row.value) as T;
  }

  const value = await fetcher();
  db.prepare(
    "INSERT OR REPLACE INTO kv_cache (key, value, expires_at) VALUES (?, ?, ?)",
  ).run(key, JSON.stringify(value), now + ttlSeconds);
  return value;
}
