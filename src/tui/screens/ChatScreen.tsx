import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { useAgentStream, type ChatBlock } from "../hooks/useAgentStream.js";
import { useBrokerSnapshot } from "../hooks/useBrokerSnapshot.js";
import { Panel } from "../components/Panel.js";
import { ToolChip } from "../components/ToolChip.js";
import { Logo } from "../components/Logo.js";
import { SlashSuggest, matchSlash } from "../components/SlashSuggest.js";
import { formatBigVnd, formatPrice, truncate } from "../lib/format.js";
import { pnlColor } from "../lib/colors.js";
import { getDb } from "../../storage/db.js";

interface DecisionRow { ticker: string; action: string; rationale: string; created_at: number }
interface OrderRow { ticker: string; side: string; status: string; quantity: number; limit_price: number | null; created_at: number }

function renderBlock(b: ChatBlock, toolResults: Map<string, string>): React.ReactNode {
  switch (b.role) {
    case "user":
      return <Text color="cyan" key={b.id}>{"> "}<Text color="white">{b.text}</Text></Text>;
    case "thinking":
      return <Text key={b.id} dimColor italic>{b.text}</Text>;
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
      return <Text key={b.id} color="red">! {b.text}</Text>;
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

  const matches = matchSlash(input);
  const showSuggest = matches.length > 0;

  const onStatsRef = useRef(props.onStats);
  onStatsRef.current = props.onStats;
  useEffect(() => {
    onStatsRef.current(stream.cumulative);
  }, [stream.cumulative]);

  // Poll sidebar tables on a timer instead of querying SQLite on every render
  // (which fired on every stream-delta state update and caused flicker).
  useEffect(() => {
    const refresh = () => {
      try {
        const db = getDb();
        setDecisions(
          db.prepare("SELECT ticker, action, rationale, created_at FROM decisions ORDER BY created_at DESC LIMIT 5").all() as DecisionRow[],
        );
        setOrders(
          db.prepare("SELECT ticker, side, status, quantity, limit_price, created_at FROM broker_orders ORDER BY created_at DESC LIMIT 5").all() as OrderRow[],
        );
      } catch {}
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  const toolResults = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of stream.blocks) {
      if (b.role === "tool_result" && b.toolUseId) m.set(b.toolUseId, b.text);
    }
    return m;
  }, [stream.blocks]);

  // Split blocks into a Static (render-once) prefix and a live tail. While
  // streaming, the last block is being mutated in place by stream deltas, so
  // it must stay outside <Static> to receive updates. Static items render
  // once and are never re-diffed → eliminates flicker on completed blocks.
  const liveId = stream.streaming ? stream.blocks[stream.blocks.length - 1]?.id : undefined;
  const finalized = useMemo(
    () => stream.blocks.filter((b) => b.id !== liveId),
    [stream.blocks, liveId],
  );
  const liveBlock = liveId ? stream.blocks[stream.blocks.length - 1] : undefined;

  useInput((_inp, key) => {
    if (key.ctrl && _inp === "c" && stream.streaming) stream.abort();
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

  const handleSubmit = (raw: string) => {
    const v = raw.trim();
    setInput("");
    setSuggestSel(0);
    if (!v) return;
    if (v.startsWith("/")) {
      const [cmd, ...rest] = v.slice(1).split(/\s+/);
      const arg = rest.join(" ");
      if (cmd === "clear") stream.reset();
      else if (cmd === "persona" && arg) props.setPersona(arg);
      else if (cmd === "dashboard" || cmd === "dash") props.setMode("dashboard");
      else if (cmd === "backtest" || cmd === "bt") props.setMode("backtest");
      else if (cmd === "journal") props.setMode("journal");
      else if (cmd === "chat") props.setMode("chat");
      return;
    }
    void stream.send(v);
  };

  return (
    <Box flexDirection="row" flexGrow={1}>
      <Box flexDirection="column" flexGrow={2} marginRight={1}>
        <Box flexDirection="column" flexGrow={1} borderStyle="round" borderColor="gray" paddingX={1}>
          {stream.blocks.length === 0 ? (
            <Logo tagline={`persona ${props.persona} · autonomy ${props.autonomy} · type / for commands`} />
          ) : (
            <Static items={finalized}>
              {(b) => renderBlock(b, toolResults)}
            </Static>
          )}
          {liveBlock ? renderBlock(liveBlock, toolResults) : null}
          {stream.streaming ? (
            <Box marginTop={1}><Text color="yellow"><Spinner type="dots" /> thinking…</Text></Box>
          ) : null}
        </Box>
        {showSuggest ? <SlashSuggest input={input} selected={suggestSel} /> : null}
        <Box marginTop={0} borderStyle="round" borderColor={stream.streaming ? "yellow" : "cyan"} paddingX={1}>
          <Text color={stream.streaming ? "yellow" : "cyan"} bold>{stream.streaming ? "⠿ " : "› "}</Text>
          <TextInput value={input} onChange={handleChange} onSubmit={handleSubmit} placeholder="Ask the agent — type / for commands" />
        </Box>
      </Box>
      <Box flexDirection="column" width={42}>
        <Panel title="PORTFOLIO" borderColor="green">
          {snapshot ? (
            <>
              <Text>cash <Text color="green">{formatBigVnd(snapshot.cashVnd)} VND</Text></Text>
              <Text dimColor>{snapshot.broker}</Text>
              <Box marginTop={1} flexDirection="column">
                {snapshot.positions.length === 0 ? <Text dimColor>no positions</Text> : null}
                {snapshot.positions.map((p) => (
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
        <Panel title="LATEST ORDERS" borderColor="yellow">
          {orders.length === 0 ? <Text dimColor>none</Text> : null}
          {orders.map((o) => (
            <Text key={`${o.created_at}-${o.ticker}-${o.side}`}>
              <Text color={o.side === "BUY" ? "green" : "red"}>{o.side.padEnd(4)}</Text>
              <Text color="white"> {o.ticker.padEnd(5)}</Text>
              <Text dimColor> {o.quantity}</Text>
              <Text dimColor> {o.status}</Text>
            </Text>
          ))}
        </Panel>
        <Panel title="DECISION JOURNAL" borderColor="magenta">
          {decisions.length === 0 ? <Text dimColor>empty</Text> : null}
          {decisions.map((d) => (
            <Box key={`${d.created_at}-${d.ticker}`} flexDirection="column">
              <Text>
                <Text color={d.action === "BUY" ? "green" : d.action === "SELL" ? "red" : "yellow"}>{d.action.padEnd(5)}</Text>
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
