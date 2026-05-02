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
import { discoverTickersTool } from "../tools/discover.js";
import {
  placeOrderTool,
  cancelOrderTool,
  listOrdersTool,
  brokerStateTool,
} from "../tools/order.js";
import { loadConfig } from "../config/loader.js";
import { asOfClock, setActiveAsOf, type AsOfStore } from "./clock.js";
import type { AgentPersona } from "./personas.js";
import {
  activateSession,
  appendSessionRecord,
  createSession,
  findSession,
  getActiveSession,
  latestSession,
  listSessions,
  readSessionRecords,
  touchSession,
  type SessionIndexEntry,
  type SessionRecord,
} from "../runtime/sessionStore.js";

export function buildSystemPrompt(): string {
  const cfg = loadConfig();
  return [
    "You are Azoth, an investment analyst for the Vietnamese stock market (HOSE / HNX / UPCOM).",
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
    "- discover_tickers: dynamically scan a curated VN30+midcap universe by criterion (momentum / breakout / oversold / low_volatility / high_volume / top_gainers / top_losers) and return 5–10 ranked candidates. Use to build your own watchlist instead of relying on a fixed list.",
    cfg.autonomy === "advisory"
      ? "- (no order tools — autonomy=advisory)"
      : "- place_order / cancel_order / list_orders / broker_state: trade through the configured broker (paper or dnse). Quantity must be a multiple of 100. Prices are in thousand VND.",
    "",
    "Operating rules:",
    "1. Always ground recommendations in tool output, not memory. Cite the value, ticker, and source you used.",
    "2. Vietnamese tickers are 3-letter (4 for some derivatives). Uppercase them.",
    "3. Prices from DNSE/SSI are quoted in thousand VND for stocks (e.g. 28.5 means 28,500 VND). State units explicitly.",
    "3a. Settlement is T+2.5 (HOSE/HNX/UPCOM): shares bought today are deliverable T+2 ~13:00 ICT; sale proceeds become usable cash on the same T+2 timeline. Never propose same-day round-trips.",
    "4. For a buy/sell/hold recommendation, call at minimum technical_indicators, fundamentals_snapshot, ticker_news, AND macro_indices. Add foreign_flow when institutional positioning is relevant.",
    "5. When citing news, include the URL and publish date so the user can verify.",
    "6. After delivering a recommendation, call journal_append to persist the rationale and exit plan.",
    "7. Keep replies concise. Show the numbers, then a one-paragraph synthesis covering all four dimensions (technical / fundamental / news / macro).",
    cfg.autonomy === "advisory"
      ? "8. Order-placement tools are NOT available in advisory mode. Recommend; do not claim to have placed an order. The user executes manually."
      : `8. Order tools ARE available (autonomy=${cfg.autonomy}, broker=${cfg.broker}). In 'confirm' mode the user is prompted in the CLI; in 'auto' the order goes through risk guardrails. Always call journal_append after a fill.`,
  ].join("\n");
}

export function buildMcpServer() {
  const cfg = loadConfig();
  const baseTools = [
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
    discoverTickersTool,
  ];
  const orderTools = [
    placeOrderTool,
    cancelOrderTool,
    listOrdersTool,
    brokerStateTool,
  ];
  const tools =
    cfg.autonomy === "advisory"
      ? baseTools
      : [...baseTools, ...orderTools];
  // SDK accepts a heterogeneous tool array; widen the element type.
  return createSdkMcpServer({
    name: "vnstock",
    tools: tools as unknown as Parameters<typeof createSdkMcpServer>[0]["tools"],
  });
}

