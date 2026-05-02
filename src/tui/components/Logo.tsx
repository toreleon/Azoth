import React from "react";
import { Box, Text } from "ink";
import { theme, glyph } from "../lib/theme.js";

const LINES = [
  " █████╗ ███████╗ ██████╗ ████████╗██╗  ██╗",
  "██╔══██╗╚══███╔╝██╔═══██╗╚══██╔══╝██║  ██║",
  "███████║  ███╔╝ ██║   ██║   ██║   ███████║",
  "██╔══██║ ███╔╝  ██║   ██║   ██║   ██╔══██║",
  "██║  ██║███████╗╚██████╔╝   ██║   ██║  ██║",
  "╚═╝  ╚═╝╚══════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝",
];

export function Logo({ tagline }: { tagline?: string }) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      {LINES.map((l, i) => (
        <Box key={i}>
          <Text color={theme.brand} bold>{glyph.bar} </Text>
          <Text color={theme.accent} bold>{l}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={theme.muted}>agent · VN equities · paper or live</Text>
      </Box>
      {tagline ? (
        <Box marginTop={1}>
          <Text dimColor>{tagline}</Text>
        </Box>
      ) : null}
    </Box>
  );
}
