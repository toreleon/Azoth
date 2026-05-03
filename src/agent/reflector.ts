/**
 * Reflector — turns a completed backtest run into a structured ProfileDiff,
 * applies it, and stores the resulting child profile.
 *
 * Runs offline (after the run finishes), with no MCP tools and a tight
 * JSON-output system prompt. Falls back to an empty diff (i.e. no version
 * bump) if the LLM output cannot be parsed; this keeps the pipeline robust
 * but means the caller must check the returned ref against the parent ref.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "../config/loader.js";
import { getDb } from "../storage/db.js";
import {
  applyProfileDiff,
  ProfileDiffSchema,
  profileRef,
  type AgentProfile,
  type ProfileDiff,
} from "./profile.js";
import { saveProfile } from "./profileStore.js";
import { recordMemory } from "./memory.js";

interface RunSnapshot {
  initialCash: number;
  finalMtm: number;
  finalBench: number;
  totalReturn: number;
  benchReturn: number;
  alpha: number;
  maxDD: number;
  weeks: number;
  trades: number;
}

const REFLECTOR_SYSTEM = [
  "You are the reflector for an automated trading harness.",
  "You receive (1) the AgentProfile JSON used in a completed backtest, (2) per-week equity, (3) the trade list, and (4) summary metrics.",
  "Your job: emit a single JSON object — a ProfileDiff — that meaningfully improves the next backtest.",
  "",
  "Strict output contract:",
  "- Reply with ONLY the JSON object, no prose, no code fences.",
  "- Allowed top-level keys: addRules (≤2 strings), removeRuleIndices (≤2 ints), paramDeltas (numeric deltas keyed by param name), addNotes (≤2 strings), personaTextRewrite (string), regimeUpsert (object).",
  "- paramDeltas keys must be one of: maxPositionPct, stopLossPct, cashFloorPct, maxNames, minHoldingWeeks, maxDrawdownFloor.",
  "- Values are DELTAS, not replacements. Keep magnitudes small (e.g. ±0.02 for percentages, ±1 for counts).",
  "- Only propose changes you can defend from the metrics or trade pattern. If the run is already strong, return {}.",
  "- Never widen risk (do not raise maxPositionPct or maxDrawdownFloor) unless alpha and Sharpe both clearly support it.",
].join("\n");

export interface ReflectionResult {
  parentRef: string;
  childRef: string;
  diff: ProfileDiff;
  changed: boolean;
  rawOutput: string;
}

function loadRunData(runId: string): {
  equity: { as_of: number; mtm_vnd: number; benchmark_mtm_vnd: number; cash_vnd: number }[];
  trades: { ticker: string; side: string; filled_price: number | null; filled_qty: number | null; created_at: number }[];
} {
  const db = getDb();
  const equity = db
    .prepare(
      `SELECT as_of, cash_vnd, mtm_vnd, benchmark_mtm_vnd FROM backtest_equity
        WHERE run_id = ? ORDER BY as_of`,
    )
    .all(runId) as {
    as_of: number;
    cash_vnd: number;
    mtm_vnd: number;
    benchmark_mtm_vnd: number;
  }[];
  const brokerLike = `paper-bt-${runId.slice(0, 8)}`;
  const trades = db
    .prepare(
      `SELECT ticker, side, filled_price, filled_qty, created_at FROM broker_orders
        WHERE broker = ? AND status = 'FILLED' ORDER BY created_at`,
    )
    .all(brokerLike) as {
    ticker: string;
    side: string;
    filled_price: number | null;
    filled_qty: number | null;
    created_at: number;
  }[];
  return { equity, trades };
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  // Strip code fences if the model added them.
  const fence = /```(?:json)?\s*\n([\s\S]*?)\n```/m.exec(trimmed);
  if (fence) return fence[1]!.trim();
  // Last resort: find first '{' and matching last '}'.
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function reflectOnRun(
  parent: AgentProfile,
  runId: string,
  snapshot: RunSnapshot,
): Promise<ReflectionResult> {
  const { equity, trades } = loadRunData(runId);
  const cfg = loadConfig();
  const userPrompt = [
    "AgentProfile:",
    JSON.stringify(parent, null, 2),
    "",
    "Summary metrics:",
    JSON.stringify(snapshot, null, 2),
    "",
    "Equity (week-by-week):",
    JSON.stringify(
      equity.map((e) => ({
        date: new Date(e.as_of * 1000).toISOString().slice(0, 10),
        mtm: Math.round(e.mtm_vnd),
        bench: Math.round(e.benchmark_mtm_vnd),
        cash: Math.round(e.cash_vnd),
      })),
    ),
    "",
    "Trades:",
    JSON.stringify(trades),
    "",
    "Emit a ProfileDiff JSON now. Empty object {} is acceptable if the run was strong.",
  ].join("\n");

  let raw = "";
  const stream = query({
    prompt: userPrompt,
    options: {
      model: cfg.model,
      systemPrompt: REFLECTOR_SYSTEM,
      includePartialMessages: true,
      allowedTools: [],
    },
  });
  for await (const m of stream as AsyncIterable<unknown>) {
    const msg = m as { type?: string; event?: { type?: string; delta?: { type?: string; text?: string } } };
    if (msg.type === "stream_event" && msg.event?.type === "content_block_delta") {
      const d = msg.event.delta;
      if (d?.type === "text_delta" && d.text) raw += d.text;
    }
  }

  const parentRef = profileRef(parent);
  let diff: ProfileDiff = {};
  try {
    const parsed = JSON.parse(extractJson(raw));
    diff = ProfileDiffSchema.parse(parsed);
  } catch (err) {
    console.warn(
      `[reflector] could not parse diff for ${parentRef}: ${(err as Error).message}. Treating as empty diff.`,
    );
    return { parentRef, childRef: parentRef, diff: {}, changed: false, rawOutput: raw };
  }

  const isEmpty =
    !diff.addRules?.length &&
    !diff.removeRuleIndices?.length &&
    !diff.addNotes?.length &&
    !diff.personaTextRewrite &&
    Object.keys(diff.paramDeltas ?? {}).length === 0 &&
    Object.keys(diff.regimeUpsert ?? {}).length === 0;

  if (isEmpty) {
    return { parentRef, childRef: parentRef, diff, changed: false, rawOutput: raw };
  }

  const child = applyProfileDiff(parent, diff);
  const childRef = saveProfile(child);

  // Persist any new long-term notes as memory rows so retrieval can surface them.
  for (const note of diff.addNotes ?? []) {
    recordMemory(parent.id, "long", Math.floor(Date.now() / 1000), note, 0.7);
  }

  return { parentRef, childRef, diff, changed: true, rawOutput: raw };
}