export function buildOptions(opts: { resume?: string } = {}): Options {
  const cfg = loadConfig();
  return {
    model: cfg.model,
    systemPrompt: buildSystemPrompt(),
    ...(opts.resume ? { resume: opts.resume } : {}),
    mcpServers: {
      vnstock: buildMcpServer(),
    },
    includePartialMessages: true,
    // Restrict to our MCP tools — the SDK's default toolset (Bash, Read, Edit,
    // Task, …) is unnecessary for an analyst agent and can confuse non-Claude
    // models like GLM into recursive subagent calls.
    allowedTools: [
      "mcp__vnstock__market_quote",
      "mcp__vnstock__market_ohlcv",
      "mcp__vnstock__technical_indicators",
      "mcp__vnstock__fundamentals_snapshot",
      "mcp__vnstock__ticker_news",
      "mcp__vnstock__macro_indices",
      "mcp__vnstock__foreign_flow",
      "mcp__vnstock__portfolio_list",
      "mcp__vnstock__portfolio_record",
      "mcp__vnstock__portfolio_remove",
      "mcp__vnstock__journal_append",
      "mcp__vnstock__journal_read",
      "mcp__vnstock__discover_tickers",
      ...(cfg.autonomy === "advisory"
        ? []
        : [
            "mcp__vnstock__place_order",
            "mcp__vnstock__cancel_order",
            "mcp__vnstock__list_orders",
            "mcp__vnstock__broker_state",
          ]),
    ],
  };
}

let activeSessionId: string | undefined;
let activeLocalSessionId: string | undefined;

export function resetSession() {
  const cfg = loadConfig();
  const session = createSession({
    model: cfg.model,
    autonomy: cfg.autonomy,
  });
  activeLocalSessionId = session.id;
  activeSessionId = undefined;
}

export function startNewSession(title?: string): SessionIndexEntry {
  const cfg = loadConfig();
  const session = createSession({
    title,
    model: cfg.model,
    autonomy: cfg.autonomy,
  });
  activeLocalSessionId = session.id;
  activeSessionId = undefined;
  return session;
}

export function resumeLatestSession(): SessionIndexEntry | undefined {
  const active = getActiveSession();
  const session = active ? findSession(active.id) : latestSession();
  if (!session) return undefined;
  activeLocalSessionId = session.id;
  activeSessionId = session.sdkSessionId;
  activateSession(session.id);
  return session;
}

export function resumeSession(id: string): SessionIndexEntry | undefined {
  const session = activateSession(id);
  if (!session) return undefined;
  activeLocalSessionId = session.id;
  activeSessionId = session.sdkSessionId;
  return session;
}

export function recentSessions(limit = 10): SessionIndexEntry[] {
  return listSessions().slice(0, limit);
}

export function readActiveSessionRecords(): SessionRecord[] {
  const session = resumeLatestSession();
  return session ? readSessionRecords(session.id) : [];
}

function ensureActiveChatSession(prompt: string): SessionIndexEntry {
  const existing = activeLocalSessionId ? findSession(activeLocalSessionId) : resumeLatestSession();
  if (existing) return existing;
  return startNewSession(prompt.slice(0, 80) || "Untitled session");
}

function recordSessionId(sdkSessionId: string, cfg: ReturnType<typeof loadConfig>) {
  if (!activeLocalSessionId) return;
  activeSessionId = sdkSessionId;
  touchSession(activeLocalSessionId, { sdkSessionId, model: cfg.model, autonomy: cfg.autonomy });
  appendSessionRecord(activeLocalSessionId, {
    type: "system",
    timestamp: Date.now(),
    sessionId: activeLocalSessionId,
    cwd: process.cwd(),
    sdkSessionId,
    model: cfg.model,
    autonomy: cfg.autonomy,
  });
}

