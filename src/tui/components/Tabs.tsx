import React from "react";
import { Box, Text } from "ink";

export interface TabsProps {
  tabs: string[];
  active: number;
}

export function Tabs({ tabs, active }: TabsProps) {
  return (
    <Box>
      {tabs.map((t, i) => (
        <Box key={t} marginRight={2}>
          <Text bold color={i === active ? "cyan" : "gray"}>
            {i === active ? "▶ " : "  "}{t}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
