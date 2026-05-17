import type {
  AnalystReport,
  ResearchPlan,
  ResearchReport,
  TraderDecision,
  RiskReview,
} from "./state.js";
import { loadConfig } from "../../config/loader.js";

const PRICE_NOTE =
  "VN stock prices are quoted in thousand VND on DNSE/SSI (e.g. 28.5 means 28,500 VND). Tickers are uppercase 3 letters (4 for derivatives).";

const JSON_NOTE =
  "Return ONLY a single JSON object as your final assistant message. No prose around the JSON, no markdown fences. Use double quotes.";

const SIZING_NOTE =
  "For sizingPct fields, return a decimal NAV fraction from 0 to 1: use 0.04 for 4%, never 4 or \"4%\".";

function header(role: string, ticker: string, asOfDateIso: string) {
  return [
    `You are the ${role} on Azoth's multi-agent VN-equity desk.`,
    `Subject ticker: ${ticker}. As-of: ${asOfDateIso}.`,
    PRICE_NOTE,
  ].join("\n");
}

function questionHeader(role: string, question: string, asOfDateIso: string) {
  return [
    `You are the ${role} on Azoth's multi-agent VN-equity desk.`,
    `User question: ${question}`,
    `As-of: ${asOfDateIso}.`,
    PRICE_NOTE,
  ].join("\n");
}

function userFacingLanguageInstruction(): string {
  const lang = loadConfig().team.output_language.toLowerCase();
  if (lang === "vi" || lang.startsWith("vi-") || lang.includes("vietnamese")) {
    return "Write the user-facing summary, rationale, and narrative fields in Vietnamese. Keep JSON keys and enum values exactly as specified.";
  }
  return "Write the user-facing summary, rationale, and narrative fields in English. Keep JSON keys and enum values exactly as specified.";
}

export function technicalPrompt(ticker: string, asOfDateIso: string): string {
  return [
    header("Technical Analyst", ticker, asOfDateIso),
    "",
    "Use market_quote for the latest matched price, live_chart (resolution 1 or 5, ~120 bars) for current intraday price action, market_ohlcv (1D, ~60 bars) when daily history is needed, and technical_indicators to assess trend, momentum, and volatility.",
    "Cite at least RSI(14), MACD, and a moving-average view (SMA20/50). Note any divergence or breakout/breakdown levels.",
    "",
    "Score the technical setup on -1..1 (bearish to bullish). 0 = neutral.",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"summary": string, "score": number, "detail": {"rsi": number, "macd": string, "trend": string, "support": number, "resistance": number}}',
  ].join("\n");
}

export function fundamentalsPrompt(ticker: string, asOfDateIso: string): string {
  return [
    header("Fundamentals Analyst", ticker, asOfDateIso),
    "",
    "Use fundamentals_snapshot (and market_quote for current price) to assess valuation and quality.",
    "Cite P/E, P/B, ROE, EPS, market cap. Compare against the latest available quarterly trend.",
    "",
    "Score valuation+quality on -1..1 (overvalued/weak to undervalued/strong).",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"summary": string, "score": number, "detail": {"pe": number, "pb": number, "roe": number, "marketCapBn": number}}',
  ].join("\n");
}

export function newsPrompt(ticker: string, asOfDateIso: string): string {
  return [
    header("News Analyst", ticker, asOfDateIso),
    "",
    "Use ticker_news for recent company news + macro_indices for the broader index backdrop.",
    "Identify catalysts (earnings, dividends, regulation, sector). Cite headline + URL + publish date for each.",
    "",
    "Score newsflow impact on -1..1 (negative to positive).",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"summary": string, "score": number, "detail": {"headlines": [{"title": string, "url": string, "date": string}], "catalysts": [string]}}',
  ].join("\n");
}

