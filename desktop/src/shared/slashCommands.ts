export interface SlashCommand {
  name: string;
  args?: string;
  description: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "team", args: "<message>", description: "Run agent-team orchestration" },
  { name: "backtest", args: "[start] [end] [cash] [--interval 1h]", description: "Run interval backtest" },
  { name: "quote", args: "<ticker>", description: "Quick quote for a ticker" },
  { name: "positions", description: "Show current portfolio positions" },
  { name: "autonomy", args: "<manual|auto>", description: "Persist autonomy mode" },
  { name: "health", args: "[--probe]", description: "Check runtime and provider reachability" },
  { name: "about", description: "Show version, runtime paths, broker, and provider" },
  { name: "new", description: "Start a fresh resumable session" },
  { name: "sessions", description: "List recent project sessions" },
  { name: "help", description: "Show available commands" },
];

export function matchSlash(input: string): SlashCommand[] {
  if (!input.startsWith("/")) return [];
  const q = input.slice(1).split(/\s+/)[0]!.toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
}
