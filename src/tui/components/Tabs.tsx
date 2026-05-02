import React from "react";
import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

export interface TabsProps {
  tabs: string[];
  active: number;
  hint?: string;
}

export function Tabs({ tabs, active, hint }: TabsProps) {
  return (
    <Box paddingX={1} justifyContent="space-between">
      <Box>
        {tabs.map((t, i) => {
          const isActive = i === active;
          return (
            <React.Fragment key={t}>
              {i > 0 ? <Text color={theme.muted}> │ </Text> : null}
              <Text bold={isActive} color={isActive ? theme.accent : theme.muted}>
                {t}
              </Text>
            </React.Fragment>
          );
        })}
      </Box>
      {hint ? <Text color={theme.muted} dimColor>{hint}</Text> : null}
    </Box>
  );
}
