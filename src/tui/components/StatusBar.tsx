import React from "react";
import { Box, Text } from "ink";
import { formatTokens } from "../lib/format.js";

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
}

export function StatusBar(p: StatusBarProps) {
  return (
    <Box borderStyle="single" borderColor="gray" paddingX={1} justifyContent="space-between">
      <Text>
        {p.mode ? <><Text color="yellow">[{p.mode.toUpperCase()}]</Text><Text color="gray">  ·  </Text></> : null}
        <Text color="gray">broker </Text><Text color="white">{p.broker}</Text>
        <Text color="gray">  ·  autonomy </Text>
        <Text color={p.autonomy === "auto" ? "red" : p.autonomy === "confirm" ? "yellow" : "green"}>{p.autonomy}</Text>
        <Text dimColor> (shift+tab)</Text>
        <Text color="gray">  ·  persona </Text><Text color="magenta">{p.persona}</Text>
        {p.sessionId ? <><Text color="gray">  ·  sid </Text><Text color="white">{p.sessionId.slice(0, 8)}</Text></> : null}
      </Text>
      <Text>
        <Text color="gray">in </Text><Text>{formatTokens(p.inTokens)}</Text>
        <Text color="gray">  out </Text><Text>{formatTokens(p.outTokens)}</Text>
        <Text color="gray">  $</Text><Text>{p.costUsd.toFixed(4)}</Text>
        <Text color="gray">  {p.hint ?? ""}</Text>
      </Text>
    </Box>
  );
}
