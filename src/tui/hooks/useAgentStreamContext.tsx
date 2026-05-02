import React, { createContext, useContext } from "react";
import { useAgentStream, type AgentStreamState } from "./useAgentStream.js";

const AgentStreamContext = createContext<AgentStreamState | null>(null);

export function AgentStreamProvider({ children }: { children: React.ReactNode }) {
  const stream = useAgentStream();
  return <AgentStreamContext.Provider value={stream}>{children}</AgentStreamContext.Provider>;
}

export function useAgentStreamCtx(): AgentStreamState {
  const ctx = useContext(AgentStreamContext);
  if (!ctx) throw new Error("useAgentStreamCtx must be used inside <AgentStreamProvider>");
  return ctx;
}
