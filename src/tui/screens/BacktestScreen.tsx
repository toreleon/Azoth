import React, { useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import { Panel } from "../components/Panel.js";
import { Sparkline } from "../components/Sparkline.js";
import { runBacktestSession, type EquityPayload, type SummaryPayload, type TurnResultPayload } from "../../agent/backtestRunner.js";
import { formatBigVnd, formatDate, formatPct, formatPrice, truncate } from "../lib/format.js";
import { pctColor } from "../lib/colors.js";
import { theme } from "../lib/theme.js";

type Phase = "form" | "running" | "done" | "error";

const PERSONAS = ["balanced", "momentum", "value", "bluechip"];

interface Field { key: "persona" | "start" | "end" | "cash"; label: string }
const FIELDS: Field[] = [
  { key: "persona", label: "persona" },
  { key: "start", label: "start (YYYY-MM-DD)" },
  { key: "end", label: "end (YYYY-MM-DD)" },
  { key: "cash", label: "initial cash (VND)" },
];

export function BacktestScreen() {
  const [phase, setPhase] = useState<Phase>("form");
  const [active, setActive] = useState(0);
  const [persona, setPersona] = useState(PERSONAS[0]!);
  const [start, setStart] = useState("2025-01-03");
  const [end, setEnd] = useState("2025-04-30");
  const [cash, setCash] = useState("1000000000");

  const [equity, setEquity] = useState<EquityPayload[]>([]);
  const [turns, setTurns] = useState<TurnResultPayload[]>([]);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string>("");
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const abortRef = useRef(new AbortController());

  useInput((inp, key) => {
    if (phase === "form") {
      if (key.upArrow) setActive((a) => Math.max(0, a - 1));
      else if (key.downArrow) setActive((a) => Math.min(FIELDS.length - 1, a + 1));
      else if (FIELDS[active]!.key === "persona") {
        if (key.leftArrow) setPersona((p) => PERSONAS[(PERSONAS.indexOf(p) - 1 + PERSONAS.length) % PERSONAS.length]!);
        else if (key.rightArrow) setPersona((p) => PERSONAS[(PERSONAS.indexOf(p) + 1) % PERSONAS.length]!);
      }
      if (key.return) launch();
    } else if (phase === "running" && key.escape) {
      abortRef.current.abort();
    } else if (phase === "done" || phase === "error") {
      if (inp === "r") {
        setPhase("form");
        setEquity([]); setTurns([]); setSummary(null); setError(null); setStreamLog([]);
      }
    }
  });

  const launch = async () => {
    setPhase("running");
    setEquity([]); setTurns([]); setSummary(null); setError(null); setStreamLog([]);
    abortRef.current = new AbortController();
    try {
      const result = await runBacktestSession(
        { persona, start, end, initialCash: Number(cash) || 1_000_000_000 },
        {
          signal: abortRef.current.signal,
          onTurnStart: ({ dateIso }) => setCurrentDate(dateIso),
          onStreamEvent: (m: any) => {
            if (m?.type === "stream_event") {
              const ev = m.event;
              if (ev?.type === "content_block_start" && ev.content_block?.type === "tool_use") {
                setStreamLog((s) => [...s.slice(-12), `tool: ${ev.content_block.name}`]);
              }
            }
          },
          onTurnEnd: (t) => setTurns((arr) => [...arr, t]),
          onEquity: (e) => setEquity((arr) => [...arr, e]),
        },
      );
      setSummary(result);
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  };

  if (phase === "form") {
    return (
      <Box flexDirection="column" flexGrow={1} padding={1}>
        <Text bold color={theme.accent}>CONFIGURE BACKTEST</Text>
        <Text dimColor>↑↓ to move · ←→ on persona · Enter to launch · Tab to switch screens</Text>
        <Box marginTop={1} flexDirection="column">
          {FIELDS.map((f, i) => (
            <Box key={f.key} marginY={0}>
              <Text color={i === active ? theme.accent : theme.muted}>{i === active ? "▌ " : "  "}{f.label.padEnd(22)}</Text>
              {f.key === "persona" ? (
                <Text color={theme.persona}>{persona}</Text>
              ) : f.key === "start" ? (
                i === active ? <TextInput value={start} onChange={setStart} onSubmit={launch} /> : <Text>{start}</Text>
              ) : f.key === "end" ? (
                i === active ? <TextInput value={end} onChange={setEnd} onSubmit={launch} /> : <Text>{end}</Text>
              ) : (
                i === active ? <TextInput value={cash} onChange={setCash} onSubmit={launch} /> : <Text>{cash}</Text>
              )}
            </Box>
          ))}
        </Box>
      </Box>
    );
  }

  const mtmSeries = equity.map((e) => e.mtmVnd);
  const benchSeries = equity.map((e) => e.benchmarkMtmVnd);
  const last = equity[equity.length - 1];

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box flexDirection="row">
        <Panel title="EQUITY" flex={2} borderColor={theme.up}>
          <Sparkline values={mtmSeries} color={theme.up} label="strat" />
          <Sparkline values={benchSeries} color={theme.accent} label="VNINDEX" />
          {last ? (
            <Text>
              <Text dimColor>last </Text><Text>{formatDate(last.asOf)}</Text>
              <Text dimColor>  mtm </Text><Text color={theme.up}>{formatBigVnd(last.mtmVnd)}</Text>
              <Text dimColor>  cash </Text><Text>{formatBigVnd(last.cashVnd)}</Text>
              <Text dimColor>  bench </Text><Text color={theme.accent}>{formatBigVnd(last.benchmarkMtmVnd)}</Text>
            </Text>
          ) : null}
        </Panel>
        <Panel title="STREAM" flex={1} borderColor={theme.flat} badge={phase === "running" ? "live" : phase}>
          {phase === "running" ? <Text color={theme.flat}><Spinner type="dots" /> {currentDate}</Text> : null}
          {streamLog.slice(-10).map((l, i) => <Text key={i} dimColor>{l}</Text>)}
        </Panel>
      </Box>
      <Box flexDirection="row" flexGrow={1}>
        <Panel title="WEEKLY TURNS" flex={1} borderColor={theme.accent}>
          {turns.slice(-15).map((t) => (
            <Text key={t.asOf}>
              <Text>{t.dateIso}</Text>
              <Text dimColor>  tools {t.toolCalls}</Text>
              <Text dimColor>  ${t.costUsd.toFixed(4)}</Text>
              <Text dimColor>  {truncate(t.response.replace(/\s+/g, " "), 40)}</Text>
            </Text>
          ))}
        </Panel>
        <Panel title="SUMMARY" flex={1} borderColor={theme.persona}>
          {summary ? (
            <>
              <Text>weeks <Text color="white">{summary.weeks}</Text>  trades <Text color="white">{summary.trades}</Text></Text>
              <Text>final mtm <Text color={theme.up}>{formatBigVnd(summary.finalMtm)}</Text></Text>
              <Text>vnindex <Text color={theme.accent}>{formatBigVnd(summary.finalBench)}</Text></Text>
              <Text>return <Text color={pctColor(summary.totalReturn)}>{formatPct(summary.totalReturn)}</Text></Text>
              <Text>bench <Text color={pctColor(summary.benchReturn)}>{formatPct(summary.benchReturn)}</Text></Text>
              <Text>alpha <Text color={pctColor(summary.totalReturn - summary.benchReturn)}>{formatPct(summary.totalReturn - summary.benchReturn)}</Text></Text>
              <Text>maxDD <Text color={theme.down}>{formatPct(summary.maxDD * 100)}</Text></Text>
              <Text>cost <Text>${summary.totalCost.toFixed(4)}</Text></Text>
              <Text dimColor>r: re-run</Text>
            </>
          ) : error ? (
            <><Text color={theme.down}>{error}</Text><Text dimColor>r: retry</Text></>
          ) : (
            <Text dimColor>running… ESC to abort</Text>
          )}
        </Panel>
      </Box>
    </Box>
  );
}
