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
} from "../tools/portfolio.js";
import { journalAppendTool, journalReadTool } from "../tools/journal.js";
import { discoverTickersTool } from "../tools/discover.js";
import { teamAnalyzeTool, teamQuestionTool } from "../tools/team.js";
import {
  placeOrderTool,
  cancelOrderTool,
  listOrdersTool,
  brokerStateTool,
} from "../tools/order.js";
import { loadConfig } from "../config/loader.js";
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
    cfg.autonomy === "advisory"
      ? "Current autonomy mode: advisory. Order-placement tools are unavailable."
      : `Current autonomy mode: ${cfg.autonomy}. Order-placement tools are available through the configured ${cfg.broker} broker.`,
    "",
    "Tools available:",
    "- market_quote: latest reference / ceiling / floor / company info (SSI iBoard).",
    "- market_ohlcv: OHLCV bars for a stock or index (DNSE).",
    "- technical_indicators: compute RSI / MACD / SMA / EMA / Bollinger from DNSE bars.",
    "- fundamentals_snapshot: P/E, P/B, ROE, ROA, EPS, BVPS, market cap, recent quarterly ratios (VNDirect Finfo + CafeF).",
    "- ticker_news: recent news, industry news, and company disclosures from CafeF.",
    "- WebSearch: open-web search for current context not covered by Azoth data tools. Cite URLs and dates; prefer Azoth market tools for prices, financials, and VN ticker news.",
    "- macro_indices: VNINDEX/VN30/HNXINDEX/UPCOMINDEX latest close + 1d/1w/1m % change.",
    "- foreign_flow: per-ticker foreign buy/sell/net week-to-date and ownership %.",
    "- portfolio_list: read broker cash, positions, exposure, and unrealized P&L. Avg cost and last close are in thousand VND; monetary totals are in VND.",
    "- journal_append / journal_read: persist and review past decisions.",
    "- discover_tickers: dynamically scan a curated VN30+midcap universe by criterion (momentum / breakout / oversold / low_volatility / high_volume / top_gainers / top_losers) and return 5–10 ranked candidates.",
    "- team_question: delegate complex market, portfolio, or allocation questions to Azoth's bull/bear/risk/portfolio team.",
    "- team_analyze: delegate deep single-ticker buy/sell/hold analysis to Azoth's full analyst/research/trader/risk/portfolio team.",
    cfg.autonomy === "advisory"
      ? "- (no order tools — autonomy=advisory)"
      : "- place_order / cancel_order / list_orders / broker_state: trade through the configured broker (paper or dnse). Quantity must be a multiple of 100. Prices are in thousand VND.",
    "",
    "Operating rules:",
    "1. Always ground recommendations in tool output, not memory. Cite the value, ticker, and source you used.",
    "2. Vietnamese tickers are 3-letter (4 for some derivatives). Uppercase them.",
    "3. Prices from DNSE/SSI are quoted in thousand VND for stocks (e.g. 28.5 means 28,500 VND). State units explicitly.",
    "3a. Formal settlement for HOSE/HNX/UPCOM shares, fund certificates, and covered warrants is T+2. In practice securities and sale proceeds are credited before about 13:00 ICT on T+2, so they are usable from the afternoon T+2 session. Never call this a formal T+2.5 cycle and never propose same-day round-trips.",
    "4. For a buy/sell/hold recommendation, call at minimum technical_indicators, fundamentals_snapshot, ticker_news, AND macro_indices. Add foreign_flow when institutional positioning is relevant.",
    "4a. For broad allocation questions or complex multi-factor decisions, call team_question. For a deep recommendation on one ticker, call team_analyze instead of manually recreating the whole team workflow.",
    "4b. When you call team_question or team_analyze, wait for that team tool to finish and then summarize its findings. Do not call duplicate market/fundamental/news/technical tools in parallel unless the user explicitly asks for raw source data.",
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
    journalAppendTool,
    journalReadTool,
    discoverTickersTool,
    teamQuestionTool,
    teamAnalyzeTool,
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
    name: "azoth",
    tools: tools as unknown as Parameters<typeof createSdkMcpServer>[0]["tools"],
  });
}

export function buildOptions(opts: { resume?: string; abortController?: AbortController } = {}): Options {
  const cfg = loadConfig();
  return {
    model: cfg.model,
    systemPrompt: buildSystemPrompt(),
    ...(opts.resume ? { resume: opts.resume } : {}),
    ...(opts.abortController ? { abortController: opts.abortController } : {}),
    mcpServers: {
      azoth: buildMcpServer(),
    },
    includePartialMessages: true,
    // Restrict Claude Code built-ins to WebSearch. Bash, Read, Edit, Task, …
    // are unnecessary for an analyst agent and can confuse non-Claude models
    // like GLM into recursive subagent calls.
    tools: ["WebSearch"],
    allowedTools: [
      "WebSearch",
      "mcp__azoth__market_quote",
      "mcp__azoth__market_ohlcv",
      "mcp__azoth__technical_indicators",
      "mcp__azoth__fundamentals_snapshot",
      "mcp__azoth__ticker_news",
      "mcp__azoth__macro_indices",
      "mcp__azoth__foreign_flow",
      "mcp__azoth__portfolio_list",
      "mcp__azoth__journal_append",
      "mcp__azoth__journal_read",
      "mcp__azoth__discover_tickers",
      "mcp__azoth__team_question",
      "mcp__azoth__team_analyze",
      ...(cfg.autonomy === "advisory"
        ? []
        : [
            "mcp__azoth__place_order",
            "mcp__azoth__cancel_order",
            "mcp__azoth__list_orders",
            "mcp__azoth__broker_state",
          ]),
    ],
  };
}

