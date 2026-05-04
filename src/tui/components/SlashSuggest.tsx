import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "team", args: "<message>", description: "Run multi-agent debate on a question" },
  { name: "analyze", args: "<ticker> [--rounds N]", description: "Run structured team analysis on a ticker" },
  { name: "backtest", args: "[start] [end] [cash] [--interval 1h]", description: "Run interval backtest, defaults to 30m" },
  { name: "journal", args: "[decisions|orders|fills|alerts] [N]", description: "Print latest journal rows inline" },
  { name: "quote", args: "<ticker>", description: "Quick quote for a ticker" },
  { name: "positions", description: "Show current portfolio positions" },
  { name: "autonomy", args: "<advisory|confirm|auto>", description: "Persist autonomy mode" },
  { name: "health", args: "[--probe]", description: "Check local runtime and optional data provider reachability" },
  { name: "new", description: "Start a fresh resumable session" },
  { name: "resume", args: "[id]", description: "Resume latest or a specific session" },
  { name: "sessions", description: "List recent project sessions" },
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
