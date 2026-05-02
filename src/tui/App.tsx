import React, { useState } from "react";
import { Box, useApp, useInput } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ChatScreen } from "./screens/ChatScreen.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { BacktestScreen } from "./screens/BacktestScreen.js";
import { JournalScreen } from "./screens/JournalScreen.js";
import { loadConfig } from "../config/loader.js";

export type Mode = "chat" | "dashboard" | "backtest" | "journal";
type Autonomy = "advisory" | "confirm" | "auto";

export function App() {
  const cfg = loadConfig();
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("chat");
  const [persona, setPersona] = useState("balanced");
  const [autonomy, setAutonomy] = useState<Autonomy>(cfg.autonomy);
  const [stats, setStats] = useState({ inTokens: 0, outTokens: 0, costUsd: 0, sessionId: undefined as string | undefined });

  useInput((_inp, key) => {
    if (mode !== "chat" && key.escape) setMode("chat");
    if (key.tab && key.shift) {
      setAutonomy((a) =>
        a === "advisory" ? "confirm" : a === "confirm" ? "auto" : "advisory",
      );
    }
  });

  const hint = mode === "chat" ? "" : "ESC to return to chat";

  return (
    <Box flexDirection="column" minHeight={24}>
      <Box flexGrow={1}>
        <ErrorBoundary>
          {mode === "chat" ? (
            <ChatScreen
              persona={persona}
              setPersona={setPersona}
              autonomy={autonomy}
              setAutonomy={(a: string) => setAutonomy(a as Autonomy)}
              onStats={(s) => setStats((prev) => ({ ...prev, ...s }))}
              setMode={setMode}
              onQuit={() => exit()}
            />
          ) : mode === "dashboard" ? (
            <DashboardScreen />
          ) : mode === "backtest" ? (
            <BacktestScreen />
          ) : (
            <JournalScreen />
          )}
        </ErrorBoundary>
      </Box>
      <StatusBar
        mode={mode}
        broker={cfg.broker}
        autonomy={autonomy}
        persona={persona}
        sessionId={stats.sessionId}
        inTokens={stats.inTokens}
        outTokens={stats.outTokens}
        costUsd={stats.costUsd}
        hint={hint}
      />
    </Box>
  );
}
