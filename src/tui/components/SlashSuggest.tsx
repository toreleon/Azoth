import React from "react";
import { Box, Text } from "ink";

export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "dashboard", description: "Market dashboard (indices, watchlist, flow, movers)" },
  { name: "backtest", description: "Run an agent-driven weekly backtest" },
  { name: "journal", description: "Browse decisions, orders, fills, alerts" },
  { name: "persona", args: "<id>", description: "balanced · momentum · value · bluechip" },
  { name: "clear", description: "Clear conversation, reset agent session" },
  { name: "chat", description: "Return to chat" },
];

export function matchSlash(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const q = input.slice(1).split(/\s+/)[0]!.toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}

export function SlashSuggest({ input, selected }: { input: string; selected: number }) {
  const matches = matchSlash(input);
  if (matches.length === 0) return null;
  const sel = ((selected % matches.length) + matches.length) % matches.length;
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      {matches.map((c, i) => {
        const head = `/${c.name}${c.args ? " " + c.args : ""}`.padEnd(20);
        return (
          <Box key={c.name}>
            <Text color={i === sel ? "cyan" : "white"} bold={i === sel}>
              {i === sel ? "▸ " : "  "}{head}
            </Text>
            <Text dimColor>{c.description}</Text>
          </Box>
        );
      })}
      <Text dimColor>Tab to complete · Enter to run · ↑↓ to select</Text>
    </Box>
  );
}
