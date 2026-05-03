import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { StatusBar } from "./components/StatusBar.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ToolChip } from "./components/ToolChip.js";
import { Welcome } from "./components/Welcome.js";
import { SlashSuggest, matchSlash } from "./components/SlashSuggest.js";
import { AgentStreamProvider, useAgentStreamCtx } from "./hooks/useAgentStreamContext.js";
import { type ChatBlock } from "./hooks/useAgentStream.js";
import { useNow } from "./hooks/useNow.js";
import { loadConfig } from "../config/loader.js";
import { classifySession } from "./lib/marketSession.js";
import { formatBigVnd, truncate } from "./lib/format.js";
import { theme, glyph } from "./lib/theme.js";
import { runBacktestSession, type EquityPayload } from "../agent/backtestRunner.js";
import { runTeamAnalysis } from "../agent/team/index.js";
import type { TeamEvent } from "../agent/team/state.js";
import { loadJournal, type JournalTab } from "./lib/journal.js";
import { JournalCard, BacktestCard, TeamDecisionCard } from "./lib/cards.js";

type Autonomy = "advisory" | "confirm" | "auto";

const THINKING_ANIMATION_INTERVAL_MS = 80;
const BT_DEFAULTS = { start: "2025-01-03", end: "2025-04-30", cash: 1_000_000_000 };

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
    case "system":
      return (
        <Box key={b.id} flexDirection="column">
          {b.text.split("\n").map((line, i) => (
            <Text key={i} color={theme.muted}>{line}</Text>
          ))}
        </Box>
      );
    case "card":
      return <Box key={b.id}>{b.node}</Box>;
    default:
      return <Box key={b.id}><Text dimColor>{b.text}</Text></Box>;
  }
}

export function App() {
  return (
    <AgentStreamProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </AgentStreamProvider>
  );
}