export function sentimentPrompt(ticker: string, asOfDateIso: string): string {
  return [
    header("Sentiment Analyst", ticker, asOfDateIso),
    "",
    "VN market lacks a robust social-sentiment feed, so use TWO proxies:",
    " 1. ticker_news tone (optimistic / cautious / negative across recent items).",
    " 2. foreign_flow (institutional buy/sell pressure week-to-date and ownership %).",
    "",
    "Score overall positioning on -1..1 (negative tone + foreign selling to positive tone + foreign buying).",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"summary": string, "score": number, "detail": {"tone": "pos"|"neg"|"mixed", "foreignNetVnd": number, "ownershipPct": number}}',
  ].join("\n");
}

function renderAnalysts(analysts: AnalystReport[]): string {
  if (!analysts.length) return "(no analyst reports yet)";
  return analysts
    .map(
      (a) =>
        `## ${a.role} (score ${a.score.toFixed(2)})\n${a.summary}\nDetail: ${JSON.stringify(a.detail)}`,
    )
    .join("\n\n");
}

function renderResearch(reports: ResearchReport[], side: "bull" | "bear"): string {
  const opp = reports.filter((r) => r.role !== side);
  if (!opp.length) return "(no opposing arguments yet — open the debate)";
  return opp
    .map(
      (r) =>
        `## ${r.role} round ${r.round}\n${r.thesis}\nKey points:\n- ${r.keyPoints.join("\n- ")}`,
    )
    .join("\n\n");
}

export function bullPrompt(
  ticker: string,
  asOfDateIso: string,
  round: number,
  analysts: AnalystReport[],
  research: ResearchReport[],
): string {
  return [
    header("Bullish Researcher", ticker, asOfDateIso),
    "",
    `Debate round ${round}. Make the strongest case to ENTER or HOLD a long position. Address the bear's points if any.`,
    "",
    "Analyst reports:",
    renderAnalysts(analysts),
    "",
    "Bear arguments so far:",
    renderResearch(research, "bull"),
    "",
    "Argue primarily from the evidence above. Use WebSearch only for recent open-web context that is missing from the analyst reports, and cite URLs/dates for anything web-sourced.",
    JSON_NOTE,
    'Schema: {"thesis": string, "keyPoints": [string]}',
  ].join("\n");
}

export function bearPrompt(
  ticker: string,
  asOfDateIso: string,
  round: number,
  analysts: AnalystReport[],
  research: ResearchReport[],
): string {
  return [
    header("Bearish Researcher", ticker, asOfDateIso),
    "",
    `Debate round ${round}. Make the strongest case to AVOID, REDUCE, or SHORT this name. Address the bull's points if any.`,
    "",
    "Analyst reports:",
    renderAnalysts(analysts),
    "",
    "Bull arguments so far:",
    renderResearch(research, "bear"),
    "",
    "Argue primarily from the evidence above. Use WebSearch only for recent open-web context that is missing from the analyst reports, and cite URLs/dates for anything web-sourced.",
    JSON_NOTE,
    'Schema: {"thesis": string, "keyPoints": [string]}',
  ].join("\n");
}

function renderDebateTranscript(research: ResearchReport[]): string {
  return (
    research
      .map(
        (r) =>
          `[${r.role} r${r.round}] ${r.thesis} — ${r.keyPoints.join("; ")}`,
      )
      .join("\n") || "(none)"
  );
}

function renderResearchPlan(plan: ResearchPlan): string {
  return [
    `Recommendation: ${plan.recommendation}`,
    `Rationale: ${plan.rationale}`,
    `Strategic actions: ${plan.strategic_actions}`,
  ].join("\n");
}

