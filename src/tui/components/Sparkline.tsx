import React from "react";
import { Box, Text } from "ink";
import { sparkline } from "../lib/sparkline.js";

export interface SparklineProps {
  values: Array<number | null | undefined>;
  width?: number;
  color?: string;
  label?: string;
}

export function Sparkline({ values, width, color = "green", label }: SparklineProps) {
  const line = sparkline(values, width);
  return (
    <Box>
      {label ? <Text color="gray">{label} </Text> : null}
      <Text color={color}>{line || "—"}</Text>
    </Box>
  );
}
