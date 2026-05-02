import React, { useState } from "react";
import { Box, useApp, useInput } from "ink";
import { StatusBar } from "./components/StatusBar.js";
import { Header } from "./components/Header.js";
import { Tabs } from "./components/Tabs.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import { ChatScreen } from "./screens/ChatScreen.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { BacktestScreen } from "./screens/BacktestScreen.js";
import { JournalScreen } from "./screens/JournalScreen.js";
import { loadConfig } from "../config/loader.js";
import { useNow } from "./hooks/useNow.js";
import { classifySession } from "./lib/marketSession.js";

export type Mode = "chat" | "dashboard" | "backtest" | "journal";
type Autonomy = "advisory" | "confirm" | "auto";

const TAB_ORDER: Mode[] = ["chat", "dashboard", "backtest", "journal"];

export function App() {
  const cfg = loadConfig();
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("chat");
  const [persona, setPersona] = useState("balanced");
  const [autonomy, setAutonomy] = useState<Autonomy>(cfg.autonomy);
  const [stats, setStats] = useState({ inTokens: 0, outTokens: 0, costUsd: 0, sessionId: undefined as string | undefined });
  const now = useNow(30_000);
  const session = classifySession(now);

  // Tab/Shift+Tab cycle screens, but skip when in chat — Tab there is reserved
  // for slash-suggest completion and would conflict with the input.
  useInput((inp, key) => {
    if (mode !== "chat" && key.escape) setMode("chat");
    if (mode !== "chat" && key.tab && !key.shift) {
      const idx = TAB_ORDER.indexOf(mode);
      setMode(TAB_ORDER[(idx + 1) % TAB_ORDER.length]!);
      return;
    }
    if (mode !== "chat" && key.tab && key.shift) {
      const idx = TAB_ORDER.indexOf(mode);
      setMode(TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]!);
      return;
    }
    if (key.ctrl && inp === "a") {
      setAutonomy((a) => (a === "advisory" ? "confirm" : a === "confirm" ? "auto" : "advisory"));
    }
  });

  const activeIdx = TAB_ORDER.indexOf(mode);
  const hint = mode === "chat"
    ? "/dash /backtest /journal · Ctrl+A autonomy"
    : "ESC to chat · Tab next · Shift+Tab prev";

  // In chat mode the screen owns the full viewport: <Static> commits
  // finalized messages to scrollback and the input lives at the bottom of
  // the dynamic region. Persistent ticker/Tabs chrome above would push the
  // live region down and create gaps, so we render them only on the
  // dashboard-style screens.
  const isChat = mode === "chat";

  return (
    <Box flexDirection="column" minHeight={24}>
      {!isChat ? <Header mode={mode} /> : null}
      {!isChat ? (
        <Tabs tabs={TAB_ORDER as unknown as string[]} active={activeIdx} hint={hint} />
      ) : null}
      {isChat ? (
        <ErrorBoundary>
          <ChatScreen
            persona={persona}
            setPersona={setPersona}
            autonomy={autonomy}
            setAutonomy={(a: string) => setAutonomy(a as Autonomy)}
            onStats={(s) => setStats((prev) => ({ ...prev, ...s }))}
            setMode={setMode}
            onQuit={() => exit()}
          />
        </ErrorBoundary>
      ) : (
        <Box flexGrow={1}>
          <ErrorBoundary>
            {mode === "dashboard" ? (
              <DashboardScreen />
            ) : mode === "backtest" ? (
              <BacktestScreen />
            ) : (
              <JournalScreen />
            )}
          </ErrorBoundary>
        </Box>
      )}
      <StatusBar
        mode={mode}
        broker={cfg.broker}
        autonomy={autonomy}
        persona={persona}
        sessionId={stats.sessionId}
        inTokens={stats.inTokens}
        outTokens={stats.outTokens}
        costUsd={stats.costUsd}
        sessionLabel={session.label}
      />
    </Box>
  );
}