export function researchManagerPrompt(
  ticker: string,
  asOfDateIso: string,
  analysts: AnalystReport[],
  research: ResearchReport[],
): string {
  return [
    header("Research Manager", ticker, asOfDateIso),
    "",
    "Critically evaluate the bull/bear debate and deliver a clear, actionable investment plan for the trader.",
    "",
    "Rating Scale (use exactly one):",
    "- Buy: Strong conviction in the bull thesis; recommend taking or growing the position.",
    "- Overweight: Constructive view; recommend gradually increasing exposure.",
    "- Hold: Balanced view; recommend maintaining the current position.",
    "- Underweight: Cautious view; recommend trimming exposure.",
    "- Sell: Strong conviction in the bear thesis; recommend exiting or avoiding the position.",
    "",
    "Commit to a clear stance whenever the debate's strongest arguments warrant one; reserve Hold for situations where the evidence on both sides is genuinely balanced.",
    "",
    "Analyst reports:",
    renderAnalysts(analysts),
    "",
    "Debate transcript:",
    renderDebateTranscript(research),
    "",
    "Synthesize primarily from the evidence above. Use WebSearch only to resolve fresh, material facts, and cite URLs/dates for anything web-sourced.",
    JSON_NOTE,
    'Schema: {"recommendation": "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell", "rationale": string, "strategic_actions": string}',
  ].join("\n");
}

export function traderPrompt(
  ticker: string,
  asOfDateIso: string,
  analysts: AnalystReport[],
  researchPlan: ResearchPlan,
): string {
  return [
    header("Head Trader", ticker, asOfDateIso),
    "",
    "You translate the Research Manager's investment plan into an actionable, sized recommendation.",
    "Tools:",
    "- portfolio_list (see existing exposure)",
    "- account_history (see past fills, cash transactions, and dividend/rights events when trading context matters)",
    "- discover_tickers (compare alternatives by signal/strategy; pass explicit tickers when the user names a basket)",
    "",
    "Analyst reports:",
    renderAnalysts(analysts),
    "",
    "Research Manager plan:",
    renderResearchPlan(researchPlan),
    "",
    "Decide on the 5-tier rating: Buy, Overweight, Hold, Underweight, or Sell. Reserve Hold for genuinely balanced evidence. Size as a fraction of portfolio NAV (0..1). Provide an entry band in thousand VND when proposing directional exposure changes, and a one-line exit plan.",
    SIZING_NOTE,
    JSON_NOTE,
    'Schema: {"rating": "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell", "sizingPct": number, "entryBand": {"low": number, "high": number}, "exitPlan": string, "rationale": string}',
  ].join("\n");
}

export function riskPrompt(
  ticker: string,
  asOfDateIso: string,
  analysts: AnalystReport[],
  trader: TraderDecision,
): string {
  return [
    header("Risk Manager", ticker, asOfDateIso),
    "",
    "You are the last gate. Evaluate the trader's proposal against:",
    " - Current portfolio concentration (portfolio_list).",
    " - Recent broker account history when relevant (account_history).",
    " - Macro backdrop (macro_indices).",
    " - Foreign positioning (foreign_flow).",
    "",
    "Analyst summary scores:",
    analysts.map((a) => `- ${a.role}: ${a.score.toFixed(2)}`).join("\n"),
    "",
    `Trader proposal: ${JSON.stringify(trader)}`,
    "",
    "Approve or reject. If approved with adjustments, lower sizingPct rather than veto outright. Document concerns explicitly.",
    SIZING_NOTE.replace("sizingPct", "adjustedSizingPct"),
    JSON_NOTE,
    'Schema: {"approved": boolean, "adjustedSizingPct": number, "concerns": [string], "notes": string}',
  ].join("\n");
}

