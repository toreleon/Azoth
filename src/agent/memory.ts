/**
 * Layered agent memory.
 *
 * - `mid`: rolling observations (regime notes, recent failure modes) that
 *   decay quickly. Top-K=5 surfaced into the prompt.
 * - `long`: durable lessons committed by the reflector across runs. Top-K=10.
 *
 * Working memory (this turn's tool output) is not stored here — it lives in
 * the SDK conversation. Initial scoring is keyword/recency-based; embeddings
 * are out of scope for the ~28 ticker universe.
 */
import { getDb } from "../storage/db.js";

export type MemoryLayer = "mid" | "long";

export interface MemoryEntry {
  id: number;
  profileId: string;
  layer: MemoryLayer;
  asOf: number;
  content: string;
  importance: number;
  createdAt: number;
}

export interface MemoryRetrievalOptions {
  asOfSec: number;
  /** Free-form query terms (regime tag, current ticker focus) for keyword scoring. */
  queryTerms?: string[];
  k?: number;
}

const HALF_LIFE_DAYS: Record<MemoryLayer, number> = {
  mid: 60,
  long: 365 * 2,
};

const DEFAULT_K: Record<MemoryLayer, number> = {
  mid: 5,
  long: 10,
};

export function recordMemory(
  profileId: string,
  layer: MemoryLayer,
  asOfSec: number,
  content: string,
  importance = 0.5,
): number {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const trimmed = content.trim();
  if (!trimmed) throw new Error("memory content is empty");
  const result = db
    .prepare(
      `INSERT INTO agent_memory (profile_id, layer, as_of, content, importance, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(profileId, layer, asOfSec, trimmed, importance, now);
  return Number(result.lastInsertRowid);
}

export function retrieveMemory(
  profileId: string,
  layer: MemoryLayer,
  opts: MemoryRetrievalOptions,
): MemoryEntry[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, profile_id, layer, as_of, content, importance, created_at
         FROM agent_memory
        WHERE profile_id = ? AND layer = ? AND as_of <= ?`,
    )
    .all(profileId, layer, opts.asOfSec) as Array<{
    id: number;
    profile_id: string;
    layer: MemoryLayer;
    as_of: number;
    content: string;
    importance: number;
    created_at: number;
  }>;

  const halfLifeSec = HALF_LIFE_DAYS[layer] * 86400;
  const queryLower = (opts.queryTerms ?? []).map((t) => t.toLowerCase()).filter(Boolean);

  const scored = rows.map((r) => {
    const ageSec = Math.max(0, opts.asOfSec - r.as_of);
    const recency = Math.pow(0.5, ageSec / halfLifeSec);
    const lower = r.content.toLowerCase();
    const hits = queryLower.filter((q) => lower.includes(q)).length;
    const relevance = queryLower.length === 0 ? 1 : 1 + hits;
    const score = r.importance * recency * relevance;
    return {
      entry: {
        id: r.id,
        profileId: r.profile_id,
        layer: r.layer,
        asOf: r.as_of,
        content: r.content,
        importance: r.importance,
        createdAt: r.created_at,
      } satisfies MemoryEntry,
      score,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const k = opts.k ?? DEFAULT_K[layer];
  return scored.slice(0, k).map((s) => s.entry);
}

export interface RenderedMemory {
  mid: MemoryEntry[];
  long: MemoryEntry[];
}

export function renderMemoryPrompt(mem: RenderedMemory): string {
  const parts: string[] = [];
  if (mem.long.length > 0) {
    parts.push("Lessons (long-term):");
    for (const e of mem.long) parts.push(`- ${e.content}`);
  }
  if (mem.mid.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push("Recent observations (mid-term):");
    for (const e of mem.mid) parts.push(`- ${e.content}`);
  }
  return parts.join("\n");
}

export function loadTurnMemory(
  profileId: string,
  asOfSec: number,
  queryTerms?: string[],
): RenderedMemory {
  return {
    mid: retrieveMemory(profileId, "mid", { asOfSec, queryTerms }),
    long: retrieveMemory(profileId, "long", { asOfSec, queryTerms }),
  };
}
