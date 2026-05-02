import React from "react";
import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "dashboard", description: "Market dashboard (indices, watchlist, flow, movers)" },
  { name: "backtest", description: "Run an agent-driven weekly backtest" },
  { name: "journal", description: "Browse decisions, orders, fills, alerts" },
  { name: "quote", args: "<ticker>", description: "Quick quote for a ticker" },
  { name: "chart", args: "<ticker>", description: "ASCII chart for a ticker" },
  { name: "positions", description: "Show current portfolio positions" },
  { name: "alerts", description: "Show active price alerts" },
  { name: "persona", args: "<id>", description: "balanced · momentum · value · bluechip" },
  { name: "new", description: "Start a fresh resumable session" },
  { name: "resume", args: "[id]", description: "Resume latest or a specific session" },
  { name: "sessions", description: "List recent project sessions" },
  { name: "clear", description: "Clear conversation and start a fresh session" },
  { name: "help", description: "Show available commands" },
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
    <Box flexDirection="column" borderStyle="round" borderColor={theme.accent} paddingX={1}>
      {matches.map((c, i) => {
        const head = `/${c.name}${c.args ? " " + c.args : ""}`.padEnd(20);
        const active = i === sel;
        return (
          <Box key={c.name}>
            <Text color={active ? theme.brand : theme.muted}>{active ? "▌" : " "} </Text>
            <Text color={active ? theme.accent : "white"} bold={active}>{head}</Text>
            <Text dimColor>{c.description}</Text>
          </Box>
        );
      })}
      <Text dimColor>Tab to complete · Enter to run · ↑↓ to select</Text>
    </Box>
  );
}
