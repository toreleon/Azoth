import React from "react";
import { Box, Text } from "ink";
import { truncate } from "../lib/format.js";

export interface ToolChipProps {
  name: string;
  input?: string;
  result?: string;
  failed?: boolean;
}

export function ToolChip({ name, input, result, failed }: ToolChipProps) {
  const color = failed ? "red" : result ? "green" : "yellow";
  return (
    <Box flexDirection="column">
      <Text color={color}>
        ▸ tool: <Text bold>{name}</Text>
        {input ? <Text dimColor>  {truncate(input.replace(/\s+/g, " "), 80)}</Text> : null}
      </Text>
      {result ? (
        <Box marginLeft={2}>
          <Text dimColor>↳ {truncate(result.replace(/\s+/g, " "), 200)}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
