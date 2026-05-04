import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { runTeamAnalysis, runTeamQuestion } from "../agent/team/index.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

export const teamQuestionTool = tool(
  "team_question",
  [
    "Run Azoth's multi-agent team on a complex market, portfolio, or allocation question.",
    "Use this when the normal chat answer needs structured bull/bear/risk/portfolio debate instead of a quick single-agent response.",
    "Returns the final recommendation, reasons, risks, next actions, and run id.",
  ].join(" "),
  {
    question: z.string().min(1),
  },
  async ({ question }) => {
    const result = await runTeamQuestion(question, { allowWebSearch: true });
    return asText({
      ok: true,
      type: "team_question",
      runId: result.state.runId,
      asOfDateIso: result.decision.asOfDateIso,
      decision: result.decision,
      risk: result.state.risk,
    });
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
    const result = await runTeamAnalysis(
      {
        ticker: ticker.toUpperCase(),
        debateRounds: debate_rounds,
        asOfDateIso: as_of_date,
      },
      { allowWebSearch: true },
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
  },
);
