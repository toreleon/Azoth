import { PaperBroker } from "./paper.js";
import { DNSEBroker } from "./dnse.js";
import { FHSCBroker } from "./fhsc.js";
import type { Broker } from "./types.js";
import { loadConfig } from "../config/loader.js";
import { currentBrokerName } from "../agent/clock.js";

let cached: Broker | null = null;
const backtestBrokers = new Map<string, PaperBroker>();

export function getBroker(): Broker {
  // Backtest path: ALS pins a per-run paper broker name. Each run gets its
  // own PaperBroker instance backed by a separate `broker` row, so live state
  // is never touched.
  const btName = currentBrokerName();
  if (btName) {
    let b = backtestBrokers.get(btName);
    if (!b) {
      b = new PaperBroker(undefined, btName);
      backtestBrokers.set(btName, b);
    }
    return b;
  }

  if (cached) return cached;
  const cfg = loadConfig();
  switch (cfg.broker) {
    case "paper":
      cached = new PaperBroker();
      return cached;
    case "dnse":
      cached = new DNSEBroker();
      return cached;
    case "fhsc":
      cached = new FHSCBroker();
      return cached;
  }
}

export function resetBrokerCache(): void {
  cached = null;
}

export function getBacktestBroker(
  brokerName: string,
  initialCashVnd?: number,
): PaperBroker {
  let b = backtestBrokers.get(brokerName);
  if (!b) {
    b = new PaperBroker(initialCashVnd, brokerName);
    backtestBrokers.set(brokerName, b);
  }
  return b;
}
