import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { ohlcvTool, quoteTool } from "../../tools/marketData.js";
import { indicatorsTool } from "../../tools/technical.js";
import { fundamentalsTool } from "../../tools/fundamentals.js";
import { newsTool } from "../../tools/news.js";
import { indicesTool, foreignFlowTool } from "../../tools/macro.js";
import { listPositionsTool } from "../../tools/portfolio.js";
import { journalReadTool } from "../../tools/journal.js";
import { discoverTickersTool } from "../../tools/discover.js";
import type { RoleName } from "./state.js";

type AnyTool = NonNullable<Parameters<typeof createSdkMcpServer>[0]["tools"]>[number];

const TOOL_BY_NAME: Record<string, AnyTool> = {
  market_quote: quoteTool as unknown as AnyTool,
  market_ohlcv: ohlcvTool as unknown as AnyTool,
  technical_indicators: indicatorsTool as unknown as AnyTool,
  fundamentals_snapshot: fundamentalsTool as unknown as AnyTool,
  ticker_news: newsTool as unknown as AnyTool,
  macro_indices: indicesTool as unknown as AnyTool,
  foreign_flow: foreignFlowTool as unknown as AnyTool,
  portfolio_list: listPositionsTool as unknown as AnyTool,
  journal_read: journalReadTool as unknown as AnyTool,
  discover_tickers: discoverTickersTool as unknown as AnyTool,
};

/**
 * Whitelist of tool names each role can call. Researcher / portfolio-manager
 * roles get nothing — their job is synthesis over prior state. Journal-append
 * is performed by the runner after the portfolio role decides, not as a tool
 * call, so it is intentionally absent everywhere.
 */
export const ROLE_TOOLS: Record<RoleName, string[]> = {
  technical: ["market_quote", "market_ohlcv", "technical_indicators"],
  fundamentals: ["fundamentals_snapshot", "market_quote"],
  news: ["ticker_news", "macro_indices"],
  sentiment: ["ticker_news", "foreign_flow"],
  bull: [],
  bear: [],
  trader: ["portfolio_list", "discover_tickers", "journal_read"],
  risk: ["portfolio_list", "macro_indices", "foreign_flow"],
  portfolio: [],
};

export function buildRoleMcpServer(role: RoleName) {
  const names = ROLE_TOOLS[role];
  const tools = names
    .map((n) => TOOL_BY_NAME[n])
    .filter((t): t is AnyTool => t != null);
  return createSdkMcpServer({
    name: `azoth-${role}`,
    tools,
  });
}

export function allowedToolIds(role: RoleName): string[] {
  return ROLE_TOOLS[role].map((n) => `mcp__azoth-${role}__${n}`);
}
