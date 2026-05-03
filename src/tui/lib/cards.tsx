import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/Panel.js";
import { theme, glyph } from "./theme.js";
import { vnColor, pctColor, pnlColor } from "./colors.js";
import { formatBigVnd, formatPct, formatPrice, truncate } from "./format.js";
import type { JournalTab, JournalRow } from "./journal.js";
import type { SummaryPayload } from "../../agent/backtestRunner.js";
import type { FinalDecision, TeamState } from "../../agent/team/state.js";

export interface QuoteCardData {
  ticker: string;
  last: number | null;
  ref?: number | null;
  ceiling?: number | null;
  floor?: number | null;
  chgPct?: number | null;
  rsi14?: number | null;
  macdSig?: string | null;
  headline?: string | null;
}

export function QuoteCard({ data }: { data: QuoteCardData }) {
  const arrow = data.chgPct == null ? glyph.flat : data.chgPct > 0 ? glyph.up : data.chgPct < 0 ? glyph.down : glyph.flat;
  const border = vnColor(data.last, data.ref ?? null, data.ceiling ?? null, data.floor ?? null);
  return (
    <Panel title={`QUOTE  ${data.ticker}`} borderColor={border}>
      <Box>
        <Text bold>{formatPrice(data.last)}</Text>
        <Text color={pctColor(data.chgPct ?? null)}>  {arrow} {formatPct(data.chgPct ?? null)}</Text>
        {data.ref != null ? <Text dimColor>   ref {formatPrice(data.ref)}</Text> : null}
        {data.ceiling != null ? <Text color={theme.ceiling}>   ceil {formatPrice(data.ceiling)}</Text> : null}
        {data.floor != null ? <Text color={theme.floor}>   floor {formatPrice(data.floor)}</Text> : null}
      </Box>
      {(data.rsi14 != null || data.macdSig) ? (
        <Box>
          {data.rsi14 != null ? <Text dimColor>RSI {data.rsi14.toFixed(0)}</Text> : null}
          {data.macdSig ? <Text dimColor>   MACD {data.macdSig}</Text> : null}
        </Box>
      ) : null}
      {data.headline ? (
        <Box marginTop={0}><Text color={theme.muted}>{truncate(data.headline, 80)}</Text></Box>
      ) : null}
    </Panel>
  );
}

export interface ChartCardData {
  ticker: string;
  timeframe: string;
  asciiBody: string;
  levels?: string | null;
}

