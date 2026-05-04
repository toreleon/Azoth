import type { TeamEvent } from "./state.js";

export interface TeamToolEvent {
  tool: "team_question" | "team_analyze";
  event: TeamEvent;
}

type Listener = (event: TeamToolEvent) => void;

const listeners = new Set<Listener>();

export function subscribeTeamToolEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitTeamToolEvent(event: TeamToolEvent): void {
  for (const listener of listeners) listener(event);
}
