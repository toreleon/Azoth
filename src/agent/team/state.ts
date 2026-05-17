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
  tasks: TeamTask[];
  messages: TeamMessage[];
  analysts: AnalystReport[];
  research: ResearchReport[];
  researchPlan?: ResearchPlan;
  trader?: TraderDecision;
  risk?: RiskReview;
  final?: FinalDecision;
}

export type TeamEvent =
  | { type: "run_start"; runId: string; ticker: string }
  | { type: "task_created"; task: TeamTask }
  | { type: "task_started"; task: TeamTask }
  | { type: "task_completed"; task: TeamTask }
  | { type: "task_failed"; task: TeamTask; message: string }
  | { type: "message"; message: TeamMessage }
  | { type: "role_start"; role: RoleName; round?: number }
  | { type: "role_delta"; role: RoleName; text: string }
  | { type: "role_tool"; role: RoleName; tool: string; input?: string; toolUseId?: string }
  | { type: "role_tool_result"; role: RoleName; tool?: string; toolUseId?: string; content: string }
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

export type TeamTaskStatus = "pending" | "in_progress" | "completed" | "failed";
export type TeamParticipant = RoleName | "lead" | "all";

export interface TeamTask {
  id: string;
  title: string;
  role: RoleName;
  status: TeamTaskStatus;
  dependsOn: string[];
  round?: number;
  claimedBy?: RoleName;
  outputSummary?: string;
  createdAt: number;
  updatedAt: number;
}

export interface TeamMessage {
  id: string;
  from: TeamParticipant;
  to: TeamParticipant;
  taskId?: string;
  text: string;
  createdAt: number;
}

// Zod schemas for parsing role JSON outputs from the LLM.

export const NavFractionSchema = z.union([
  z.number().min(0).max(1),
  // Role prompts ask for 0..1 NAV fractions, but LLMs sometimes return
  // percent-like whole numbers such as 4.0 for 4%.
  z.number().gt(1).max(100).transform((value) => value / 100),
]);

const EntryBandSchema: z.ZodType<{ low: number; high: number } | undefined, z.ZodTypeDef, unknown> = z
  .unknown()
  .transform((value, ctx) => {
    if (value == null) return undefined;
    if (typeof value !== "object") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "entryBand must be an object" });
      return z.NEVER;
    }
    const band = value as { low?: unknown; high?: unknown };
    if (band.low == null || band.high == null) return undefined;
    if (typeof band.low !== "number" || typeof band.high !== "number") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "entryBand low/high must be numbers" });
      return z.NEVER;
    }
    return { low: band.low, high: band.high };
  })
  .optional();

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
  sizingPct: NavFractionSchema,
  entryBand: EntryBandSchema,
  exitPlan: z.string().optional(),
  rationale: z.string().min(1),
});
export type TraderOutput = z.infer<typeof TraderOutputSchema>;

export const RiskOutputSchema = z.object({
  approved: z.boolean(),
  adjustedSizingPct: NavFractionSchema,
  concerns: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type RiskOutput = z.infer<typeof RiskOutputSchema>;
