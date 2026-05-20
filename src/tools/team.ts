import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { runTeamAnalysis, runTeamQuestion } from "../agent/team/index.js";
import { emitTeamToolEvent } from "../agent/team/toolEventBus.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

const activeTeamRuns = new Set<AbortController>();

export function abortActiveTeamRuns(): void {
  for (const controller of activeTeamRuns) controller.abort("turn aborted");
  activeTeamRuns.clear();
}

export const teamQuestionTool = tool(
  "team_question",
  [
    "Run Azoth's agent-team orchestration flow on any complex market, portfolio, allocation, or single-ticker analysis request.",
    "Use this when the normal chat answer needs coordinated bull/bear/risk/portfolio teammates instead of a quick single-agent response.",
    "Returns the final recommendation, reasons, risks, next actions, and run id.",
  ].join(" "),
  {
    question: z.string().min(1),
  },
  async ({ question }) => {
    const controller = new AbortController();
    activeTeamRuns.add(controller);
    try {
      const result = await runTeamQuestion(question, {
        allowWebSearch: true,
        signal: controller.signal,
        emit: (event) => emitTeamToolEvent({ tool: "team_question", event }),
      });
      return asText({
        ok: true,
        type: "team_question",
        runId: result.state.runId,
        asOfDateIso: result.decision.asOfDateIso,
        orchestration: {
          mode: "agent_team",
          tasks: result.state.tasks,
          messages: result.state.messages,
        },
        decision: result.decision,
        risk: result.state.risk,
      });
    } finally {
      activeTeamRuns.delete(controller);
    }
  },
);

export const teamAnalyzeTool = tool(
  "team_analyze",
  [
    "Run Azoth's full multi-agent single-ticker analysis.",
    "Use this when the user asks for a high-conviction buy/sell/hold decision, position sizing, or a deep investment memo on one ticker.",
    "The workflow runs technical, fundamentals, news, sentiment, bull, bear, research manager, trader, risk, and portfolio roles.",
  ].join(" "),
  {
    ticker: z.string().regex(/^[A-Za-z0-9]{3,4}$/),
    debate_rounds: z.number().int().min(1).max(4).default(2),
    as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  },
  async ({ ticker, debate_rounds, as_of_date }) => {
    const controller = new AbortController();
    activeTeamRuns.add(controller);
    try {
      const result = await runTeamAnalysis(
        {
          ticker: ticker.toUpperCase(),
          debateRounds: debate_rounds,
          asOfDateIso: as_of_date,
        },
        {
          allowWebSearch: true,
          signal: controller.signal,
          emit: (event) => emitTeamToolEvent({ tool: "team_analyze", event }),
        },
      );
      return asText({
        ok: true,
        type: "team_analyze",
        runId: result.state.runId,
        asOfDateIso: result.state.asOfDateIso,
        decision: result.decision,
        researchPlan: result.state.researchPlan,
        trader: result.state.trader,
        risk: result.state.risk,
        analysts: result.state.analysts,
      });
    } finally {
      activeTeamRuns.delete(controller);
    }
  },
);
