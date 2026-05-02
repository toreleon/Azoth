import React from "react";
import { Box, Text } from "ink";
import { formatTokens } from "../lib/format.js";
import { theme, autonomyColor } from "../lib/theme.js";

export interface StatusBarProps {
  broker: string;
  autonomy: string;
  persona: string;
  sessionId?: string;
  inTokens: number;
  outTokens: number;
  costUsd: number;
  hint?: string;
  mode?: string;
  sessionLabel?: string;
}

export function StatusBar(p: StatusBarProps) {
  return (
    <Box borderStyle="single" borderColor={theme.muted} paddingX={1} justifyContent="space-between">
      <Text>
        <Text color={theme.muted}>broker </Text><Text>{p.broker}</Text>
        <Text color={theme.muted}>  ·  </Text>
        <Text color={autonomyColor(p.autonomy)} bold>{p.autonomy}</Text>
        <Text color={theme.muted}>  ·  </Text>
        <Text color={theme.persona}>{p.persona}</Text>
        {p.sessionId ? <><Text color={theme.muted}>  ·  sid </Text><Text>{p.sessionId.slice(0, 8)}</Text></> : null}
      </Text>
      <Text>
        <Text color={theme.muted}>$</Text><Text>{p.costUsd.toFixed(4)}</Text>
        <Text color={theme.muted}>  in/out </Text>
        <Text>{formatTokens(p.inTokens)}</Text>
        <Text color={theme.muted}>/</Text>
        <Text>{formatTokens(p.outTokens)}</Text>
        <Text color={theme.muted}>   /cmds · Tab nav · Ctrl+A autonomy{p.hint ? ` · ${p.hint}` : ""}</Text>
      </Text>
    </Box>
  );
}
