import React from "react";
import { Box, Text, useStdout } from "ink";
import { autonomyColor, sessionColor, theme } from "../lib/theme.js";
import { formatTokens, truncate } from "../lib/format.js";

export interface StatusBarProps {
  broker: string;
  autonomy: string;
  profileRef: string;
  sessionId?: string;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  hint?: string;
  sessionLabel?: string;
  streaming?: boolean;
}

const IDLE_HINT = "/ cmds · Ctrl+A autonomy · ? help";
const STREAMING_HINT = "Ctrl+C abort";

export function StatusBar(p: StatusBarProps) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const wide = cols >= 110;

  const hint = p.hint ?? (p.streaming ? STREAMING_HINT : IDLE_HINT);
  const sid = p.sessionId ? truncate(p.sessionId, 8) : null;

  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box>
        <Text color={theme.persona}>{p.profileRef}</Text>
        <Text color={theme.muted}> · </Text>
        <Text color={autonomyColor(p.autonomy)} bold>{p.autonomy}</Text>
        {wide ? (
          <>
            <Text color={theme.muted}> · </Text>
            <Text>{p.broker}</Text>
            {p.sessionLabel ? (
              <>
                <Text color={theme.muted}> · </Text>
                <Text color={sessionColor(p.sessionLabel)}>{p.sessionLabel}</Text>
              </>
            ) : null}
            {sid ? (
              <>
                <Text color={theme.muted}> · </Text>
                <Text dimColor>{sid}</Text>
              </>
            ) : null}
            <Text color={theme.muted}> · </Text>
            <Text dimColor>↑{formatTokens(p.inTokens)} ↓{formatTokens(p.outTokens)} ${p.costUsd.toFixed(2)}</Text>
          </>
        ) : null}
      </Box>
      {hint ? <Text dimColor>{hint}</Text> : null}
    </Box>
  );
}
