export type SessionLabel =
  | "pre-open"
  | "morning"
  | "lunch"
  | "afternoon"
  | "atc"
  | "after-hours"
  | "weekend";

export interface SessionInfo {
  label: SessionLabel;
  display: string;
  intervalMs: number;
}

export function classifySession(epochSec: number): SessionInfo {
  const ictMs = epochSec * 1000 + 7 * 3600 * 1000;
  const d = new Date(ictMs);
  const day = d.getUTCDay();
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();

  if (day === 0 || day === 6) {
    return { label: "weekend", display: "WEEKEND", intervalMs: 600_000 };
  }
  if (minutes < 9 * 60) {
    return { label: "pre-open", display: "PRE-OPEN", intervalMs: 60_000 };
  }
  if (minutes < 11 * 60 + 30) {
    return { label: "morning", display: "MORNING", intervalMs: 15_000 };
  }
  if (minutes < 13 * 60) {
    return { label: "lunch", display: "LUNCH", intervalMs: 60_000 };
  }
  if (minutes < 14 * 60 + 30) {
    return { label: "afternoon", display: "AFTERNOON", intervalMs: 15_000 };
  }
  if (minutes < 14 * 60 + 45) {
    return { label: "atc", display: "ATC", intervalMs: 30_000 };
  }
  return { label: "after-hours", display: "AFTER-HOURS", intervalMs: 300_000 };
}
