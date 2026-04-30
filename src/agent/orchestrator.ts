import {
  query,
  createSdkMcpServer,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import { ohlcvTool, quoteTool } from "../tools/marketData.js";
import { indicatorsTool } from "../tools/technical.js";
import { fundamentalsTool } from "../tools/fundamentals.js";
import { newsTool } from "../tools/news.js";
import { indicesTool, foreignFlowTool } from "../tools/macro.js";
import {
  listPositionsTool,
  recordPositionTool,
  removePositionTool,
} from "../tools/portfolio.js";
import { journalAppendTool, journalReadTool } from "../tools/journal.js";
import { loadConfig } from "../config/loader.js";

export function buildSystemPrompt(): string {
  const cfg = loadConfig();
  return [
    "You are VNStockAgent, an investment analyst for the Vietnamese stock market (HOSE / HNX / UPCOM).",
    `Current autonomy mode: ${cfg.autonomy}. Phase 1 is advisory only — you have NO order-placement tools yet.`,
    `Default watchlist: ${cfg.watchlist.join(", ")}.`,
    "",
    "Tools available:",
    "- market_quote: latest reference / ceiling / floor / company info (SSI iBoard).",
    "- market_ohlcv: OHLCV bars for a stock or index (DNSE).",
    "- technical_indicators: compute RSI / MACD / SMA / EMA / Bollinger from DNSE bars.",
    "- fundamentals_snapshot: P/E, P/B, ROE, ROA, EPS, BVPS, market cap, recent quarterly ratios (VNDirect Finfo + CafeF).",
    "- ticker_news: recent news, industry news, and company disclosures from CafeF.",
    "- macro_indices: VNINDEX/VN30/HNXINDEX/UPCOMINDEX latest close + 1d/1w/1m % change.",
    "- foreign_flow: per-ticker foreign buy/sell/net week-to-date and ownership %.",
    "- portfolio_list / portfolio_record / portfolio_remove: read and update the user's positions in local SQLite. Avg cost is in thousand VND.",
    "- journal_append / journal_read: persist and review past decisions.",
    "",
    "Operating rules:",
    "1. Always ground recommendations in tool output, not memory. Cite the value, ticker, and source you used.",
    "2. Vietnamese tickers are 3-letter (4 for some derivatives). Uppercase them.",
    "3. Prices from DNSE/SSI are quoted in thousand VND for stocks (e.g. 28.5 means 28,500 VND). State units explicitly.",
    "4. For a buy/sell/hold recommendation, call at minimum technical_indicators, fundamentals_snapshot, ticker_news, AND macro_indices. Add foreign_flow when institutional positioning is relevant.",
    "5. When citing news, include the URL and publish date so the user can verify.",
    "6. After delivering a recommendation, call journal_append to persist the rationale and exit plan.",
    "7. Keep replies concise. Show the numbers, then a one-paragraph synthesis covering all four dimensions (technical / fundamental / news / macro).",
    "8. Phase 1 has NO order-placement tools. Never claim to have placed an order. The user executes manually.",
  ].join("\n");
}

export function buildMcpServer() {
  return createSdkMcpServer({
    name: "vnstock",
    tools: [
      quoteTool,
      ohlcvTool,
      indicatorsTool,
      fundamentalsTool,
      newsTool,
      indicesTool,
      foreignFlowTool,
      listPositionsTool,
      recordPositionTool,
      removePositionTool,
      journalAppendTool,
      journalReadTool,
    ],
  });
}

export function buildOptions(): Options {
  const cfg = loadConfig();
  return {
    model: cfg.model,
    systemPrompt: buildSystemPrompt(),
    mcpServers: {
      vnstock: {
        type: "sdk",
        name: "vnstock",
        instance: buildMcpServer(),
      },
    },
  };
}

export async function* runTurn(prompt: string) {
  const stream = query({ prompt, options: buildOptions() });
  for await (const message of stream) {
    yield message;
  }
}
