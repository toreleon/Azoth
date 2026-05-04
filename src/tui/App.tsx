import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text, useApp, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { StatusBar } from "./components/StatusBar.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ToolChip } from "./components/ToolChip.js";
import { Welcome } from "./components/Welcome.js";
import { LlmSetup } from "./components/LlmSetup.js";
import { SLASH_COMMANDS, SlashSuggest, matchSlash } from "./components/SlashSuggest.js";
import { AgentStreamProvider, useAgentStreamCtx } from "./hooks/useAgentStreamContext.js";
import { type ChatBlock } from "./hooks/useAgentStream.js";
import { useNow } from "./hooks/useNow.js";
import { loadConfig, updateConfig } from "../config/loader.js";
import { resetBrokerCache } from "../broker/index.js";
import { collectHealth, renderHealth } from "../runtime/health.js";
import { hasLlmEnvironment } from "../runtime/llmSetup.js";
import { packageVersion } from "../runtime/version.js";
import { classifySession } from "./lib/marketSession.js";
import { formatBigVnd, formatPct, truncate } from "./lib/format.js";
import { theme, glyph } from "./lib/theme.js";
import { BACKTEST_DEFAULT_INTERVAL, runBacktestSession, type EquityPayload, type SummaryPayload } from "../agent/backtestRunner.js";
import { runTeamAnalysis, runTeamQuestion } from "../agent/team/index.js";
import type { FinalDecision, TeamEvent, TeamState } from "../agent/team/state.js";
import { loadJournal, type JournalTab } from "./lib/journal.js";
import { JournalCard } from "./lib/cards.js";

type Autonomy = "advisory" | "confirm" | "auto";

const THINKING_ANIMATION_INTERVAL_MS = 80;
const BT_DEFAULTS = { cash: 1_000_000_000 };
const PACKAGE_VERSION = packageVersion();

function isoLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function previousWeekRange(now = new Date()): { start: string; end: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = end.getDay();
  const daysSincePreviousSunday = day === 0 ? 7 : day;
  end.setDate(end.getDate() - daysSincePreviousSunday);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  return { start: isoLocalDate(start), end: isoLocalDate(end) };
}

function teamRoleDesc(output: Record<string, unknown>, mode: "analyze" | "question" | "backtest") {
  if ("score" in output) {
    const suffix = mode === "backtest" ? "" : ` ${truncate(String(output.summary ?? ""), 60)}`;
    return `score=${Number(output.score).toFixed(2)}${suffix}`;
  }
  if ("rating" in output) return `${output.rating} size=${(Number(output.sizingPct ?? 0) * 100).toFixed(1)}%`;
  if ("recommendation" in output) return truncate(String(output.recommendation), 80);
  if ("answer" in output) return truncate(String(output.answer), 80);
  if ("action" in output) return `${output.action} size=${(Number(output.sizingPct ?? 0) * 100).toFixed(1)}%`;
  if ("approved" in output) return `approved=${output.approved}`;
  if ("thesis" in output) return truncate(String(output.thesis), mode === "backtest" ? 72 : 80);
  return "ok";
}

function compactToolInput(input?: string) {
  if (!input) return "";
  try {
    const parsed = JSON.parse(input) as Record<string, unknown>;
    const query = parsed.query ?? parsed.q ?? parsed.search_query ?? parsed.url;
    if (query != null) return String(query);
  } catch {
    // Fall back to the raw streamed JSON below.
  }
  return input.replace(/\s+/g, " ").trim();
}

function compactToolResult(content: string) {
  const trimmed = content.replace(/\s+/g, " ").trim();
  if (!trimmed) return "done";
  return truncate(trimmed, 160);
}

function renderTeamToolCall(ev: Extract<TeamEvent, { type: "role_tool" }>, prefix = "") {
  const input = compactToolInput(ev.input);
  return `${prefix}[${ev.role}] ${ev.tool}${input ? `: ${input}` : ""}\n`;
}

function renderTeamToolResult(ev: Extract<TeamEvent, { type: "role_tool_result" }>, prefix = "") {
  return `${prefix}[${ev.role}] ${ev.tool ?? "tool"} result received: ${compactToolResult(ev.content)}\n`;
}

