import React from "react";
import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

export interface PanelProps {
  title: string;
  children: React.ReactNode;
  flex?: number;
  width?: number | string;
  height?: number;
  borderColor?: string;
  badge?: string;
  badgeColor?: string;
  titleColor?: string;
}

export function Panel({
  title,
  children,
  flex,
  width,
  height,
  borderColor = theme.accentSoft,
  badge,
  badgeColor = theme.muted,
  titleColor,
}: PanelProps) {
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
      <Box justifyContent="space-between">
        <Text bold color={titleColor ?? borderColor}>{title}</Text>
        {badge ? <Text color={badgeColor} dimColor>{badge}</Text> : null}
      </Box>
      <Box flexDirection="column" marginTop={0}>{children}</Box>
    </Box>
  );
}
