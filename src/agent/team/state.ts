import { z } from "zod";

export const ROLE_NAMES = [
  "technical",
  "fundamentals",
  "news",
  "sentiment",
  "bull",
  "bear",
  "researchManager",
  "trader",
  "risk",
  "portfolio",
] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const RATINGS = ["Buy", "Overweight", "Hold", "Underweight", "Sell"] as const;
export type Rating = (typeof RATINGS)[number];

export interface AnalystReport {
  role: "technical" | "fundamentals" | "news" | "sentiment";
  summary: string;
  score: number;
  detail: Record<string, unknown>;
}

export interface ResearchReport {
  role: "bull" | "bear";
  round: number;
  thesis: string;
  keyPoints: string[];
}

export interface ResearchPlan {
  recommendation: Rating;
  rationale: string;
  strategic_actions: string;
}

export interface TraderDecision {
  rating: Rating;
  sizingPct: number;
  entryBand?: { low: number; high: number };
  exitPlan?: string;
  rationale: string;
}

export interface RiskReview {
  approved: boolean;
  adjustedSizingPct: number;
  concerns: string[];
  notes: string;
}

export interface FinalDecision {
  ticker: string;
  rating: Rating;
  sizingPct: number;
  rationale: string;
  exitPlan?: string;
  journalId?: number;
  teamRunId: string;
}

export interface TeamInput {
  ticker: string;
  asOfDateIso?: string;
  debateRounds?: number;
}

export interface TeamState {
  runId: string;
  ticker: string;
  asOfDateIso: string;
  analysts: AnalystReport[];
  research: ResearchReport[];
  researchPlan?: ResearchPlan;
  trader?: TraderDecision;
  risk?: RiskReview;
  final?: FinalDecision;
}

export type TeamEvent =
  | { type: "run_start"; runId: string; ticker: string }
  | { type: "role_start"; role: RoleName; round?: number }
  | { type: "role_delta"; role: RoleName; text: string }
  | { type: "role_tool"; role: RoleName; tool: string }
  | { type: "role_end"; role: RoleName; round?: number; output: unknown; usage?: RoleUsage }
  | { type: "final"; decision: FinalDecision }
  | { type: "error"; role?: RoleName; message: string };

export interface RoleUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
}

// Zod schemas for parsing role JSON outputs from the LLM.

export const AnalystOutputSchema = z.object({
  summary: z.string().min(1),
  score: z.number().min(-1).max(1),
  detail: z.record(z.string(), z.unknown()).optional().default({}),
});
export type AnalystOutput = z.infer<typeof AnalystOutputSchema>;

export const ResearchOutputSchema = z.object({
  thesis: z.string().min(1),
  keyPoints: z.array(z.string()).default([]),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

export const ResearchPlanOutputSchema = z.object({
  recommendation: z.enum(RATINGS),
  rationale: z.string().min(1),
  strategic_actions: z.string().min(1),
});
export type ResearchPlanOutput = z.infer<typeof ResearchPlanOutputSchema>;

export const TraderOutputSchema = z.object({
  rating: z.enum(RATINGS),
  sizingPct: z.number().min(0).max(1),
  entryBand: z
    .object({ low: z.number(), high: z.number() })
    .optional(),
  exitPlan: z.string().optional(),
  rationale: z.string().min(1),
});
export type TraderOutput = z.infer<typeof TraderOutputSchema>;

export const RiskOutputSchema = z.object({
  approved: z.boolean(),
  adjustedSizingPct: z.number().min(0).max(1),
  concerns: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type RiskOutput = z.infer<typeof RiskOutputSchema>;
