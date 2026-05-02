import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { useAgentStream, type ChatBlock } from "../hooks/useAgentStream.js";
import { useBrokerSnapshot } from "../hooks/useBrokerSnapshot.js";
import { Panel } from "../components/Panel.js";
import { ToolChip } from "../components/ToolChip.js";
import { Logo } from "../components/Logo.js";
import { SlashSuggest, matchSlash } from "../components/SlashSuggest.js";
import { formatBigVnd, formatPct, formatPrice, truncate } from "../lib/format.js";
import { pctColor, vnColor } from "../lib/colors.js";
import { theme, glyph } from "../lib/theme.js";
import { getDb } from "../../storage/db.js";
import { getQuote } from "../../data/sources/ssiIboard.js";
import { getStockOhlcv } from "../../data/sources/dnsePublic.js";
import { sparkline } from "../lib/sparkline.js";
import { loadConfig } from "../../config/loader.js";

interface DecisionRow { ticker: string; action: string; rationale: string; created_at: number }
interface OrderRow { ticker: string; side: string; status: string; quantity: number; limit_price: number | null; created_at: number }
interface WatchRow { ticker: string; last: number | null; ref: number | null; ceiling: number | null; floor: number | null; chgPct: number | null; spark: string }

const QUICK_PROMPTS = [
  "What's the VNINDEX doing today and key drivers?",
  "Quote HPG with technicals and recent news.",
  "Foreign flow on VCB, MWG, FPT this week.",
  "Find top momentum gainers in HOSE this week.",
  "Review my positions and suggest any rebalances.",
];

function rowsEqual<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!eq(a[i]!, b[i]!)) return false;
  return true;
}
const decisionRowEq = (a: DecisionRow, b: DecisionRow) =>
  a.created_at === b.created_at && a.ticker === b.ticker && a.action === b.action && a.rationale === b.rationale;
const orderRowEq = (a: OrderRow, b: OrderRow) =>
  a.created_at === b.created_at && a.ticker === b.ticker && a.side === b.side && a.status === b.status && a.quantity === b.quantity && a.limit_price === b.limit_price;

function renderBlock(b: ChatBlock, toolResults: Map<string, string>): React.ReactNode {
  switch (b.role) {
    case "user":
      return (
        <Box key={b.id}>
          <Text color={theme.brand} bold>{glyph.bar} </Text>
          <Text color="white">{b.text}</Text>
        </Box>
      );
    case "thinking":
      return <Text key={b.id} dimColor italic>{glyph.thinking} {b.text}</Text>;
    case "text":
      return <Text key={b.id}>{b.text}</Text>;
    case "tool_use":
      return (
        <Box key={b.id} marginY={0}>
          <ToolChip name={b.toolName ?? "?"} input={b.toolInput} result={b.toolUseId ? toolResults.get(b.toolUseId) : undefined} />
        </Box>
      );
    case "tool_result":
      return null;
    case "error":
      return (
        <Box key={b.id}>
          <Text color={theme.down} bold>{glyph.fail} </Text>
          <Text color={theme.down}>{b.text}</Text>
        </Box>
      );
    default:
      return <Text key={b.id} dimColor>{b.text}</Text>;
  }
}

export interface ChatScreenProps {
  persona: string;
  setPersona: (p: string) => void;
  autonomy: string;
  setAutonomy: (a: string) => void;
  onStats: (stats: { inTokens: number; outTokens: number; costUsd: number; sessionId?: string }) => void;
  setMode: (m: "chat" | "dashboard" | "backtest" | "journal") => void;
  onQuit: () => void;
}

