import React from "react";
import { Box, Text } from "ink";

export interface PanelProps {
  title: string;
  children: React.ReactNode;
  flex?: number;
  width?: number | string;
  height?: number;
  borderColor?: string;
  badge?: string;
  badgeColor?: string;
}

export function Panel({ title, children, flex, width, height, borderColor = "gray", badge, badgeColor = "gray" }: PanelProps) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      flexGrow={flex}
      width={width as any}
      height={height}
    >
      <Box>
        <Text bold color="cyan">{title}</Text>
        {badge ? <Text color={badgeColor}>  {badge}</Text> : null}
      </Box>
      <Box flexDirection="column" marginTop={0}>{children}</Box>
    </Box>
  );
}
