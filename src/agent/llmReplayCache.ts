import { createHash } from "node:crypto";
import { getDb } from "../storage/db.js";

/**
 * Replay-mode LLM cache for backtest re-runs.
 *
 * When VNSTOCK_LLM_REPLAY=1 is set, every turn's full SDK message stream is
 * keyed (sha256 of model + profile ref + as-of + prompt + resume id) and stored
 * in `llm_response_cache`. Subsequent runs with the same key replay the
 * cached message stream verbatim — no LLM call, no broker mutation, no tool
 * dispatch happens. Use this only for analytics/metrics iteration; the
 * broker simulation is NOT re-validated on replay.
 */

const REPLAY_FLAG = "VNSTOCK_LLM_REPLAY";

function isReplayEnabled(): boolean {
  return process.env[REPLAY_FLAG] === "1";
}

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn(
    `[llm-replay] ${REPLAY_FLAG}=1 — replayed turns skip LLM + tool execution; broker state will NOT mutate on cache hits.`,
  );
}

export interface ReplayStream<M> extends AsyncIterable<M> {
  /** True if this stream is being served from cache (no live LLM call). */
  replayed: boolean;
}

export function replayOrRecord<M>(
  key: string,
  model: string,
  requestSummary: string,
  live: () => AsyncIterable<M>,
): ReplayStream<M> {
  if (!isReplayEnabled()) {
    return wrap(live(), false);
  }
  warnOnce();

  const hash = createHash("sha256").update(key).digest("hex");
  const db = getDb();
  const row = db
    .prepare("SELECT response_json FROM llm_response_cache WHERE key = ?")
    .get(hash) as { response_json: string } | undefined;

  if (row) {
    db.prepare("UPDATE llm_response_cache SET hit_count = hit_count + 1 WHERE key = ?").run(hash);
    const messages = (JSON.parse(row.response_json) as unknown[]) as M[];
    return wrap(replayIterable(messages), true);
  }

  // Miss: run live, buffer, then persist on completion.
  return wrap(recordIterable(hash, model, requestSummary, live()), false);
}

function wrap<M>(it: AsyncIterable<M>, replayed: boolean): ReplayStream<M> {
  return Object.assign(it, { replayed }) as ReplayStream<M>;
}

async function* replayIterable<M>(messages: M[]): AsyncIterable<M> {
  for (const m of messages) yield m;
}

async function* recordIterable<M>(
  hash: string,
  model: string,
  requestSummary: string,
  source: AsyncIterable<M>,
): AsyncIterable<M> {
  const buf: M[] = [];
  for await (const m of source) {
    buf.push(m);
    yield m;
  }
  try {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO llm_response_cache
         (key, model, request_json, response_json, created_at, hit_count)
       VALUES (?, ?, ?, ?, ?, 0)`,
    ).run(hash, model, requestSummary, JSON.stringify(buf), Math.floor(Date.now() / 1000));
  } catch (err) {
    console.warn(`[llm-replay] failed to persist cache row: ${(err as Error).message}`);
  }
}
