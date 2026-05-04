import { Box, Text } from "ink";
import { theme, glyph } from "../lib/theme.js";
import { summarizeToolInput } from "../lib/toolSummary.js";

export interface ToolChipProps {
  name: string;
  input?: string;
  result?: string;
  failed?: boolean;
}

export function ToolChip({ name, input, result, failed }: ToolChipProps) {
  const status = failed ? "fail" : result ? "done" : "running";
  const color = status === "fail" ? theme.down : theme.muted;
  const icon = status === "fail" ? glyph.fail : status === "done" ? glyph.toolDone : glyph.toolRunning;
  const argSummary = summarizeToolInput(input);
  return (
    <Box>
      <Text color={color}>{icon} </Text>
      <Text color={color}>{name}</Text>
      {argSummary ? <Text dimColor> {argSummary}</Text> : null}
    </Box>
  );
}