export function ChatScreen(props: ChatScreenProps) {
  const stream = useAgentStream();
  const [input, setInput] = useState("");
  const [suggestSel, setSuggestSel] = useState(0);
  const { snapshot } = useBrokerSnapshot(8000);
  const [decisions, setDecisions] = useState<DecisionRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [watch, setWatch] = useState<WatchRow[]>([]);
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const cfg = loadConfig();
  // HUD (3) + Tabs (1) + status (3) + input (3) ≈ 10 rows of chrome.
  const perPanelContent = Math.max(2, Math.floor((rows - 12) / 3) - 3);
  const orderLimit = Math.max(2, Math.min(5, perPanelContent));
  const decisionLimit = Math.max(1, Math.min(5, Math.floor(perPanelContent / 2)));
  const positionLimit = Math.max(1, Math.min(5, perPanelContent - 2));
  const watchLimit = Math.max(2, Math.min(5, perPanelContent));

  const matches = matchSlash(input);
  const showSuggest = matches.length > 0;

  const onStatsRef = useRef(props.onStats);
  onStatsRef.current = props.onStats;
  useEffect(() => {
    onStatsRef.current(stream.cumulative);
  }, [stream.cumulative]);

  useEffect(() => {
    const refresh = () => {
      try {
        const db = getDb();
        setDecisions((prev) => {
          const next = db.prepare("SELECT ticker, action, rationale, created_at FROM decisions ORDER BY created_at DESC LIMIT ?").all(decisionLimit) as DecisionRow[];
          return rowsEqual(prev, next, decisionRowEq) ? prev : next;
        });
        setOrders((prev) => {
          const next = db.prepare("SELECT ticker, side, status, quantity, limit_price, created_at FROM broker_orders ORDER BY created_at DESC LIMIT ?").all(orderLimit) as OrderRow[];
          return rowsEqual(prev, next, orderRowEq) ? prev : next;
        });
      } catch {}
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [orderLimit, decisionLimit]);

  // Watchlist mini-quotes for sidebar.
  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const tickers = cfg.watchlist.slice(0, watchLimit);
      try {
        const points = await Promise.all(
          tickers.map(async (sym): Promise<WatchRow> => {
            const q = await getQuote(sym).catch(() => null);
            const to = Math.floor(Date.now() / 1000);
            const bars = await getStockOhlcv(sym, "1D", to - 30 * 86400, to).catch(() => []);
            const closes = bars.slice(-15).map((b) => b.close);
            const last = closes.length ? closes[closes.length - 1]! : null;
            const ref = q?.ref ?? null;
            const chg = last != null && ref ? ((last - ref) / ref) * 100 : null;
            return {
              ticker: sym,
              last,
              ref,
              ceiling: q?.ceiling ?? null,
              floor: q?.floor ?? null,
              chgPct: chg,
              spark: sparkline(closes, 8) || "—",
            };
          }),
        );
        if (!cancelled) setWatch(points);
      } catch {}
    }
    void tick();
    const id = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(id); };
  }, [cfg.watchlist.join(","), watchLimit]);

  const toolResults = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of stream.blocks) {
      if (b.role === "tool_result" && b.toolUseId) m.set(b.toolUseId, b.text);
    }
    return m;
  }, [stream.blocks]);

  const chatRows = Math.max(8, rows - 12);
  const visible = useMemo(
    () => stream.blocks.slice(-chatRows),
    [stream.blocks, chatRows],
  );

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!stream.streaming) return;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [stream.streaming]);
  const thinkingDots = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][tick % 10];

  useInput((inp, key) => {
    if (key.ctrl && inp === "c" && stream.streaming) stream.abort();
    if (showSuggest) {
      if (key.upArrow) setSuggestSel((s) => (s - 1 + matches.length) % matches.length);
      else if (key.downArrow) setSuggestSel((s) => (s + 1) % matches.length);
      else if (key.tab) {
        const m = matches[suggestSel % matches.length]!;
        setInput("/" + m.name + (m.args ? " " : ""));
        setSuggestSel(0);
      }
    }
  });

  const handleChange = (next: string) => {
    setInput(next);
    setSuggestSel(0);
  };

  const expandQuick = (digit: string): string | null => {
    const idx = Number.parseInt(digit, 10) - 1;
    if (Number.isNaN(idx) || idx < 0 || idx >= QUICK_PROMPTS.length) return null;
    return QUICK_PROMPTS[idx]!;
  };

  const handleSubmit = (raw: string) => {
    const v = raw.trim();
    setInput("");
    setSuggestSel(0);
    if (!v) return;

    if (v.startsWith("/")) {
      const [cmd, ...rest] = v.slice(1).split(/\s+/);
      const arg = rest.join(" ").trim();
      if (cmd === "clear" || cmd === "new") stream.newSession();
      else if (cmd === "resume" && arg) stream.resumeById(arg);
      else if (cmd === "resume") stream.resumeLatest();
      else if (cmd === "sessions") {
        const rows = stream.listSessions();
        const text = rows.length === 0
          ? "No saved sessions for this project."
          : rows.map((s) => {
              const date = new Date(s.updatedAt).toISOString().slice(0, 16).replace("T", " ");
              const title = truncate(s.title || "Untitled session", 42);
              return `${s.id.slice(0, 8)}  ${date}  ${title}`;
            }).join("\n");
        stream.systemMessage(text);
      }
      else if (cmd === "persona" && arg) props.setPersona(arg);
      else if (cmd === "dashboard" || cmd === "dash") props.setMode("dashboard");
      else if (cmd === "backtest" || cmd === "bt") props.setMode("backtest");
      else if (cmd === "journal") props.setMode("journal");
      else if (cmd === "chat") props.setMode("chat");
      else if (cmd === "quote" && arg) void stream.send(`Give me a market quote with technicals and recent news for ${arg.toUpperCase()}.`);
      else if (cmd === "chart" && arg) void stream.send(`Show an ASCII chart of ${arg.toUpperCase()} over the last 60 trading days with key levels.`);
      else if (cmd === "positions") void stream.send("Summarize my current portfolio positions, unrealized PnL, and exposures.");
      else if (cmd === "alerts") void stream.send("List my active price alerts and any that fired today.");
      else if (cmd === "help") {
        void stream.send("List the commands and capabilities available in this Azoth session.");
      }
      return;
    }

    // Empty-state quick-prompt shortcut: a bare digit before any conversation
    if (stream.blocks.length === 0 && /^[1-9]$/.test(v)) {
      const expanded = expandQuick(v);
      if (expanded) { void stream.send(expanded); return; }
    }

    void stream.send(v);
  };

  const showOrders = props.autonomy !== "advisory" && orders.length > 0;
  const inputBorder = stream.streaming ? theme.thinking : theme.accent;

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box flexDirection="column" flexGrow={2} marginRight={1}>
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor={theme.muted} paddingX={1}>
          {stream.blocks.length === 0 ? (
            <Box flexDirection="column" flexGrow={1}>
              <Logo tagline={`persona ${props.persona} · autonomy ${props.autonomy}`} />
              <Box flexDirection="column" marginTop={1}>
                <Text color={theme.muted}>Try one — press the number to send:</Text>
                {QUICK_PROMPTS.map((p, i) => (
                  <Box key={i}>
                    <Text color={theme.brand} bold>  {i + 1} </Text>
                    <Text color="white">{p}</Text>
                  </Box>
                ))}
                <Box marginTop={1}><Text dimColor>or type / for commands</Text></Box>
              </Box>
            </Box>
          ) : (
            visible.map((b) => renderBlock(b, toolResults))
          )}
          {stream.streaming ? (
            <Box marginTop={1}>
              <Text color={theme.thinking}>{thinkingDots} </Text>
              <Text color={theme.thinking}>thinking…</Text>
              <Text dimColor>  Ctrl+C to abort</Text>
            </Box>
          ) : null}
        </Box>
        {showSuggest ? <SlashSuggest input={input} selected={suggestSel} /> : null}
        <Box marginTop={0} borderStyle="round" borderColor={inputBorder} paddingX={1}>
          <Text color={theme.brand} bold>{glyph.bar} </Text>
          <Box flexGrow={1}>
            <TextInput value={input} onChange={handleChange} onSubmit={handleSubmit} placeholder="Ask the agent — type / for commands" />
          </Box>
          <Text dimColor>↵ send · / cmds</Text>
        </Box>
      </Box>
      <Box flexDirection="column" width={44}>
        <Panel title="PORTFOLIO" borderColor={theme.up}>
          {snapshot ? (
            <>
              <Text>cash <Text color={theme.up}>{formatBigVnd(snapshot.cashVnd)} VND</Text></Text>
              <Text dimColor>{snapshot.broker}</Text>
              <Box marginTop={1} flexDirection="column">
                {snapshot.positions.length === 0 ? <Text dimColor>no positions</Text> : null}
                {snapshot.positions.slice(0, positionLimit).map((p) => (
                  <Text key={p.ticker}>
                    <Text color="white">{p.ticker.padEnd(5)}</Text>
                    <Text> qty </Text><Text>{p.quantity}</Text>
                    <Text dimColor>  @ {formatPrice(p.avgCost)}k</Text>
                  </Text>
                ))}
              </Box>
            </>
          ) : <Text dimColor>loading…</Text>}
        </Panel>
        {showOrders ? (
          <Panel title="LATEST ORDERS" borderColor={theme.flat}>
            {orders.map((o) => (
              <Text key={`${o.created_at}-${o.ticker}-${o.side}`}>
                <Text color={o.side === "BUY" ? theme.up : theme.down}>{o.side.padEnd(4)}</Text>
                <Text color="white"> {o.ticker.padEnd(5)}</Text>
                <Text dimColor> {o.quantity}</Text>
                <Text dimColor> {o.status}</Text>
              </Text>
            ))}
          </Panel>
        ) : (
          <Panel title="WATCHLIST" borderColor={theme.accent}>
            {watch.length === 0 ? <Text dimColor>loading…</Text> : null}
            {watch.map((w) => (
              <Text key={w.ticker}>
                <Text color="white">{w.ticker.padEnd(5)}</Text>
                <Text color={vnColor(w.last, w.ref, w.ceiling, w.floor)}>{formatPrice(w.last).padStart(7)}</Text>
                <Text color={pctColor(w.chgPct)}>{formatPct(w.chgPct, true).padStart(8)}</Text>
                <Text color={pctColor(w.chgPct)}>  {w.spark}</Text>
              </Text>
            ))}
          </Panel>
        )}
        <Panel title="DECISION JOURNAL" borderColor={theme.persona}>
          {decisions.length === 0 ? <Text dimColor>empty</Text> : null}
          {decisions.map((d) => (
            <Box key={`${d.created_at}-${d.ticker}`} flexDirection="column">
              <Text>
                <Text color={d.action === "BUY" ? theme.up : d.action === "SELL" ? theme.down : theme.flat}>{d.action.padEnd(5)}</Text>
                <Text color="white"> {d.ticker}</Text>
              </Text>
              <Text dimColor>  {truncate(d.rationale ?? "", 36)}</Text>
            </Box>
          ))}
        </Panel>
      </Box>
    </Box>
  );
}