export async function* runTurn(prompt: string) {
  const cfg = loadConfig();
  const session = ensureActiveChatSession(prompt);
  activeLocalSessionId = session.id;
  activeSessionId = session.sdkSessionId;
  appendSessionRecord(session.id, {
    type: "user",
    timestamp: Date.now(),
    sessionId: session.id,
    cwd: process.cwd(),
    text: prompt,
    model: cfg.model,
    autonomy: cfg.autonomy,
  });

  const stream = query({
    prompt,
    options: buildOptions({ resume: activeSessionId }),
  });
  type TextBlock = { type: "assistant" | "thinking"; text: string };
  type ToolBlock = { type: "tool_use"; toolName?: string; toolUseId?: string; toolInput: string };
  let currentBlock: TextBlock | ToolBlock | null = null;

  const flushCurrentBlock = () => {
    if (!currentBlock || !activeLocalSessionId) return;
    const base = {
      timestamp: Date.now(),
      sessionId: activeLocalSessionId,
      cwd: process.cwd(),
      model: cfg.model,
      autonomy: cfg.autonomy,
    };
    if (currentBlock.type === "assistant" || currentBlock.type === "thinking") {
      if (currentBlock.text) {
        appendSessionRecord(activeLocalSessionId, {
          ...base,
          type: currentBlock.type,
          text: currentBlock.text,
        });
      }
    } else if (currentBlock.type === "tool_use") {
      appendSessionRecord(activeLocalSessionId, {
        ...base,
        type: "tool_use",
        toolName: currentBlock.toolName,
        toolUseId: currentBlock.toolUseId,
        toolInput: currentBlock.toolInput,
      });
    }
    currentBlock = null;
  };

  for await (const message of stream) {
    if (message.type === "stream_event") {
      const ev = (message as { event: any }).event;
      if (ev?.type === "content_block_start") {
        flushCurrentBlock();
        const cb = ev.content_block;
        if (cb?.type === "thinking") {
          currentBlock = { type: "thinking", text: "" };
        } else if (cb?.type === "text") {
          currentBlock = { type: "assistant", text: "" };
        } else if (cb?.type === "tool_use") {
          currentBlock = {
            type: "tool_use",
            toolName: cb.name,
            toolUseId: cb.id,
            toolInput: "",
          };
        }
      } else if (ev?.type === "content_block_delta") {
        const d = ev.delta;
        if (d?.type === "thinking_delta" && d.thinking && currentBlock?.type === "thinking") {
          currentBlock.text += d.thinking;
        } else if (d?.type === "text_delta" && d.text && currentBlock?.type === "assistant") {
          currentBlock.text += d.text;
        } else if (d?.type === "input_json_delta" && d.partial_json && currentBlock?.type === "tool_use") {
          currentBlock.toolInput += d.partial_json;
        }
      } else if (ev?.type === "content_block_stop" || ev?.type === "message_stop") {
        flushCurrentBlock();
      }
    } else if (message.type === "user") {
      const content = (message as any).message?.content;
      if (Array.isArray(content) && activeLocalSessionId) {
        for (const c of content) {
          if (c?.type === "tool_result") {
            const text = typeof c.content === "string"
              ? c.content
              : Array.isArray(c.content)
                ? c.content.map((x: any) => x?.text ?? "").join("")
                : JSON.stringify(c.content);
            appendSessionRecord(activeLocalSessionId, {
              type: "tool_result",
              timestamp: Date.now(),
              sessionId: activeLocalSessionId,
              cwd: process.cwd(),
              text: text.slice(0, 4000),
              toolUseId: c.tool_use_id,
              model: cfg.model,
              autonomy: cfg.autonomy,
            });
          }
        }
      }
    }
    if (message.type === "system" && (message as { subtype?: string }).subtype === "init") {
      const sid = (message as { session_id?: string }).session_id;
      if (sid) recordSessionId(sid, cfg);
    } else if (message.type === "result") {
      flushCurrentBlock();
      const r = message as unknown as {
        session_id?: string;
        total_cost_usd?: number;
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      if (r.session_id) recordSessionId(r.session_id, cfg);
      if (activeLocalSessionId) {
        appendSessionRecord(activeLocalSessionId, {
          type: "result",
          timestamp: Date.now(),
          sessionId: activeLocalSessionId,
          cwd: process.cwd(),
          sdkSessionId: r.session_id,
          usage: {
            inputTokens: r.usage?.input_tokens,
            outputTokens: r.usage?.output_tokens,
            cacheReadTokens: r.usage?.cache_read_input_tokens,
            cacheCreationTokens: r.usage?.cache_creation_input_tokens,
          },
          costUsd: r.total_cost_usd,
          model: cfg.model,
          autonomy: cfg.autonomy,
        });
      }
    }
    yield message;
  }
  flushCurrentBlock();
}

// ---------- Backtest mode ---------------------------------------------------

export function buildBacktestSystemPrompt(
  persona: AgentPersona,
  asOfDateIso: string,
): string {
  return [
    "You are Azoth running in BACKTEST MODE.",
    "Treat the simulated current date provided at the end of this prompt as 'today' — every tool call returns data as of that date. Do NOT mention or assume access to information beyond it.",
    "",
    "You are NOT given a fixed watchlist. Build your own each week using discover_tickers, choosing the criterion that matches your strategy. Aim for 5–10 candidates per turn, then narrow further with technical_indicators.",
    "",
    "Available tools (subset of live mode — fundamentals/news/macro/foreign-flow are intentionally disabled because point-in-time replay is not available for those sources):",
    "- discover_tickers: scan ~28 liquid VN30+midcap names by criterion (momentum / breakout / oversold / low_volatility / high_volume / top_gainers / top_losers) and return 5–10 ranked candidates. CALL THIS FIRST.",
    "- market_quote / market_ohlcv: price + bars up to today.",
    "- technical_indicators: RSI / MACD / SMA / EMA / Bollinger from daily bars.",
    "- portfolio_list / portfolio_record / portfolio_remove: read/write the positions ledger.",
    "- journal_append / journal_read: persist and review your own decisions across weeks.",
    "- place_order / cancel_order / list_orders / broker_state: trade through the per-run paper broker. Quantity must be a multiple of 100. Prices are in thousand VND.",
    "",
    "Operating rules:",
    "1. Each turn represents one Friday close. You decide what to do for the coming week.",
    "2. Start with broker_state, then discover_tickers (criterion of your choice), then technical_indicators on the top 3–5 candidates.",
    "3. For every ticker you act on or explicitly skip, call journal_append with action ∈ {BUY,SELL,HOLD,WATCH} and a short rationale.",
    "4. Place trades via place_order. MARKET orders fill at this Friday's close ± slippage. Position size: keep any single name ≤15% of equity.",
    "5. VN settlement is T+2.5 (HOSE/HNX/UPCOM): you cannot sell shares the same day you buy them. Weekly cadence makes this a non-issue, but plan exits ≥1 week from entry.",
    "6. Be decisive. Brief output. The harness only cares about your tool calls.",
    "",
    persona.systemPromptAppend,
    "",
    `Simulated today: ${asOfDateIso}.`,
  ].join("\n");
}

export function buildBacktestOptions(opts: {
  persona: AgentPersona;
  asOfDateIso: string;
  resume?: string;
}): Options {
  const cfg = loadConfig();
  return {
    model: cfg.model,
    systemPrompt: buildBacktestSystemPrompt(opts.persona, opts.asOfDateIso),
    ...(opts.resume ? { resume: opts.resume } : {}),
    mcpServers: {
      vnstock: buildMcpServer(),
    },
    includePartialMessages: true,
    allowedTools: [
      "mcp__vnstock__market_quote",
      "mcp__vnstock__market_ohlcv",
      "mcp__vnstock__technical_indicators",
      "mcp__vnstock__portfolio_list",
      "mcp__vnstock__portfolio_record",
      "mcp__vnstock__portfolio_remove",
      "mcp__vnstock__journal_append",
      "mcp__vnstock__journal_read",
      "mcp__vnstock__discover_tickers",
      "mcp__vnstock__place_order",
      "mcp__vnstock__cancel_order",
      "mcp__vnstock__list_orders",
      "mcp__vnstock__broker_state",
    ],
  };
}

export interface BacktestTurnContext {
  persona: AgentPersona;
  asOfStore: AsOfStore;
  asOfDateIso: string;
  /** Resume token from the previous week of the same run. */
  resume?: string;
}

/**
 * Run a single backtest turn within the given as-of clock. The async generator
 * yields raw SDK messages so the caller can stream / record tokens / capture
 * the post-turn session_id.
 */
export async function* runBacktestTurn(
  prompt: string,
  ctx: BacktestTurnContext,
) {
  // We need an async generator that runs *inside* asOfClock.run. ALS preserves
  // the store across awaits, so wrapping the generator body works.
  const opts = buildBacktestOptions({
    persona: ctx.persona,
    asOfDateIso: ctx.asOfDateIso,
    resume: ctx.resume,
  });
  // Set module-level override so tool handlers dispatched from the SDK's
  // MCP bridge (which loses ALS context) still see the simulated date and
  // per-run broker. ALS is also set, for any in-process call-chains.
  setActiveAsOf(ctx.asOfStore);
  try {
    const stream = asOfClock.run(ctx.asOfStore, () =>
      query({ prompt, options: opts }),
    );
    for await (const message of stream) {
      yield message;
    }
  } finally {
    setActiveAsOf(null);
  }
}
