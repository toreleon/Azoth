import React from "react";
import { Box, Text } from "ink";
import { useNow } from "../hooks/useNow.js";
import { classifySession } from "../lib/marketSession.js";
import { formatTime } from "../lib/format.js";

export function Header({ mode }: { mode: string }) {
  const now = useNow(1000);
  const session = classifySession(now);
  return (
    <Box borderStyle="single" borderColor="cyan" paddingX={1} justifyContent="space-between">
      <Text>
        <Text bold color="cyan">AZOTH</Text>
        <Text color="gray"> · VN MARKET TERMINAL</Text>
      </Text>
      <Text>
        <Text color="yellow">[{mode.toUpperCase()}]</Text>
        <Text color="gray">  </Text>
        <Text color={session.label === "morning" || session.label === "afternoon" ? "green" : "gray"}>
          {session.display}
        </Text>
        <Text color="gray">  {formatTime(now)} ICT</Text>
      </Text>
    </Box>
  );
}
