import type { TeamEvent } from "./state.js";
import { AsyncLocalStorage } from "node:async_hooks";

export interface TeamToolEvent {
  tool: "team_question" | "team_analyze";
  event: TeamEvent;
  contextId?: string;
}

type Listener = (event: TeamToolEvent) => void;

const listeners = new Set<Listener>();
const contextStore = new AsyncLocalStorage<string>();

export function subscribeTeamToolEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function withTeamToolEventContext<T>(contextId: string, fn: () => Promise<T>): Promise<T> {
  return contextStore.run(contextId, fn);
}

export function emitTeamToolEvent(event: TeamToolEvent): void {
  const contextId = contextStore.getStore();
  const scopedEvent = contextId ? { ...event, contextId } : event;
  for (const listener of listeners) listener(scopedEvent);
}