export function ChartCard({ data }: { data: ChartCardData }) {
  return (
    <Panel title={`CHART  ${data.ticker}  ${data.timeframe}`} borderColor={theme.accent}>
      {data.asciiBody.split("\n").map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      {data.levels ? <Box marginTop={1}><Text color={theme.muted}>{data.levels}</Text></Box> : null}
    </Panel>
  );
}

export interface BacktestCardInput {
  profileRef: string;
  start: string;
  end: string;
  initialCash: number;
  summary: SummaryPayload;
}

export function BacktestCard({ data }: { data: BacktestCardInput }) {
  const alpha = data.summary.totalReturn - data.summary.benchReturn;
  return (
    <Panel title={`BACKTEST  ${data.profileRef}  ${data.start} → ${data.end}`} borderColor={theme.persona}>
      <Box>
        <Text dimColor>cash </Text><Text>{formatBigVnd(data.initialCash)}</Text>
        <Text dimColor>   weeks </Text><Text>{data.summary.weeks}</Text>
        <Text dimColor>   trades </Text><Text>{data.summary.trades}</Text>
        <Text dimColor>   cost </Text><Text>${data.summary.totalCost.toFixed(4)}</Text>
      </Box>
      <Box>
        <Text dimColor>final </Text><Text bold>{formatBigVnd(data.summary.finalMtm)}</Text>
        <Text dimColor>   bench </Text><Text>{formatBigVnd(data.summary.finalBench)}</Text>
      </Box>
      <Box>
        <Text dimColor>return </Text>
        <Text color={pctColor(data.summary.totalReturn)} bold>{formatPct(data.summary.totalReturn)}</Text>
        <Text dimColor>   bench </Text>
        <Text color={pctColor(data.summary.benchReturn)}>{formatPct(data.summary.benchReturn)}</Text>
        <Text dimColor>   α </Text>
        <Text color={pnlColor(alpha)} bold>{formatPct(alpha)}</Text>
        <Text dimColor>   maxDD </Text>
        <Text color={theme.down}>{formatPct(data.summary.maxDD * 100)}</Text>
      </Box>
    </Panel>
  );
}

export interface TeamDecisionCardInput {
  state: TeamState;
  decision: FinalDecision;
}

const RATING_COLOR: Record<string, string> = {
  Buy: theme.up,
  Overweight: theme.up,
  Hold: theme.muted,
  Underweight: theme.accent,
  Sell: theme.down,
};

export function TeamDecisionCard({ data }: { data: TeamDecisionCardInput }) {
  const { state, decision } = data;
  const ratingColor = RATING_COLOR[decision.rating] ?? "white";
  return (
    <Panel
      title={`TEAM ${decision.ticker}  ${state.asOfDateIso}`}
      borderColor={ratingColor}
      badge={`#${decision.journalId ?? "?"}`}
    >
      <Box>
        <Text bold color={ratingColor}>{decision.rating}</Text>
        <Text dimColor>   size </Text>
        <Text>{(decision.sizingPct * 100).toFixed(1)}%</Text>
        <Text dimColor>   run </Text>
        <Text>{decision.teamRunId.slice(0, 8)}</Text>
      </Box>
      <Box flexDirection="column">
        {state.analysts.map((a) => (
          <Box key={a.role}>
            <Text dimColor>{a.role.padEnd(13)}</Text>
            <Text color={a.score > 0 ? theme.up : a.score < 0 ? theme.down : theme.muted}>
              {a.score >= 0 ? "+" : ""}
              {a.score.toFixed(2)}
            </Text>
            <Text dimColor>  {truncate(a.summary, 60)}</Text>
          </Box>
        ))}
      </Box>
      {state.risk ? (
        <Box>
          <Text dimColor>risk </Text>
          <Text color={state.risk.approved ? theme.up : theme.down}>
            {state.risk.approved ? "approved" : "rejected"}
          </Text>
          {state.risk.concerns.length ? (
            <Text dimColor>  · {truncate(state.risk.concerns.join("; "), 60)}</Text>
          ) : null}
        </Box>
      ) : null}
      <Box marginTop={1} flexDirection="column">
        <Text>{truncate(decision.rationale, 240)}</Text>
        {decision.exitPlan ? (
          <Text dimColor>exit · {truncate(decision.exitPlan, 100)}</Text>
        ) : null}
      </Box>
    </Panel>
  );
}

const HEADER: Record<JournalTab, string> = {
  decisions: "DECISIONS",
  orders: "ORDERS",
  fills: "FILLS",
  alerts: "ALERTS",
};

export function JournalCard({ tab, rows }: { tab: JournalTab; rows: JournalRow[] }) {
  return (
    <Panel
      title={`${HEADER[tab]}  (latest ${rows.length})`}
      borderColor={theme.accentSoft}
      badge={rows.length === 0 ? "no rows" : undefined}
    >
      {rows.length === 0 ? (
        <Text dimColor>—</Text>
      ) : (
        rows.map((r) => (
          <Box key={String(r.id)}>
            <Text dimColor>{r.secondary.padEnd(12)} </Text>
            <Text color={r.color ?? "white"}>{truncate(r.primary, 26).padEnd(26)} </Text>
            <Text dimColor>{truncate(r.detail.replace(/\s+/g, " "), 60)}</Text>
          </Box>
        ))
      )}
    </Panel>
  );
}
