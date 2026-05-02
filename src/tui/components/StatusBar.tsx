import React from "react";
import { Box, Text } from "ink";
import { autonomyColor } from "../lib/theme.js";

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
    <Box paddingX={1}>
      <Text color={autonomyColor(p.autonomy)} bold>{p.autonomy}</Text>
      <Text dimColor> autonomy</Text>
    </Box>
  );
}