function renderAnalyzeResult(state: TeamState, decision: FinalDecision) {
  const lines = [
    "",
    `Final: ${decision.rating} ${(decision.sizingPct * 100).toFixed(1)}% ${decision.ticker}`,
    `Run: ${decision.teamRunId.slice(0, 8)}${decision.journalId ? `  journal #${decision.journalId}` : ""}`,
  ];
  if (state.analysts.length) {
    lines.push("", "Analysts:");
    for (const a of state.analysts) {
      const score = `${a.score >= 0 ? "+" : ""}${a.score.toFixed(2)}`;
      lines.push(`- ${a.role}: ${score} ${truncate(a.summary, 90)}`);
    }
  }
  if (state.risk) {
    const concerns = state.risk.concerns.length ? `; ${truncate(state.risk.concerns.join("; "), 90)}` : "";
    lines.push("", `Risk: ${state.risk.approved ? "approved" : "rejected"}${concerns}`);
  }
  lines.push("", decision.rationale);
  if (decision.exitPlan) lines.push("", `Exit: ${decision.exitPlan}`);
  return lines.join("\n");
}

function renderTeamQuestionResult(data: {
  question: string;
  asOfDateIso: string;
  teamRunId: string;
  answer: string;
  recommendation: string;
  keyReasons: string[];
  risks: string[];
  nextActions: string[];
}) {
  const lines = [
    "",
    `Recommendation: ${data.recommendation}`,
    `Run: ${data.teamRunId.slice(0, 8)}  as of ${data.asOfDateIso}`,
    "",
    data.answer,
  ];
  if (data.keyReasons.length) {
    lines.push("", "Reasons:");
    for (const r of data.keyReasons.slice(0, 4)) lines.push(`- ${r}`);
  }
  if (data.risks.length) {
    lines.push("", "Risks:");
    for (const r of data.risks.slice(0, 3)) lines.push(`- ${r}`);
  }
  if (data.nextActions.length) {
    lines.push("", "Next:");
    for (const a of data.nextActions.slice(0, 3)) lines.push(`- ${a}`);
  }
  return lines.join("\n");
}

