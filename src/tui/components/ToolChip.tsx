import React from "react";
import { Box, Text } from "ink";
import { theme, glyph } from "../lib/theme.js";
import { summarizeToolInput, summarizeToolResult } from "../lib/toolSummary.js";

export interface ToolChipProps {
  name: string;
  input?: string;
  result?: string;
  failed?: boolean;
}

export function ToolChip({ name, input, result, failed }: ToolChipProps) {
  const status = failed ? "fail" : result ? "done" : "running";
  const color = status === "fail" ? theme.down : status === "done" ? theme.up : theme.accent;
  const icon = status === "running" ? glyph.toolRunning : glyph.toolDone;
  const pill = status === "fail" ? glyph.fail : status === "done" ? glyph.ok : "…";
  const argSummary = summarizeToolInput(name, input);
  const resultSummary = result ? summarizeToolResult(name, result) : null;
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}>{icon} </Text>
        <Text color={color} bold>{name}</Text>
        {argSummary ? <Text dimColor>({argSummary})</Text> : null}
        <Text>  </Text>
        <Text color={color}>{pill}</Text>
      </Box>
      {resultSummary ? (
        <Box marginLeft={2}>
          <Text dimColor>↳ {resultSummary}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
