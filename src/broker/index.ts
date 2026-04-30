import { PaperBroker } from "./paper.js";
import type { Broker } from "./types.js";
import { loadConfig } from "../config/loader.js";

let cached: Broker | null = null;

export function getBroker(): Broker {
  if (cached) return cached;
  const cfg = loadConfig();
  switch (cfg.broker) {
    case "paper":
      cached = new PaperBroker();
      return cached;
    case "dnse":
      throw new Error("dnse broker is not yet implemented (Phase 5)");
  }
}