function AppInner() {
  const cfg = loadConfig();
  useApp();
  const stream = useAgentStreamCtx();
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  const [profileRef, setProfileRef] = useState("vn-equity@v0");
  const [autonomy, setAutonomy] = useState<Autonomy>(cfg.autonomy);
  const [stats, setStats] = useState<{ inTokens: number; outTokens: number; costUsd: number; sessionId?: string }>({ inTokens: 0, outTokens: 0, costUsd: 0 });
  const [input, setInput] = useState("");
  const [suggestSel, setSuggestSel] = useState(0);
  const [tick, setTick] = useState(0);

  const now = useNow(30_000);
  const session = classifySession(now);

  const matches = matchSlash(input);
  const showSuggest = matches.length > 0;

  const backtestRef = useRef<{ ctrl: AbortController; running: boolean } | null>(null);

  useEffect(() => {
    setStats(stream.cumulative);
  }, [stream.cumulative]);

  useEffect(() => {
    if (!stream.streaming) return;
    const id = setInterval(() => setTick((t) => t + 1), THINKING_ANIMATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [stream.streaming]);

  const thinkingDots = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][tick % 10];

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
  // and scrolls up naturally as the conversation grows.
  type StaticItem =
    | { kind: "welcome"; key: string }
    | { kind: "block"; key: string; block: ChatBlock };
  const staticItems = useMemo<StaticItem[]>(() => {
    const items: StaticItem[] = [{ kind: "welcome", key: "welcome" }];
    for (const b of stream.committed) items.push({ kind: "block", key: b.id, block: b });
    return items;
  }, [stream.committed]);

  const runAnalyze = async (args: string[]) => {
    if (!args.length || args[0] === "help") {
      stream.systemMessage("/analyze <ticker> [--rounds N] [--as-of YYYY-MM-DD]");
      return;
    }
    let ticker: string | undefined;
    let rounds: number | undefined;
    let asOf: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const a = args[i]!;
      if (a === "--rounds") rounds = Number(args[++i]);
      else if (a === "--as-of") asOf = args[++i];
      else if (!a.startsWith("-")) ticker = a.toUpperCase();
    }
    if (!ticker) {
      stream.systemMessage("✗ /analyze requires a ticker");
      return;
    }
    stream.systemMessage(`─ /analyze ${ticker} (rounds=${rounds ?? 2})`);
    try {
      const result = await runTeamAnalysis(
        { ticker, debateRounds: rounds, asOfDateIso: asOf },
        {
          emit: (ev: TeamEvent) => {
            if (ev.type === "role_start") {
              const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
              stream.systemMessage(`  ▸ ${tag} thinking…`);
            } else if (ev.type === "role_tool") {
              stream.systemMessage(`     [${ev.role}] tool: ${ev.tool}`);
            } else if (ev.type === "role_end") {
              const o = ev.output as Record<string, unknown>;
              const desc =
                "score" in o
                  ? `score=${Number(o.score).toFixed(2)} ${truncate(String(o.summary ?? ""), 60)}`
                  : "action" in o
                  ? `${o.action} size=${(Number(o.sizingPct) * 100).toFixed(1)}%`
                  : "approved" in o
                  ? `approved=${o.approved}`
                  : "thesis" in o
                  ? truncate(String(o.thesis), 80)
                  : "ok";
              const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
              stream.systemMessage(`  ✓ ${tag} → ${desc}`);
            }
          },
        },
      );
      stream.appendCard(<TeamDecisionCard data={{ state: result.state, decision: result.decision }} />);
    } catch (e) {
      stream.systemMessage(`✗ analyze error: ${(e as Error).message}`);
    }
  };

  const runJournal = (args: string[]) => {
    const validTabs: JournalTab[] = ["decisions", "orders", "fills", "alerts"];
    let tab: JournalTab = "decisions";
    let limit = 10;
    for (const a of args) {
      if ((validTabs as string[]).includes(a)) tab = a as JournalTab;
      else if (/^\d+$/.test(a)) limit = Number.parseInt(a, 10);
    }
    try {
      const rows = loadJournal(tab, limit);
      stream.appendCard(<JournalCard tab={tab} rows={rows} />);
    } catch (e) {
      stream.systemMessage(`✗ journal error: ${(e as Error).message}`);
    }
  };

  const runBacktest = async (args: string[]) => {
    if (args[0] === "help") {
      stream.systemMessage("/backtest [profile@vN] [YYYY-MM-DD start] [YYYY-MM-DD end] [cash VND]");
      return;
    }
    if (backtestRef.current?.running) {
      stream.systemMessage("a backtest is already running — Ctrl+B to abort");
      return;
    }
    const profileArg = args.find((a) => /^[a-z][a-z0-9_-]*@v\d+$/i.test(a));
    const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
    const cashArg = args.find((a) => /^\d{4,}$/.test(a));
    const btProfileRef = profileArg ?? profileRef;
    const start = dates[0] ?? BT_DEFAULTS.start;
    const end = dates[1] ?? BT_DEFAULTS.end;
    const initialCash = cashArg ? Number.parseInt(cashArg, 10) : BT_DEFAULTS.cash;

    stream.systemMessage(`─ /backtest ${btProfileRef} ${start} → ${end} cash ${formatBigVnd(initialCash)}`);
    stream.systemMessage(`  fetching market data… (Ctrl+B to abort)`);

    const ctrl = new AbortController();
    backtestRef.current = { ctrl, running: true };
    let turnIdx = 0;
    let totalFridays = 0;

    try {
      const summary = await runBacktestSession(
        { profileRef: btProfileRef, start, end, initialCash },
        {
          signal: ctrl.signal,
          onStart: ({ fridays, universe }) => {
            totalFridays = fridays.length;
            stream.systemMessage(`  ready · ${universe.length} tickers · ${totalFridays} weeks`);
          },
          onTurnStart: ({ dateIso }) => {
            turnIdx += 1;
            stream.systemMessage(`  ▸ ${turnIdx}/${totalFridays}  ${dateIso}  thinking…`);
          },
          onEquity: (e: EquityPayload) => {
            stream.systemMessage(
              `    ${e.dateIso}  mtm ${formatBigVnd(e.mtmVnd)}  bench ${formatBigVnd(e.benchmarkMtmVnd)}`,
            );
          },
        },
      );
      stream.appendCard(
        <BacktestCard data={{ profileRef: btProfileRef, start, end, initialCash, summary }} />,
      );
    } catch (e) {
      const msg = (e as Error).message;
      stream.systemMessage(msg === "aborted" ? "✗ backtest aborted" : `✗ backtest error: ${msg}`);
    } finally {
      backtestRef.current = null;
    }
  };

  useInput((inp, key) => {
    if (key.ctrl && inp === "a") {
      setAutonomy((a) => (a === "advisory" ? "confirm" : a === "confirm" ? "auto" : "advisory"));
    }
    if (key.ctrl && inp === "c" && stream.streaming) stream.abort();
    if (key.ctrl && inp === "b" && backtestRef.current?.running) {
      backtestRef.current.ctrl.abort();
    }
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
      else if (cmd === "profile" && arg) setProfileRef(arg);
      else if (cmd === "analyze") void runAnalyze(rest);
      else if (cmd === "backtest" || cmd === "bt") void runBacktest(rest);
      else if (cmd === "journal") runJournal(rest);
      else if (cmd === "decisions") runJournal(["decisions", ...rest]);
      else if (cmd === "orders") runJournal(["orders", ...rest]);
      else if (cmd === "fills") runJournal(["fills", ...rest]);
      else if (cmd === "quote" && arg) void stream.send(`Give me a market quote with technicals and recent news for ${arg.toUpperCase()}.`);
      else if (cmd === "chart" && arg) void stream.send(`Show an ASCII chart of ${arg.toUpperCase()} over the last 60 trading days with key levels.`);
      else if (cmd === "positions") void stream.send("Summarize my current portfolio positions, unrealized PnL, and exposures.");
      else if (cmd === "alerts") void stream.send("List my active price alerts and any that fired today.");
      else if (cmd === "help") {
        void stream.send("List the commands and capabilities available in this Azoth session.");
      }
      return;
    }

    void stream.send(v);
  };

  const inputBorder = stream.streaming ? theme.thinking : theme.accent;

  return (
    <Box flexDirection="column">
      <Static items={staticItems}>
        {(it) => (
          <Box key={it.key} flexDirection="column" marginBottom={it.kind === "block" ? 1 : 0}>
            {it.kind === "welcome" ? (
              <Welcome
                version="0.1.0"
                profileRef={profileRef}
                autonomy={autonomy}
                broker={cfg.broker}
                watchlist={cfg.watchlist}
                cwd={process.cwd()}
              />
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
      <StatusBar
        broker={cfg.broker}
        autonomy={autonomy}
        profileRef={profileRef}
        sessionId={stats.sessionId}
        inTokens={stats.inTokens}
        outTokens={stats.outTokens}
        costUsd={stats.costUsd}
        sessionLabel={session.label}
        streaming={stream.streaming}
      />
    </Box>
  );
}
