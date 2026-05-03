/**
 * AgentProfile — the structured, evolving artifact that steers the backtest
 * agent. Replaces the previous static `AgentPersona`. A profile is identified
 * by `<id>@v<version>`; the harness persists every version to `agent_profiles`
 * so each backtest run is reproducible from its profile ref.
 */
import { z } from "zod";

export const ProfileParamsSchema = z.object({
  maxPositionPct: z.number().min(0.01).max(1),
  stopLossPct: z.number().min(0.01).max(1),
  cashFloorPct: z.number().min(0).max(1),
  maxNames: z.number().int().min(1).max(20),
  minHoldingWeeks: z.number().int().min(1).max(52),
  maxDrawdownFloor: z.number().min(0.01).max(1),
  preferredUniverse: z.enum(["default", "vn30", "banks", "bluechip"]),
  discoveryCriterion: z.enum([
    "momentum",
    "breakout",
    "oversold",
    "low_volatility",
    "high_volume",
    "top_gainers",
    "top_losers",
  ]),
});

export const ProfileFitnessSchema = z.object({
  sharpeOos: z.number(),
  maxDdOos: z.number(),
  alphaOos: z.number(),
  fold: z.string(),
});

export const AgentProfileSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(0),
  parentVersion: z.number().int().min(0).optional(),
  personaText: z.string().min(1),
  rules: z.array(z.string().min(1)).max(20),
  params: ProfileParamsSchema,
  regimePlaybook: z.record(z.string()),
  notes: z.array(z.string().min(1)).max(40),
  createdAt: z.number().int(),
  fitnessSnapshot: ProfileFitnessSchema.optional(),
});

export type ProfileParams = z.infer<typeof ProfileParamsSchema>;
export type ProfileFitness = z.infer<typeof ProfileFitnessSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;

export function profileRef(p: AgentProfile): string {
  return `${p.id}@v${p.version}`;
}

export function parseProfileRef(ref: string): { id: string; version: number } {
  const m = /^([a-z0-9_-]+)@v(\d+)$/i.exec(ref);
  if (!m) throw new Error(`bad profile ref: '${ref}' (expected '<id>@v<n>')`);
  return { id: m[1]!, version: Number.parseInt(m[2]!, 10) };
}

export function validateProfile(json: unknown): AgentProfile {
  return AgentProfileSchema.parse(json);
}

/**
 * Render a profile into the strategy section of the backtest system prompt.
 * The output is deterministic for a given profile so the LLM cache key remains
 * stable across runs of the same profile version.
 */
export function renderProfilePrompt(p: AgentProfile): string {
  const lines: string[] = [];
  lines.push(`Strategy profile: ${profileRef(p)}.`);
  lines.push(p.personaText.trim());
  lines.push("");
  lines.push("Hard parameters (the harness enforces these regardless of your judgement):");
  lines.push(`- Max position size: ${(p.params.maxPositionPct * 100).toFixed(0)}% of equity per name.`);
  lines.push(`- Stop loss: cut a position down ${(p.params.stopLossPct * 100).toFixed(0)}% from entry.`);
  lines.push(`- Cash floor: keep at least ${(p.params.cashFloorPct * 100).toFixed(0)}% in cash.`);
  lines.push(`- Max concurrent names: ${p.params.maxNames}.`);
  lines.push(`- Min holding period: ${p.params.minHoldingWeeks} week(s) (T+2.5 settlement still applies).`);
  lines.push(`- Drawdown floor: ${(p.params.maxDrawdownFloor * 100).toFixed(0)}% — breaching this triggers a defensive freeze.`);
  lines.push(`- Preferred discovery universe: '${p.params.preferredUniverse}'.`);
  lines.push(`- Default discovery criterion: '${p.params.discoveryCriterion}'.`);

  if (p.rules.length > 0) {
    lines.push("");
    lines.push("Strategy rules:");
    p.rules.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
  }

  const regimes = Object.entries(p.regimePlaybook);
  if (regimes.length > 0) {
    lines.push("");
    lines.push("Regime playbook:");
    for (const [tag, hint] of regimes) lines.push(`- [${tag}] ${hint}`);
  }

  if (p.notes.length > 0) {
    lines.push("");
    lines.push("Lessons carried forward:");
    p.notes.forEach((n) => lines.push(`- ${n}`));
  }

  return lines.join("\n");
}

// ---------- Diff / apply (used by the reflector in phase 2) -----------------

export const ProfileDiffSchema = z.object({
  addRules: z.array(z.string().min(1)).max(2).optional(),
  removeRuleIndices: z.array(z.number().int().min(0)).max(2).optional(),
  paramDeltas: z.record(z.number()).optional(),
  addNotes: z.array(z.string().min(1)).max(2).optional(),
  personaTextRewrite: z.string().min(1).optional(),
  regimeUpsert: z.record(z.string()).optional(),
});

export type ProfileDiff = z.infer<typeof ProfileDiffSchema>;

const PARAM_BOUNDS: Record<keyof ProfileParams, [number, number] | null> = {
  maxPositionPct: [0.05, 0.5],
  stopLossPct: [0.03, 0.25],
  cashFloorPct: [0, 0.8],
  maxNames: [1, 12],
  minHoldingWeeks: [1, 12],
  maxDrawdownFloor: [0.05, 0.4],
  preferredUniverse: null,
  discoveryCriterion: null,
};

function clampParam(key: keyof ProfileParams, current: number, delta: number): number {
  const bounds = PARAM_BOUNDS[key];
  if (!bounds) return current;
  const next = current + delta;
  return Math.max(bounds[0], Math.min(bounds[1], next));
}

/**
 * Pure: apply a (validated) diff to a profile, producing a new profile with
 * version bumped and parentVersion set. Bounds are enforced; over-large
 * additions are dropped silently to keep the rule cap.
 */
export function applyProfileDiff(parent: AgentProfile, diff: ProfileDiff): AgentProfile {
  const removeSet = new Set(diff.removeRuleIndices ?? []);
  const keptRules = parent.rules.filter((_, i) => !removeSet.has(i));
  const addedRules = (diff.addRules ?? []).filter((r) => r.trim().length > 0);
  const rules = [...keptRules, ...addedRules].slice(0, 20);

  const notes = [...parent.notes, ...(diff.addNotes ?? [])].slice(0, 40);

  const params = { ...parent.params };
  for (const [k, delta] of Object.entries(diff.paramDeltas ?? {})) {
    if (!(k in PARAM_BOUNDS)) continue;
    const key = k as keyof ProfileParams;
    if (PARAM_BOUNDS[key] == null) continue;
    const cur = params[key] as number;
    const next = clampParam(key, cur, delta);
    if (key === "maxNames" || key === "minHoldingWeeks") {
      (params[key] as number) = Math.round(next);
    } else {
      (params[key] as number) = next;
    }
  }

  const regimePlaybook = { ...parent.regimePlaybook, ...(diff.regimeUpsert ?? {}) };
  const personaText = diff.personaTextRewrite?.trim() || parent.personaText;

  return validateProfile({
    id: parent.id,
    version: parent.version + 1,
    parentVersion: parent.version,
    personaText,
    rules,
    params,
    regimePlaybook,
    notes,
    createdAt: Math.floor(Date.now() / 1000),
  });
}
