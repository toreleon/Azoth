import React from "react";
import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "analyze", args: "<ticker> [--rounds N]", description: "Run multi-agent debate on a ticker" },
  { name: "backtest", args: "[profile@vN] [start] [end] [cash]", description: "Run a weekly backtest, results inline" },
  { name: "journal", args: "[decisions|orders|fills|alerts] [N]", description: "Print latest journal rows inline" },
  { name: "decisions", args: "[N]", description: "Latest decisions" },
  { name: "orders", args: "[N]", description: "Latest broker orders" },
  { name: "fills", args: "[N]", description: "Latest filled orders" },
  { name: "quote", args: "<ticker>", description: "Quick quote for a ticker" },
  { name: "chart", args: "<ticker>", description: "ASCII chart for a ticker" },
  { name: "positions", description: "Show current portfolio positions" },
  { name: "alerts", description: "Ask the agent about active alerts" },
  { name: "profile", args: "<id>@v<n>", description: "Switch active agent profile (e.g. vn-equity@v0)" },
  { name: "new", description: "Start a fresh resumable session" },
  { name: "resume", args: "[id]", description: "Resume latest or a specific session" },
  { name: "sessions", description: "List recent project sessions" },
  { name: "clear", description: "Clear conversation and start a fresh session" },
  { name: "help", description: "Show available commands" },
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
            <Text color={active ? theme.accent : theme.muted}>{active ? "› " : "  "}</Text>
            <Text color={active ? theme.accent : "white"} bold={active}>{head}</Text>
            <Text dimColor>{c.description}</Text>
          </Box>
        );
      })}
      <Text dimColor>Tab to complete · Enter to run · ↑↓ to select</Text>
    </Box>
  );
}
