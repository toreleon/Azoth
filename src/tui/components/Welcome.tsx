import { Box, Text } from "ink";
import { theme } from "../lib/theme.js";

const LOGO = [
  " █████╗ ███████╗ ██████╗ ████████╗██╗  ██╗",
  "██╔══██╗╚══███╔╝██╔═══██╗╚══██╔══╝██║  ██║",
  "███████║  ███╔╝ ██║   ██║   ██║   ███████║",
  "██╔══██║ ███╔╝  ██║   ██║   ██║   ██╔══██║",
  "██║  ██║███████╗╚██████╔╝   ██║   ██║  ██║",
  "╚═╝  ╚═╝╚══════╝ ╚═════╝    ╚═╝   ╚═╝  ╚═╝",
];

const TIPS = [
  ["/team <message>", "multi-agent team debate"],
  ["/analyze <TICKER>", "structured team analysis"],
  ["/quote <TICKER>", "price · technicals · news"],
  ["/positions", "portfolio · PnL · exposures"],
  ["/autonomy", "persist advisory · confirm · auto"],
  ["/health", "runtime · broker · provider checks"],
  ["/backtest", "team-driven weekly simulation"],
  ["/journal", "decisions · orders · fills · alerts"],
];

export interface WelcomeProps {
  version: string;
  autonomy: string;
  broker: string;
  cwd: string;
}

export function Welcome({ version, autonomy, broker, cwd }: WelcomeProps) {
  return (
    <Box
      borderStyle="round"
      borderColor={theme.muted}
      flexDirection="row"
      paddingX={1}
    >
      <Box flexDirection="column" width={48} flexShrink={0} marginRight={2}>
        {LOGO.map((l, i) => (
          <Text key={i} color={theme.accent} bold>{l}</Text>
        ))}
        <Box marginTop={1}>
          <Text color={theme.muted}>Azoth copilot — v{version}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text>
            <Text dimColor>team     </Text>
            <Text>investment</Text>
            <Text dimColor>  ·  autonomy  </Text>
            <Text>{autonomy}</Text>
          </Text>
          <Text>
            <Text dimColor>broker   </Text>
            <Text>{broker}</Text>
          </Text>
          <Text>
            <Text dimColor>cwd      </Text>
            <Text>{cwd}</Text>
          </Text>
        </Box>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingLeft={2}>
        <Text color={theme.accent} bold>Tips for getting started</Text>
        <Box flexDirection="column" marginTop={0}>
          {TIPS.map(([cmd, desc], i) => (
            <Text key={i}>
              <Text color={theme.brand} bold>{cmd!.padEnd(22)}</Text>
              <Text dimColor>{desc}</Text>
            </Text>
          ))}
          <Box marginTop={0}>
          <Text dimColor>type / to autocomplete · ↵ to send · Ctrl+C to abort</Text>
          </Box>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.accent} bold>What&apos;s new</Text>
          <Text dimColor>· Chat-first layout — market data flows into chat, no dashboard grid.</Text>
          <Text dimColor>· /team, /analyze, /quote, /positions, /journal, /backtest render inline.</Text>
          <Text dimColor>· /autonomy persists advisory, confirm, or auto mode.</Text>
        </Box>
      </Box>
    </Box>
  );
}
