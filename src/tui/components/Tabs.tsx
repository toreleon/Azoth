import React from "react";
import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

export interface TabsProps {
  tabs: string[];
  active: number;
}

export function Tabs({ tabs, active }: TabsProps) {
  return (
    <Box paddingX={1}>
      {tabs.map((t, i) => {
        const isActive = i === active;
        return (
          <React.Fragment key={t}>
            {i > 0 ? <Text color={theme.muted}> │ </Text> : null}
            {isActive ? <Text color={theme.accent} bold>▎</Text> : <Text> </Text>}
            <Text bold={isActive} color={isActive ? theme.accent : theme.muted}>
              {t}
            </Text>
          </React.Fragment>
        );
      })}
    </Box>
  );
}