export function portfolioPrompt(
  ticker: string,
  asOfDateIso: string,
  analysts: AnalystReport[],
  research: ResearchReport[],
  trader: TraderDecision,
  risk: RiskReview,
): string {
  return [
    header("Portfolio Manager", ticker, asOfDateIso),
    "",
    "Synthesize the entire team's work into ONE final portfolio recommendation.",
    "",
    "Rating Scale (use exactly one):",
    "- Buy: Strong conviction to enter or add to position.",
    "- Overweight: Favorable outlook, gradually increase exposure.",
    "- Hold: Maintain current position, no action needed.",
    "- Underweight: Reduce exposure or take partial profits.",
    "- Sell: Exit position or avoid entry.",
    "",
    "Reserve Hold for genuinely balanced evidence.",
    "",
    `Trader: ${JSON.stringify(trader)}`,
    `Risk: ${JSON.stringify(risk)}`,
    `Analyst scores: ${analysts.map((a) => `${a.role}=${a.score.toFixed(2)}`).join(", ")}`,
    `Debate rounds: ${research.length}`,
    "",
    "Rules:",
    " - If risk.approved is false, you MUST output Hold.",
    " - Final sizingPct = risk.adjustedSizingPct.",
    ` - ${SIZING_NOTE}`,
    " - Rationale must cite the four analyst dimensions (technical / fundamentals / news / sentiment) and the bull-vs-bear conclusion.",
    " - This is advisory: do NOT mention placing or having placed orders.",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"rating": "Buy"|"Overweight"|"Hold"|"Underweight"|"Sell", "sizingPct": number, "exitPlan": string, "rationale": string}',
  ].join("\n");
}

export function teamBullQuestionPrompt(
  question: string,
  asOfDateIso: string,
  prior: ResearchReport[] = [],
): string {
  return [
    questionHeader("Bullish Researcher", question, asOfDateIso),
    "",
    "Make the strongest constructive case for the user's question. If the question asks for an action, argue why that action could be justified.",
    "Use concrete VN-equity reasoning. Use WebSearch for fresh context when needed, and cite URLs/dates. Do not invent market data; say when evidence must be checked.",
    "",
    "Prior debate:",
    renderDebateTranscript(prior),
    "",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"thesis": string, "keyPoints": [string]}',
  ].join("\n");
}

export function teamBearQuestionPrompt(
  question: string,
  asOfDateIso: string,
  prior: ResearchReport[] = [],
): string {
  return [
    questionHeader("Bearish Researcher", question, asOfDateIso),
    "",
    "Make the strongest skeptical case against the user's question. If the question asks for an action, argue why that action could be wrong or premature.",
    "Use concrete VN-equity reasoning. Use WebSearch for fresh context when needed, and cite URLs/dates. Do not invent market data; say when evidence must be checked.",
    "",
    "Prior debate:",
    renderDebateTranscript(prior),
    "",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"thesis": string, "keyPoints": [string]}',
  ].join("\n");
}

export function teamRiskQuestionPrompt(
  question: string,
  asOfDateIso: string,
  research: ResearchReport[],
): string {
  return [
    questionHeader("Risk Manager", question, asOfDateIso),
    "",
    "Evaluate the debate from a portfolio-risk perspective. Use portfolio_list, account_history, macro_indices, and foreign_flow when relevant.",
    "Approve only if the proposed direction is compatible with concentration, market regime, and risk limits. If the question is informational, approve means the answer is safe to act on as advisory context.",
    "",
    "Debate transcript:",
    renderDebateTranscript(research),
    "",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"approved": boolean, "adjustedSizingPct": number, "concerns": [string], "notes": string}',
  ].join("\n");
}

export function teamPortfolioQuestionPrompt(
  question: string,
  asOfDateIso: string,
  research: ResearchReport[],
  risk: RiskReview,
): string {
  return [
    questionHeader("Portfolio Manager", question, asOfDateIso),
    "",
    "Synthesize the full debate into a direct answer to the user's question. Be decisive, but preserve uncertainty where evidence is missing.",
    "",
    "Debate transcript:",
    renderDebateTranscript(research),
    "",
    `Risk review: ${JSON.stringify(risk)}`,
    "",
    "Return a concise answer, the final recommendation, key reasons, risks, and next actions.",
    "This is advisory: do NOT mention placing or having placed orders.",
    userFacingLanguageInstruction(),
    JSON_NOTE,
    'Schema: {"answer": string, "recommendation": string, "keyReasons": [string], "risks": [string], "nextActions": [string]}',
  ].join("\n");
}
