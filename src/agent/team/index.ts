import { randomUUID } from "node:crypto";
import {
  AnalystOutputSchema,
  NavFractionSchema,
  ResearchPlanOutputSchema,
  ResearchOutputSchema,
  RiskOutputSchema,
  RATINGS,
  TraderOutputSchema,
  type AnalystReport,
  type FinalDecision,
  type ResearchReport,
  type RiskReview,
  type RoleName,
  type TeamEvent,
  type TeamInput,
  type TeamState,
  type TraderDecision,
} from "./state.js";
import {
  bearPrompt,
  bullPrompt,
  fundamentalsPrompt,
  newsPrompt,
  portfolioPrompt,
  researchManagerPrompt,
  riskPrompt,
  sentimentPrompt,
  teamBearQuestionPrompt,
  teamBullQuestionPrompt,
  teamPortfolioQuestionPrompt,
  teamRiskQuestionPrompt,
  technicalPrompt,
  traderPrompt,
} from "./prompts.js";
import { runRole } from "./runner.js";
import {
  finalizeTeamRun,
  recordRoleOutput,
  recordTeamRunStart,
} from "./storage.js";
import { z } from "zod";

const SYSTEM_OPERATING_RULES = [
  "You are part of Azoth's multi-agent VN-equity desk.",
  "Always ground claims in tool output; do not invent figures.",
  "Use WebSearch for current open-web context when Azoth's market/news tools are insufficient. Cite URLs and dates for web-sourced claims.",
  "Cite tickers in uppercase. Prices are in thousand VND on DNSE/SSI.",
  "Formal settlement for HOSE/HNX/UPCOM shares, fund certificates, and covered warrants is T+2; availability is typically before 13:00 ICT on T+2, from the afternoon session. Never call this a formal T+2.5 cycle and never propose same-day round-trips.",
].join("\n");

const ANALYST_DEFINITIONS: Array<{
  role: Extract<RoleName, "technical" | "fundamentals" | "news" | "sentiment">;
  build: (ticker: string, asOf: string) => string;
}> = [
  { role: "technical", build: technicalPrompt },
  { role: "fundamentals", build: fundamentalsPrompt },
  { role: "news", build: newsPrompt },
  { role: "sentiment", build: sentimentPrompt },
];

export interface RunTeamOptions {
  emit?: (ev: TeamEvent) => void;
  modelOverride?: string;
  allowWebSearch?: boolean;
  signal?: AbortSignal;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("aborted");
}

const PortfolioOutputSchema = z.object({
  rating: z.enum(RATINGS),
  sizingPct: NavFractionSchema,
  exitPlan: z.string().optional(),
  rationale: z.string().min(20),
});

const TeamQuestionOutputSchema = z.object({
  answer: z.string().min(1),
  recommendation: z.string().min(1),
  keyReasons: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  nextActions: z.array(z.string()).default([]),
});

export type TeamQuestionDecision = z.infer<typeof TeamQuestionOutputSchema> & {
  question: string;
  asOfDateIso: string;
  teamRunId: string;
};

export interface TeamQuestionState {
  runId: string;
  question: string;
  asOfDateIso: string;
  research: ResearchReport[];
  risk?: RiskReview;
  final?: TeamQuestionDecision;
}

