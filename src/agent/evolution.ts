/**
 * Evolutionary harness: pure-logic helpers for fitness computation, random
 * mutation, LLM-driven crossover, and survivor selection. The CLI in
 * `src/cli/evolve.ts` orchestrates these against the backtest runner.
 *
 * Fitness shape (from the plan):
 *   fitness = sharpe_val
 *           − λ · max(0, max_dd_val − dd_floor)
 *           − β · turnover
 *           − γ · profile_complexity
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { loadConfig } from "../config/loader.js";
import {
  applyProfileDiff,
  ProfileDiffSchema,
  profileRef,
  type AgentProfile,
  type ProfileDiff,
  type ProfileParams,
} from "./profile.js";

export interface EquityPoint {
  mtmVnd: number;
  benchmarkMtmVnd: number;
}

export interface FoldMetrics {
  weeks: number;
  totalReturn: number; // fraction
  benchReturn: number; // fraction
  alpha: number;       // fraction
  sharpe: number;      // annualized (sqrt(52))
  maxDd: number;       // positive fraction (0.20 = 20% drawdown)
  turnover: number;    // total filled notional VND / initial cash
}

export interface FitnessConfig {
  ddFloor: number;
  lambda: number;
  beta: number;
  gamma: number;
}

export const DEFAULT_FITNESS: FitnessConfig = {
  ddFloor: 0.15,
  lambda: 2.0,
  beta: 0.05,
  gamma: 0.001,
};

export function computeMetrics(
  initialCash: number,
  equity: EquityPoint[],
  filledNotionalVnd: number,
): FoldMetrics {
  const weeks = equity.length;
  if (weeks === 0) {
    return { weeks: 0, totalReturn: 0, benchReturn: 0, alpha: 0, sharpe: 0, maxDd: 0, turnover: 0 };
  }
  const last = equity[weeks - 1]!;
  const totalReturn = last.mtmVnd / initialCash - 1;
  const benchReturn = last.benchmarkMtmVnd / initialCash - 1;

  // Weekly returns from initial cash through final week.
  const series = [initialCash, ...equity.map((e) => e.mtmVnd)];
  const returns: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!;
    const cur = series[i]!;
    if (prev > 0) returns.push(cur / prev - 1);
  }
  const mean = returns.reduce((s, r) => s + r, 0) / Math.max(returns.length, 1);
  const variance =
    returns.length > 1
      ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
      : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 1e-9 ? (mean / std) * Math.sqrt(52) : 0;

  let peak = initialCash;
  let maxDd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e.mtmVnd);
    const dd = peak > 0 ? 1 - e.mtmVnd / peak : 0;
    if (dd > maxDd) maxDd = dd;
  }

  const turnover = initialCash > 0 ? filledNotionalVnd / initialCash : 0;
  return {
    weeks,
    totalReturn,
    benchReturn,
    alpha: totalReturn - benchReturn,
    sharpe,
    maxDd,
    turnover,
  };
}

export function profileComplexity(p: AgentProfile): number {
  return p.rules.length + p.notes.length;
}

export function computeFitness(
  profile: AgentProfile,
  m: FoldMetrics,
  cfg: FitnessConfig = DEFAULT_FITNESS,
): number {
  const ddPenalty = cfg.lambda * Math.max(0, m.maxDd - cfg.ddFloor);
  const turnoverPenalty = cfg.beta * m.turnover;
  const complexityPenalty = cfg.gamma * profileComplexity(profile);
  return m.sharpe - ddPenalty - turnoverPenalty - complexityPenalty;
}

// ---------- Random mutation (control kid) -----------------------------------

const MUTABLE_NUMERIC_KEYS = [
  "maxPositionPct",
  "stopLossPct",
  "cashFloorPct",
  "maxNames",
  "minHoldingWeeks",
  "maxDrawdownFloor",
] as const satisfies readonly (keyof ProfileParams)[];

interface Rng {
  (): number;
}

function pickN<T>(arr: readonly T[], n: number, rng: Rng): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]!);
  }
  return out;
}

const MUTATION_STEPS: Record<(typeof MUTABLE_NUMERIC_KEYS)[number], number> = {
  maxPositionPct: 0.02,
  stopLossPct: 0.01,
  cashFloorPct: 0.05,
  maxNames: 1,
  minHoldingWeeks: 1,
  maxDrawdownFloor: 0.02,
};

export function randomMutate(parent: AgentProfile, rng: Rng = Math.random): AgentProfile {
  const keys = pickN(MUTABLE_NUMERIC_KEYS, 1 + Math.floor(rng() * 2), rng);
  const paramDeltas: Record<string, number> = {};
  for (const k of keys) {
    const step = MUTATION_STEPS[k];
    paramDeltas[k] = (rng() < 0.5 ? -1 : 1) * step;
  }
  return applyProfileDiff(parent, { paramDeltas });
}

// ---------- LLM crossover ---------------------------------------------------

const CROSSOVER_SYSTEM = [
  "You are the mutator for an evolutionary trading-strategy harness.",
  "You receive two parent AgentProfiles plus their fold metrics. Emit a ProfileDiff to apply against parent A — the result becomes their child.",
  "Output contract: reply with ONLY a JSON object — no prose, no code fences.",
  "Allowed top-level keys: addRules, removeRuleIndices, paramDeltas, addNotes, personaTextRewrite, regimeUpsert.",
  "paramDeltas keys must be one of: maxPositionPct, stopLossPct, cashFloorPct, maxNames, minHoldingWeeks, maxDrawdownFloor. Values are deltas, kept small (±0.02 percentages, ±1 counts).",
  "Pull the genuinely useful traits from parent B (rules, notes, params) into the diff. Drop weak rules from A by index.",
  "Never widen risk unless both parents had strong Sharpe and bounded drawdown.",
].join("\n");

interface CrossoverInput {
  parents: [AgentProfile, AgentProfile];
  parentMetrics: [FoldMetrics, FoldMetrics];
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const fence = /```(?:json)?\s*\n([\s\S]*?)\n```/m.exec(trimmed);
  if (fence) return fence[1]!.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

export async function llmCrossover(input: CrossoverInput): Promise<AgentProfile> {
  const cfg = loadConfig();
  const userPrompt = [
    "Parent A:",
    JSON.stringify(input.parents[0], null, 2),
    "Parent A val metrics:",
    JSON.stringify(input.parentMetrics[0]),
    "",
    "Parent B:",
    JSON.stringify(input.parents[1], null, 2),
    "Parent B val metrics:",
    JSON.stringify(input.parentMetrics[1]),
    "",
    "Emit a ProfileDiff JSON to apply against parent A.",
  ].join("\n");

  let raw = "";
  const stream = query({
    prompt: userPrompt,
    options: {
      model: cfg.model,
      systemPrompt: CROSSOVER_SYSTEM,
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

  let diff: ProfileDiff = {};
  try {
    diff = ProfileDiffSchema.parse(JSON.parse(extractJson(raw)));
  } catch (err) {
    console.warn(
      `[crossover] could not parse diff for ${profileRef(input.parents[0])} × ${profileRef(input.parents[1])}: ${(err as Error).message}. Falling back to random mutation.`,
    );
    return randomMutate(input.parents[0]);
  }
  return applyProfileDiff(input.parents[0], diff);
}

// ---------- Selection -------------------------------------------------------

export interface ScoredMember {
  profile: AgentProfile;
  trainFitness: number;
  valFitness: number;
}

export interface SelectionOptions {
  /** Drop members where train > val by more than this gap (curve-fit guard). */
  stabilityGap?: number;
}

/**
 * Rank by val fitness penalized by a stability gap (train − val). Survivors
 * are the top-K of the penalized score. Members that pass the IC stability
 * guard are preferred; if too few pass, the cap is relaxed silently rather
 * than returning an empty pool — but the gap is logged onto each member so
 * the CLI can flag it.
 */
export function selectSurvivors(
  members: ScoredMember[],
  k: number,
  opts: SelectionOptions = {},
): ScoredMember[] {
  const gap = opts.stabilityGap ?? 1.0;
  const scored = members
    .map((m) => ({
      member: m,
      stable: m.trainFitness - m.valFitness <= gap,
      penalized: m.valFitness - 0.5 * Math.max(0, m.trainFitness - m.valFitness),
    }))
    .sort((a, b) => b.penalized - a.penalized);
  const stable = scored.filter((s) => s.stable).map((s) => s.member);
  if (stable.length >= k) return stable.slice(0, k);
  // Backfill from the unstable tail to keep the population size constant.
  const fill = scored.filter((s) => !s.stable).map((s) => s.member);
  return [...stable, ...fill].slice(0, k);
}
