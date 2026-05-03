import { Box, Text } from "ink";
import { Panel } from "../components/Panel.js";
import { theme } from "./theme.js";
import { pctColor, pnlColor } from "./colors.js";
import { formatBigVnd, formatPct, truncate } from "./format.js";
import type { JournalTab, JournalRow } from "./journal.js";
import type { SummaryPayload } from "../../agent/backtestRunner.js";
import type { FinalDecision, TeamState } from "../../agent/team/state.js";

export interface BacktestCardInput {
  start: string;
  end: string;
  initialCash: number;
  summary: SummaryPayload;
}

export function BacktestCard({ data }: { data: BacktestCardInput }) {
  const alpha = data.summary.totalReturn - data.summary.benchReturn;
  return (
    <Panel title={`BACKTEST  ${data.start} → ${data.end}`} borderColor={theme.persona}>
      <Box>
        <Text dimColor>cash </Text><Text>{formatBigVnd(data.initialCash)}</Text>
        <Text dimColor>   weeks </Text><Text>{data.summary.weeks}</Text>
        <Text dimColor>   trades </Text><Text>{data.summary.trades}</Text>
        {data.summary.rejectedTrades ? (
          <><Text dimColor>   rejected </Text><Text color={theme.down}>{data.summary.rejectedTrades}</Text></>
        ) : null}
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

export interface TeamQuestionCardInput {
  question: string;
  asOfDateIso: string;
  teamRunId: string;
  answer: string;
  recommendation: string;
  keyReasons: string[];
  risks: string[];
  nextActions: string[];
}

export function TeamQuestionCard({ data }: { data: TeamQuestionCardInput }) {
  return (
    <Panel title={`TEAM QUESTION  ${data.asOfDateIso}`} borderColor={theme.persona} badge={data.teamRunId.slice(0, 8)}>
      <Box flexDirection="column">
        <Text dimColor>{truncate(data.question, 96)}</Text>
        <Box marginTop={1}>
          <Text bold>{data.recommendation}</Text>
        </Box>
        <Text>{truncate(data.answer, 280)}</Text>
        {data.keyReasons.length ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>reasons</Text>
            {data.keyReasons.slice(0, 4).map((r, i) => (
              <Text key={i}>- {truncate(r, 120)}</Text>
            ))}
          </Box>
        ) : null}
        {data.risks.length ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>risks</Text>
            {data.risks.slice(0, 3).map((r, i) => (
              <Text key={i}>- {truncate(r, 120)}</Text>
            ))}
          </Box>
        ) : null}
        {data.nextActions.length ? (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor>next</Text>
            {data.nextActions.slice(0, 3).map((a, i) => (
              <Text key={i}>- {truncate(a, 120)}</Text>
            ))}
          </Box>
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
