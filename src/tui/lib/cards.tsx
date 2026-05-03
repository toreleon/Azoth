import React from "react";
import { Box, Text } from "ink";
import { Panel } from "../components/Panel.js";
import { theme, glyph } from "./theme.js";
import { vnColor, pctColor, pnlColor } from "./colors.js";
import { formatBigVnd, formatPct, formatPrice, truncate } from "./format.js";
import type { JournalTab, JournalRow } from "./journal.js";
import type { SummaryPayload } from "../../agent/backtestRunner.js";

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