function renderBacktestResult(start: string, end: string, initialCash: number, summary: SummaryPayload) {
  const alpha = summary.totalReturn - summary.benchReturn;
  return [
    "",
    `Backtest ${start} -> ${end}`,
    `Cash: ${formatBigVnd(initialCash)}  interval: ${summary.interval ?? BACKTEST_DEFAULT_INTERVAL}  turns: ${summary.intervals ?? summary.sessions ?? summary.weeks}  trades: ${summary.trades}${summary.rejectedTrades ? `  rejected: ${summary.rejectedTrades}` : ""}`,
    `Final: ${formatBigVnd(summary.finalMtm)}  bench: ${formatBigVnd(summary.finalBench)}`,
    `Return: ${formatPct(summary.totalReturn)}  bench: ${formatPct(summary.benchReturn)}  alpha: ${formatPct(alpha)}  maxDD: ${formatPct(summary.maxDD * 100)}`,
    `Cost: $${summary.totalCost.toFixed(4)}`,
  ].join("\n");
}

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
      return <Text key={b.id} dimColor>{glyph.thinking} Thinking</Text>;
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
  const [llmReady, setLlmReady] = useState(hasLlmEnvironment());
  if (!llmReady) {
    return (
      <ErrorBoundary>
        <LlmSetup onComplete={() => setLlmReady(true)} />
      </ErrorBoundary>
    );
  }

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
    stream.beginLocalResponse(`/analyze ${ticker} (rounds=${rounds ?? 2})`);
    stream.appendLocalResponse(`Running team analysis for ${ticker}...\n`);
    try {
      const result = await runTeamAnalysis(
        { ticker, debateRounds: rounds, asOfDateIso: asOf },
        {
          emit: (ev: TeamEvent) => {
            if (ev.type === "role_start") {
              const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
              stream.appendLocalResponse(`${glyph.toolRunning} ${tag}\n`);
            } else if (ev.type === "role_tool") {
              stream.appendLocalResponse(renderTeamToolCall(ev, "  "));
            } else if (ev.type === "role_tool_result") {
              stream.appendLocalResponse(renderTeamToolResult(ev, "  "));
            } else if (ev.type === "role_end") {
              const desc = teamRoleDesc(ev.output as Record<string, unknown>, "analyze");
              const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
              stream.appendLocalResponse(`  ${glyph.toolDone} ${tag}: ${desc}\n`);
            }
          },
        },
      );
      stream.appendLocalResponse(renderAnalyzeResult(result.state, result.decision));
    } catch (e) {
      stream.appendLocalResponse(`Analyze error: ${(e as Error).message}`);
    } finally {
      stream.finishLocalResponse();
    }
  };

  const runTeamChat = async (message: string) => {
    if (!message) {
      stream.systemMessage("/team <message>");
      return;
    }
    stream.beginLocalResponse(`/team ${message}`);
    stream.appendLocalResponse("Running team debate...\n");
    try {
      const result = await runTeamQuestion(message, {
        emit: (ev: TeamEvent) => {
          if (ev.type === "role_start") {
            const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
            stream.appendLocalResponse(`${glyph.toolRunning} ${tag}\n`);
          } else if (ev.type === "role_tool") {
            stream.appendLocalResponse(renderTeamToolCall(ev, "  "));
          } else if (ev.type === "role_tool_result") {
            stream.appendLocalResponse(renderTeamToolResult(ev, "  "));
          } else if (ev.type === "role_end") {
            const desc = teamRoleDesc(ev.output as Record<string, unknown>, "question");
            const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
            stream.appendLocalResponse(`  ${glyph.toolDone} ${tag}: ${desc}\n`);
          }
        },
      });
      stream.appendLocalResponse(renderTeamQuestionResult(result.decision));
    } catch (e) {
      stream.appendLocalResponse(`Team error: ${(e as Error).message}`);
    } finally {
      stream.finishLocalResponse();
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

  const runAutonomy = (args: string[]) => {
    const next = args[0] as Autonomy | undefined;
    if (!next || !["advisory", "confirm", "auto"].includes(next)) {
      stream.systemMessage(`Current autonomy: ${loadConfig().autonomy}\n/autonomy <advisory|confirm|auto>`);
      return;
    }
    const updated = updateConfig({ autonomy: next });
    setAutonomy(updated.autonomy);
    resetBrokerCache();
    stream.systemMessage(`Autonomy set to ${updated.autonomy}. New turns will rebuild tool access from config.`);
  };

  const runHealth = async (args: string[]) => {
    stream.beginLocalResponse(`/health${args.includes("--probe") ? " --probe" : ""}`);
    try {
      const report = await collectHealth({ probeProviders: args.includes("--probe") });
      stream.appendLocalResponse(renderHealth(report));
    } catch (e) {
      stream.appendLocalResponse(`Health error: ${(e as Error).message}`);
    } finally {
      stream.finishLocalResponse();
    }
  };

  const runBacktest = async (args: string[]) => {
    if (args[0] === "help") {
      stream.systemMessage("/backtest [YYYY-MM-DD start] [YYYY-MM-DD end] [cash VND] [--interval 30m|1h|2h] [--max-candidates N]\nNo dates = previous calendar week. Default interval = 30m.");
      return;
    }
    if (backtestRef.current?.running) {
      stream.systemMessage("a backtest is already running — Ctrl+B to abort");
      return;
    }
    const dates = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
    const cashArg = args.find((a) => /^\d{4,}$/.test(a));
    const maxCandidatesArg = args.findIndex((a) => a === "--max-candidates");
    const maxCandidatesEq = args.find((a) => a.startsWith("--max-candidates="));
    const intervalArg = args.findIndex((a) => a === "--interval");
    const intervalEq = args.find((a) => a.startsWith("--interval="));
    const interval =
      intervalArg >= 0 && args[intervalArg + 1]
        ? args[intervalArg + 1]
        : intervalEq
          ? intervalEq.slice("--interval=".length)
          : BACKTEST_DEFAULT_INTERVAL;
    const maxCandidates =
      maxCandidatesArg >= 0 && args[maxCandidatesArg + 1]
        ? Number.parseInt(args[maxCandidatesArg + 1]!, 10)
        : maxCandidatesEq
          ? Number.parseInt(maxCandidatesEq.slice("--max-candidates=".length), 10)
          : undefined;
    const defaultRange = previousWeekRange();
    const start = dates[0] ?? defaultRange.start;
    const end = dates[1] ?? defaultRange.end;
    const initialCash = cashArg ? Number.parseInt(cashArg, 10) : BT_DEFAULTS.cash;

    stream.beginLocalResponse(`/backtest ${start} ${end} ${initialCash} --interval ${interval}`);
    stream.appendLocalResponse(`Team-driven replay from ${start} to ${end}, interval ${interval}, cash ${formatBigVnd(initialCash)}.\n`);
    stream.appendLocalResponse("Fetching market data... Ctrl+B to abort.\n");

    const ctrl = new AbortController();
    backtestRef.current = { ctrl, running: true };
    let turnIdx = 0;
    let totalTurns = 0;

    try {
      const summary = await runBacktestSession(
        { start, end, initialCash, interval, maxCandidates },
        {
          signal: ctrl.signal,
          onStart: ({ interval: startedInterval, turns, fridays, universe }) => {
            totalTurns = (turns ?? fridays).length;
            stream.appendLocalResponse(
              `Ready: ${universe.length} tickers, ${totalTurns} ${startedInterval} intervals, team analyzes ${maxCandidates ?? 3}/interval.\n`,
            );
          },
          onTurnStart: ({ dateIso }) => {
            turnIdx += 1;
            stream.appendLocalResponse(`\n${turnIdx}/${totalTurns} ${dateIso} interval analysis...\n`);
          },
          onTeamEvent: (ev, { ticker }) => {
            if (ev.type === "role_start") {
              const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
              stream.appendLocalResponse(`${glyph.toolRunning} [${ticker}] ${tag}\n`);
            } else if (ev.type === "role_tool") {
              const input = compactToolInput(ev.input);
              stream.appendLocalResponse(`  [${ticker}] ${ev.role} ${ev.tool}${input ? `: ${input}` : ""}\n`);
            } else if (ev.type === "role_tool_result") {
              stream.appendLocalResponse(`  [${ticker}] ${ev.role} ${ev.tool ?? "tool"} result received: ${compactToolResult(ev.content)}\n`);
            } else if (ev.type === "role_end") {
              const desc = teamRoleDesc(ev.output as Record<string, unknown>, "backtest");
              const tag = ev.round != null ? `${ev.role}#${ev.round}` : ev.role;
              stream.appendLocalResponse(`  ${glyph.toolDone} [${ticker}] ${tag}: ${desc}\n`);
            }
          },
          onOrder: (order) => {
            const px = order.filledPrice != null ? ` @ ${order.filledPrice.toFixed(2)}` : "";
            const reason = order.rejectReason ? ` · ${truncate(order.rejectReason, 80)}` : "";
            stream.appendLocalResponse(`  order ${order.status}: ${order.side} ${order.quantity} ${order.ticker}${px}${reason}\n`);
          },
          onEquity: (e: EquityPayload) => {
            stream.appendLocalResponse(
              `  ${e.dateIso} mtm ${formatBigVnd(e.mtmVnd)} bench ${formatBigVnd(e.benchmarkMtmVnd)}\n`,
            );
          },
        },
      );
      stream.appendLocalResponse(renderBacktestResult(start, end, initialCash, summary));
    } catch (e) {
      const msg = (e as Error).message;
      stream.appendLocalResponse(msg === "aborted" ? "Backtest aborted." : `Backtest error: ${msg}`);
    } finally {
      backtestRef.current = null;
      stream.finishLocalResponse();
    }
  };

  useInput((inp, key) => {
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
      if (cmd === "new") stream.newSession();
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
      else if (cmd === "team") void runTeamChat(arg);
      else if (cmd === "analyze") void runAnalyze(rest);
      else if (cmd === "backtest") void runBacktest(rest);
      else if (cmd === "journal") runJournal(rest);
      else if (cmd === "autonomy") runAutonomy(rest);
      else if (cmd === "health") void runHealth(rest);
      else if (cmd === "quote" && arg) void stream.send(`Give me a market quote with technicals and recent news for ${arg.toUpperCase()}.`);
      else if (cmd === "positions") void stream.send("Summarize my current portfolio positions, unrealized PnL, and exposures.");
      else if (cmd === "help") {
        stream.systemMessage(SLASH_COMMANDS.map((c) => `/${c.name}${c.args ? ` ${c.args}` : ""} — ${c.description}`).join("\n"));
      }
      else stream.systemMessage(`Unknown command: /${cmd}. Type /help for available commands.`);
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
                version={PACKAGE_VERSION}
                autonomy={autonomy}
                broker={cfg.broker}
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
        {stream.teamDebateRows.length ? (
          <Box flexDirection="column">
            {stream.teamDebateRows.map((line, i) => (
              <Text key={i} color={theme.muted}>{line}</Text>
            ))}
          </Box>
        ) : null}
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
