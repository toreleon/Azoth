import type {
  AnalystReport,
  ResearchReport,
  TraderDecision,
  RiskReview,
} from "./state.js";

const PRICE_NOTE =
  "VN stock prices are quoted in thousand VND on DNSE/SSI (e.g. 28.5 means 28,500 VND). Tickers are uppercase 3 letters (4 for derivatives).";

const JSON_NOTE =
  "Return ONLY a single JSON object as your final assistant message. No prose around the JSON, no markdown fences. Use double quotes.";

function header(role: string, ticker: string, asOfDateIso: string) {
  return [
    `You are the ${role} on Azoth's multi-agent VN-equity desk.`,
    `Subject ticker: ${ticker}. As-of: ${asOfDateIso}.`,
    PRICE_NOTE,
  ].join("\n");
}

export function technicalPrompt(ticker: string, asOfDateIso: string): string {
  return [
    header("Technical Analyst", ticker, asOfDateIso),
    "",
    "Use market_quote, market_ohlcv (1D, ~60 bars), and technical_indicators to assess trend, momentum, and volatility.",
    "Cite at least RSI(14), MACD, and a moving-average view (SMA20/50). Note any divergence or breakout/breakdown levels.",
    "",
    "Score the technical setup on -1..1 (bearish to bullish). 0 = neutral.",
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
    "You have NO tools — argue from the evidence above. Cite specific scores / numbers.",
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
    "You have NO tools — argue from the evidence above. Cite specific scores / numbers.",
    JSON_NOTE,
    'Schema: {"thesis": string, "keyPoints": [string]}',
  ].join("\n");
}

export function traderPrompt(
  ticker: string,
  asOfDateIso: string,
  analysts: AnalystReport[],
  research: ResearchReport[],
): string {
  return [
    header("Head Trader", ticker, asOfDateIso),
    "",
    "You translate the analyst + bull/bear debate into an actionable, sized recommendation.",
    "Tools:",
    "- portfolio_list (see existing exposure)",
    "- journal_read (recent decisions on this name)",
    "- discover_tickers (only if you need to compare alternatives)",
    "",
    "Analyst reports:",
    renderAnalysts(analysts),
    "",
    "Debate transcript:",
    research
      .map(
        (r) =>
          `[${r.role} r${r.round}] ${r.thesis} — ${r.keyPoints.join("; ")}`,
      )
      .join("\n") || "(none)",
    "",
    "Decide: BUY, SELL, HOLD, or WATCH. Size as a fraction of portfolio NAV (0..1). Provide an entry band in thousand VND when proposing BUY/SELL, and a one-line exit plan.",
    JSON_NOTE,
    'Schema: {"action": "BUY"|"SELL"|"HOLD"|"WATCH", "sizingPct": number, "entryBand": {"low": number, "high": number}, "exitPlan": string, "rationale": string}',
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
    " - Macro backdrop (macro_indices).",
    " - Foreign positioning (foreign_flow).",
    "",
    "Analyst summary scores:",
    analysts.map((a) => `- ${a.role}: ${a.score.toFixed(2)}`).join("\n"),
    "",
    `Trader proposal: ${JSON.stringify(trader)}`,
    "",
    "Approve or reject. If approved with adjustments, lower sizingPct rather than veto outright. Document concerns explicitly.",
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
    "Synthesize the entire team's work into ONE final, journal-ready decision. The journal entry is the audit trail.",
    "",
    `Trader: ${JSON.stringify(trader)}`,
    `Risk: ${JSON.stringify(risk)}`,
    `Analyst scores: ${analysts.map((a) => `${a.role}=${a.score.toFixed(2)}`).join(", ")}`,
    `Debate rounds: ${research.length}`,
    "",
    "Rules:",
    " - If risk.approved is false, you MUST output HOLD or WATCH (no BUY/SELL).",
    " - Final sizingPct = risk.adjustedSizingPct.",
    " - Rationale must cite the four analyst dimensions (technical / fundamentals / news / sentiment) and the bull-vs-bear conclusion.",
    " - This is advisory: do NOT mention placing or having placed orders.",
    JSON_NOTE,
    'Schema: {"action": "BUY"|"SELL"|"HOLD"|"WATCH", "sizingPct": number, "exitPlan": string, "rationale": string}',
  ].join("\n");
}
