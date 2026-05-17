import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { ohlcvTool, quoteTool } from "../../tools/marketData.js";
import { liveChartTool } from "../../tools/liveChart.js";
import { indicatorsTool } from "../../tools/technical.js";
import { fundamentalsTool } from "../../tools/fundamentals.js";
import { newsTool } from "../../tools/news.js";
import { indicesTool, foreignFlowTool } from "../../tools/macro.js";
import { listPositionsTool } from "../../tools/portfolio.js";
import { accountHistoryTool } from "../../tools/accountHistory.js";
import { discoverTickersTool } from "../../tools/discover.js";
import type { RoleName } from "./state.js";

type AnyTool = NonNullable<Parameters<typeof createSdkMcpServer>[0]["tools"]>[number];

const TOOL_BY_NAME: Record<string, AnyTool> = {
  market_quote: quoteTool as unknown as AnyTool,
  market_ohlcv: ohlcvTool as unknown as AnyTool,
  live_chart: liveChartTool as unknown as AnyTool,
  technical_indicators: indicatorsTool as unknown as AnyTool,
  fundamentals_snapshot: fundamentalsTool as unknown as AnyTool,
  ticker_news: newsTool as unknown as AnyTool,
  macro_indices: indicesTool as unknown as AnyTool,
  foreign_flow: foreignFlowTool as unknown as AnyTool,
  portfolio_list: listPositionsTool as unknown as AnyTool,
  account_history: accountHistoryTool as unknown as AnyTool,
  discover_tickers: discoverTickersTool as unknown as AnyTool,
};

/**
 * Whitelist of tool names each role can call. Researcher / portfolio-manager
 * roles get nothing — their job is synthesis over prior state.
 */
export const ROLE_TOOLS: Record<RoleName, string[]> = {
  technical: ["market_quote", "live_chart", "market_ohlcv", "technical_indicators"],
  fundamentals: ["fundamentals_snapshot", "market_quote"],
  news: ["ticker_news", "macro_indices"],
  sentiment: ["ticker_news", "foreign_flow"],
  bull: [],
  bear: [],
  researchManager: [],
  trader: ["portfolio_list", "account_history", "discover_tickers"],
  risk: ["portfolio_list", "account_history", "macro_indices", "foreign_flow"],
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