let activeSessionId: string | undefined;
let activeLocalSessionId: string | undefined;
const pendingLocalContext: string[] = [];

export function resetSession() {
  const cfg = loadConfig();
  const session = createSession({
    model: cfg.model,
    autonomy: cfg.autonomy,
  });
  activeLocalSessionId = session.id;
  activeSessionId = undefined;
  pendingLocalContext.length = 0;
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
  pendingLocalContext.length = 0;
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

export function recordLocalTurn(prompt: string, response: string): void {
  const cfg = loadConfig();
  const session = ensureActiveChatSession(prompt);
  activeLocalSessionId = session.id;
  const base = {
    timestamp: Date.now(),
    sessionId: session.id,
    cwd: process.cwd(),
    model: cfg.model,
    autonomy: cfg.autonomy,
  };
  appendSessionRecord(session.id, {
    ...base,
    type: "user",
    text: prompt,
  });
  appendSessionRecord(session.id, {
    ...base,
    timestamp: Date.now(),
    type: "assistant",
    text: response,
  });
  pendingLocalContext.push(`User command: ${prompt}\nCommand response:\n${response}`);
}

function ensureActiveChatSession(prompt: string): SessionIndexEntry {
  const existing = activeLocalSessionId ? findSession(activeLocalSessionId) : resumeLatestSession();
  if (existing) return existing;
  return startNewSession(prompt.slice(0, 80) || "Untitled session");
}

function pendingContextFromRecords(records: SessionRecord[]): string[] {
  let lastResultIdx = -1;
  for (let i = records.length - 1; i >= 0; i--) {
    if (records[i]?.type === "result") {
      lastResultIdx = i;
      break;
    }
  }
  const tail = records.slice(lastResultIdx + 1);
  const contexts: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const user = tail[i];
    const assistant = tail[i + 1];
    if (user?.type === "user" && assistant?.type === "assistant" && user.text && assistant.text) {
      contexts.push(`User command: ${user.text}\nCommand response:\n${assistant.text}`);
      i += 1;
    }
  }
  return contexts;
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

export async function* runTurn(prompt: string, opts: { signal?: AbortSignal } = {}) {
  const cfg = loadConfig();
  const abortController = new AbortController();
  const abortFromSignal = () => abortController.abort(opts.signal?.reason);
  if (opts.signal?.aborted) abortFromSignal();
  else opts.signal?.addEventListener("abort", abortFromSignal, { once: true });
  const session = ensureActiveChatSession(prompt);
  activeLocalSessionId = session.id;
  activeSessionId = session.sdkSessionId;
  const localContext = pendingLocalContext.length
    ? pendingLocalContext.splice(0)
    : pendingContextFromRecords(readSessionRecords(session.id));
  const sdkPrompt = localContext.length
    ? [
        "Context from local Azoth commands run earlier in this chat. Use it as prior conversation context for this turn:",
        localContext.join("\n\n---\n\n"),
        "",
        "User follow-up:",
        prompt,
      ].join("\n")
    : prompt;
  appendSessionRecord(session.id, {
    type: "user",
    timestamp: Date.now(),
    sessionId: session.id,
    cwd: process.cwd(),
    text: prompt,
    model: cfg.model,
    autonomy: cfg.autonomy,
  });

  // Attempt to resume the prior SDK session. If Claude Code can no longer
  // find that conversation (subprocess exits with code 1 on startup), drop
  // the stale id and retry once with a fresh session.
  const startStream = (resume: string | undefined) =>
    query({ prompt: sdkPrompt, options: buildOptions({ resume, abortController }) });
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

  const consume = async function* (resume: string | undefined) {
    const stream = startStream(resume);
    for await (const message of stream) yield message;
  };

  let attempt: AsyncGenerator<any, void, void> = consume(activeSessionId);
  let triedFreshRetry = activeSessionId == null;

  try {
    while (true) {
      try {
        for await (const message of attempt) {
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
        break;
      } catch (err) {
        const msg = (err as Error)?.message ?? "";
        if (!triedFreshRetry && /exited with code 1|No conversation found/i.test(msg)) {
          triedFreshRetry = true;
          activeSessionId = undefined;
          currentBlock = null;
          attempt = consume(undefined);
          continue;
        }
        throw err;
      }
    }
  } finally {
    opts.signal?.removeEventListener("abort", abortFromSignal);
    flushCurrentBlock();
  }
}
