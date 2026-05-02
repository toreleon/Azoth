import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { useAgentStream, type ChatBlock } from "../hooks/useAgentStream.js";
import { ToolChip } from "../components/ToolChip.js";
import { Logo } from "../components/Logo.js";
import { SlashSuggest, matchSlash } from "../components/SlashSuggest.js";
import { truncate } from "../lib/format.js";
import { theme, glyph } from "../lib/theme.js";

const QUICK_PROMPTS = [
  "What's the VNINDEX doing today and key drivers?",
  "Quote HPG with technicals and recent news.",
  "Foreign flow on VCB, MWG, FPT this week.",
  "Find top momentum gainers in HOSE this week.",
  "Review my positions and suggest any rebalances.",
];

const THINKING_ANIMATION_INTERVAL_MS = 80;

function renderBlock(b: ChatBlock, toolResults: Map<string, string>, columns = 80): React.ReactNode {
  switch (b.role) {
    case "user": {
      const text = `› ${b.text}`;
      const row = text.length < columns ? text.padEnd(columns) : text;
      return (
        <Text key={b.id} color="white" backgroundColor="gray">
          {row}
        </Text>
      );
    }
    case "thinking":
      return <Text key={b.id} dimColor italic>{glyph.thinking} {b.text}</Text>;
    case "text":
      return (
        <Box key={b.id}>
          <Text color="white">{"● "}</Text>
          <Text>{b.text}</Text>
        </Box>
      );
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
      return <Box key={b.id}><Text dimColor>{b.text}</Text></Box>;
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
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  const matches = matchSlash(input);
  const showSuggest = matches.length > 0;

  const onStatsRef = useRef(props.onStats);
  onStatsRef.current = props.onStats;
  useEffect(() => {
    onStatsRef.current(stream.cumulative);
  }, [stream.cumulative]);

  // Tool results map. Only committed blocks contribute (tool_result is always
  // committed straight away — never an active block).
  const toolResults = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of stream.committed) {
      if (b.role === "tool_result" && b.toolUseId) m.set(b.toolUseId, b.text);
    }
    return m;
  }, [stream.committed]);

  // Welcome lives as a Static item so it commits to terminal scrollback once
  // (Claude-Code-style) and scrolls up naturally as the conversation grows,
  // rather than vanishing on first send.
  type StaticItem =
    | { kind: "welcome"; key: string }
    | { kind: "block"; key: string; block: ChatBlock };
  const staticItems = useMemo<StaticItem[]>(() => {
    const items: StaticItem[] = [{ kind: "welcome", key: "welcome" }];
    for (const b of stream.committed) items.push({ kind: "block", key: b.id, block: b });
    return items;
  }, [stream.committed]);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!stream.streaming) return;
    const id = setInterval(() => setTick((t) => t + 1), THINKING_ANIMATION_INTERVAL_MS);
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
    if (stream.committed.length === 0 && stream.active == null && /^[1-9]$/.test(v)) {
      const expanded = expandQuick(v);
      if (expanded) { void stream.send(expanded); return; }
    }

    void stream.send(v);
  };

  const inputBorder = stream.streaming ? theme.thinking : theme.accent;

  // Single-column layout. Welcome + committed blocks render via <Static>,
  // which writes each one to terminal scrollback exactly once — Ink never
  // repaints them, so streaming token deltas only redraw the active block
  // + spinner.
  return (
    <Box flexDirection="column" flexGrow={1}>
      <Static items={staticItems}>
        {(it) => (
          <Box key={it.key} flexDirection="column" marginBottom={it.kind === "block" ? 1 : 0}>
            {it.kind === "welcome" ? (
              <Box flexDirection="column">
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
              renderBlock(it.block, toolResults, columns)
            )}
          </Box>
        )}
      </Static>
      <Box flexDirection="column" marginTop={stream.active || stream.streaming ? 1 : 0}>
        {stream.active ? renderBlock(stream.active, toolResults, columns) : null}
        {stream.streaming ? (
          <Box>
            <Text color={theme.thinking}>{thinkingDots} </Text>
            <Text color={theme.thinking}>thinking…</Text>
            <Text dimColor>  Ctrl+C to abort</Text>
          </Box>
        ) : null}
      </Box>
      {showSuggest ? <SlashSuggest input={input} selected={suggestSel} /> : null}
      <Box borderStyle="round" borderColor={inputBorder} paddingX={1}>
        <Text color={inputBorder} bold>{"› "}</Text>
        <Box flexGrow={1}>
          <TextInput value={input} onChange={handleChange} onSubmit={handleSubmit} placeholder="Ask the agent — type / for commands" />
        </Box>
        <Text dimColor>↵ send · / cmds</Text>
      </Box>
    </Box>
  );
}
