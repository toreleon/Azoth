import { randomUUID } from "node:crypto";
import {
  AnalystOutputSchema,
  ResearchOutputSchema,
  RiskOutputSchema,
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
  riskPrompt,
  sentimentPrompt,
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
  "Cite tickers in uppercase. Prices are in thousand VND on DNSE/SSI.",
  "Settlement is T+2.5 — never propose same-day round-trips.",
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
}

const PortfolioOutputSchema = z.object({
  action: z.enum(["BUY", "SELL", "HOLD", "WATCH"]),
  sizingPct: z.number().min(0).max(1),
  exitPlan: z.string().optional(),
  rationale: z.string().min(20),
});

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
    const { output: bullOut, raw: bullRaw } = await runRole({
      role: "bull",
      systemPrompt: SYSTEM_OPERATING_RULES,
      userPrompt: bullPrompt(ticker, asOfDateIso, round, state.analysts, state.research),
      schema: ResearchOutputSchema,
      round,
      emit,
      modelOverride: opts.modelOverride,
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

  // Phase 3: trader.
  const { output: traderOut, raw: traderRaw } = await runRole({
    role: "trader",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: traderPrompt(ticker, asOfDateIso, state.analysts, state.research),
    schema: TraderOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
  });
  const trader: TraderDecision = {
    action: traderOut.action,
    sizingPct: traderOut.sizingPct,
    entryBand: traderOut.entryBand,
    exitPlan: traderOut.exitPlan,
    rationale: traderOut.rationale,
  };
  state.trader = trader;
  recordRoleOutput(runId, "trader", 0, trader, traderRaw.usage);

  // Phase 4: risk.
  const { output: riskOut, raw: riskRaw } = await runRole({
    role: "risk",
    systemPrompt: SYSTEM_OPERATING_RULES,
    userPrompt: riskPrompt(ticker, asOfDateIso, state.analysts, trader),
    schema: RiskOutputSchema,
    emit,
    modelOverride: opts.modelOverride,
  });
  const risk: RiskReview = {
    approved: riskOut.approved,
    adjustedSizingPct: riskOut.adjustedSizingPct,
    concerns: riskOut.concerns ?? [],
    notes: riskOut.notes ?? "",
  };
  state.risk = risk;
  recordRoleOutput(runId, "risk", 0, risk, riskRaw.usage);

  // Phase 5: portfolio manager (synthesis only, no tools).
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
  });
  recordRoleOutput(runId, "portfolio", 0, pmOut, pmRaw.usage);

  // Enforce risk veto: if risk rejected, downgrade to HOLD/WATCH.
  let finalAction = pmOut.action;
  if (!risk.approved && (finalAction === "BUY" || finalAction === "SELL")) {
    finalAction = "HOLD";
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
      action: finalAction,
      sizingPct: risk.adjustedSizingPct,
      rationale: pmOut.rationale,
      exitPlan: pmOut.exitPlan,
    },
  });
  state.final = decision;
  emit({ type: "final", decision });

  return { state, decision };
}

export type { TeamEvent, TeamState, FinalDecision } from "./state.js";