export async function runTeamAnalysis(
  input: TeamInput,
  opts: RunTeamOptions = {},
): Promise<{ state: TeamState; decision: FinalDecision }> {
  const ticker = input.ticker.trim().toUpperCase();
  const asOfDateIso = input.asOfDateIso ?? new Date().toISOString().slice(0, 10);
  const debateRounds = Math.max(1, input.debateRounds ?? 2);
  const runId = randomUUID();
  const events: TeamEvent[] = [];
  const emit = (ev: TeamEvent) => {
    events.push(ev);
    opts.emit?.(ev);
  };

  recordTeamRunStart(runId, ticker, asOfDateIso);
  emit({ type: "run_start", runId, ticker });
  throwIfAborted(opts.signal);

  const state: TeamState = {
    runId,
    ticker,
    asOfDateIso,
    analysts: [],
    research: [],
  };

  // Phase 1: analysts (in parallel for speed).
  const analystResults = await Promise.all(
    ANALYST_DEFINITIONS.map(async (def) => {
      const { output, raw } = await runRole({
        role: def.role,
        systemPrompt: SYSTEM_OPERATING_RULES,
        userPrompt: def.build(ticker, asOfDateIso),
        schema: AnalystOutputSchema,
        emit,
        modelOverride: opts.modelOverride,
        allowWebSearch: opts.allowWebSearch,
        signal: opts.signal,
      });
      const report: AnalystReport = {
        role: def.role,
        summary: output.summary,
        score: output.score,
        detail: output.detail ?? {},
      };
      recordRoleOutput(runId, def.role, 0, report, raw.usage);
      return report;
    }),
  );
  state.analysts = analystResults;

  // Phase 2: bull/bear debate, N rounds.
  for (let round = 1; round <= debateRounds; round++) {
    throwIfAborted(opts.signal);
    const { output: bullOut, raw: bullRaw } = await runRole({
      role: "bull",
      systemPrompt: SYSTEM_OPERATING_RULES,
      userPrompt: bullPrompt(ticker, asOfDateIso, round, state.analysts, state.research),
      schema: ResearchOutputSchema,
      round,
      emit,
      modelOverride: opts.modelOverride,
      allowWebSearch: opts.allowWebSearch,
      signal: opts.signal,
    });
    const bullReport: ResearchReport = {
      role: "bull",
      round,
      thesis: bullOut.thesis,
      keyPoints: bullOut.keyPoints ?? [],
    };
    state.research.push(bullReport);
    recordRoleOutput(runId, "bull", round, bullReport, bullRaw.usage);

    const { output: bearOut, raw: bearRaw } = await runRole({
      role: "bear",
      systemPrompt: SYSTEM_OPERATING_RULES,
      userPrompt: bearPrompt(ticker, asOfDateIso, round, state.analysts, state.research),
      schema: ResearchOutputSchema,
      round,
      emit,
      modelOverride: opts.modelOverride,
      allowWebSearch: opts.allowWebSearch,
      signal: opts.signal,
    });
    const bearReport: ResearchReport = {
      role: "bear",
      round,
      thesis: bearOut.thesis,
      keyPoints: bearOut.keyPoints ?? [],
    };
    state.research.push(bearReport);
    recordRoleOutput(runId, "bear", round, bearReport, bearRaw.usage);
  }

  // Phase 3: research manager synthesis.
  const { output: researchPlanOut, raw: researchPlanRaw } = await runRole({
    role: "researchManager",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: researchManagerPrompt(ticker, asOfDateIso, state.analysts, state.research),
    schema: ResearchPlanOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  const researchPlan = {
    recommendation: researchPlanOut.recommendation,
    rationale: researchPlanOut.rationale,
    strategic_actions: researchPlanOut.strategic_actions,
  };
  state.researchPlan = researchPlan;
  recordRoleOutput(runId, "researchManager", 0, researchPlan, researchPlanRaw.usage);

  // Phase 4: trader.
  const { output: traderOut, raw: traderRaw } = await runRole({
    role: "trader",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: traderPrompt(ticker, asOfDateIso, state.analysts, researchPlan),
    schema: TraderOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  const trader: TraderDecision = {
    rating: traderOut.rating,
    sizingPct: traderOut.sizingPct,
    entryBand: traderOut.entryBand as TraderDecision["entryBand"],
    exitPlan: traderOut.exitPlan,
    rationale: traderOut.rationale,
  };
  state.trader = trader;
  recordRoleOutput(runId, "trader", 0, trader, traderRaw.usage);

  // Phase 5: risk.
  const { output: riskOut, raw: riskRaw } = await runRole({
    role: "risk",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: riskPrompt(ticker, asOfDateIso, state.analysts, trader),
    schema: RiskOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  const risk: RiskReview = {
    approved: riskOut.approved,
    adjustedSizingPct: riskOut.adjustedSizingPct,
    concerns: riskOut.concerns ?? [],
    notes: riskOut.notes ?? "",
  };
  state.risk = risk;
  recordRoleOutput(runId, "risk", 0, risk, riskRaw.usage);

  // Phase 6: portfolio manager (synthesis only, no tools).
  const { output: pmOut, raw: pmRaw } = await runRole({
    role: "portfolio",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: portfolioPrompt(
      ticker,
      asOfDateIso,
      state.analysts,
      state.research,
      trader,
      risk,
    ),
    schema: PortfolioOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  recordRoleOutput(runId, "portfolio", 0, pmOut, pmRaw.usage);

  // Enforce risk veto: if risk rejected, downgrade directional ratings to Hold.
  let finalRating = pmOut.rating;
  if (!risk.approved && finalRating !== "Hold") {
    finalRating = "Hold";
  }

  const decision = finalizeTeamRun({
    runId,
    ticker,
    asOfDateIso,
    analysts: state.analysts,
    research: state.research,
    trader,
    risk,
    final: {
      rating: finalRating,
      sizingPct: risk.adjustedSizingPct,
      rationale: pmOut.rationale,
      exitPlan: pmOut.exitPlan,
    },
  });
  state.final = decision;
  emit({ type: "final", decision });

  return { state, decision };
}

export async function runTeamQuestion(
  question: string,
  opts: RunTeamOptions = {},
): Promise<{ state: TeamQuestionState; decision: TeamQuestionDecision }> {
  const trimmed = question.trim();
  if (!trimmed) throw new Error("team question is required");

  const asOfDateIso = new Date().toISOString().slice(0, 10);
  const runId = randomUUID();
  const events: TeamEvent[] = [];
  const emit = (ev: TeamEvent) => {
    events.push(ev);
    opts.emit?.(ev);
  };

  recordTeamRunStart(runId, "TEAM", asOfDateIso);
  emit({ type: "run_start", runId, ticker: "TEAM" });
  throwIfAborted(opts.signal);

  const state: TeamQuestionState = {
    runId,
    question: trimmed,
    asOfDateIso,
    research: [],
  };

  const { output: bullOut, raw: bullRaw } = await runRole({
    role: "bull",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: teamBullQuestionPrompt(trimmed, asOfDateIso),
    schema: ResearchOutputSchema,
    round: 1,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  const bullReport: ResearchReport = {
    role: "bull",
    round: 1,
    thesis: bullOut.thesis,
    keyPoints: bullOut.keyPoints ?? [],
  };
  state.research.push(bullReport);
  recordRoleOutput(runId, "bull", 1, bullReport, bullRaw.usage);

  const { output: bearOut, raw: bearRaw } = await runRole({
    role: "bear",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: teamBearQuestionPrompt(trimmed, asOfDateIso, state.research),
    schema: ResearchOutputSchema,
    round: 1,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  const bearReport: ResearchReport = {
    role: "bear",
    round: 1,
    thesis: bearOut.thesis,
    keyPoints: bearOut.keyPoints ?? [],
  };
  state.research.push(bearReport);
  recordRoleOutput(runId, "bear", 1, bearReport, bearRaw.usage);

  const { output: riskOut, raw: riskRaw } = await runRole({
    role: "risk",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: teamRiskQuestionPrompt(trimmed, asOfDateIso, state.research),
    schema: RiskOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  const risk: RiskReview = {
    approved: riskOut.approved,
    adjustedSizingPct: riskOut.adjustedSizingPct,
    concerns: riskOut.concerns ?? [],
    notes: riskOut.notes ?? "",
  };
  state.risk = risk;
  recordRoleOutput(runId, "risk", 0, risk, riskRaw.usage);

  const { output: finalOut, raw: finalRaw } = await runRole({
    role: "portfolio",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: teamPortfolioQuestionPrompt(trimmed, asOfDateIso, state.research, risk),
    schema: TeamQuestionOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
    allowWebSearch: opts.allowWebSearch,
    signal: opts.signal,
  });
  const decision: TeamQuestionDecision = {
    answer: finalOut.answer,
    recommendation: finalOut.recommendation,
    keyReasons: finalOut.keyReasons ?? [],
    risks: finalOut.risks ?? [],
    nextActions: finalOut.nextActions ?? [],
    question: trimmed,
    asOfDateIso,
    teamRunId: runId,
  };
  state.final = decision;
  recordRoleOutput(runId, "portfolio", 0, decision, finalRaw.usage);

  return { state, decision };
}

export type { TeamEvent, TeamState, FinalDecision } from "./state.js";
