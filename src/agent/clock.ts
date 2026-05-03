import { AsyncLocalStorage } from "node:async_hooks";

export interface AsOfStore {
  asOfSec: number;
  brokerName?: string;
  /** When set, BUY orders are rejected by the risk guardrail (drawdown freeze). */
  freezeBuys?: boolean;
}

// ALS keeps in-process call-chains (e.g. pre-fetch loops) clean,
// but the SDK's MCP bridge dispatches tool handlers from a separate
// async chain (stdin data events) and would lose the ALS context.
// The harness therefore also sets a module-level override that survives
// the bridge boundary. Backtests run sequentially, so a single global
// is safe.
export const asOfClock = new AsyncLocalStorage<AsOfStore>();

let override: AsOfStore | null = null;

export function setActiveAsOf(store: AsOfStore | null) {
  override = store;
}

export function nowSec(): number {
  if (override) return override.asOfSec;
  return asOfClock.getStore()?.asOfSec ?? Math.floor(Date.now() / 1000);
}

export function currentBrokerName(): string | undefined {
  if (override) return override.brokerName;
  return asOfClock.getStore()?.brokerName;
}

export function currentFreezeBuys(): boolean {
  if (override) return override.freezeBuys === true;
  return asOfClock.getStore()?.freezeBuys === true;
}

export function isAsOfOverridden(): boolean {
  return override != null;
}
