import { PaperBroker } from "./paper.js";
import { DNSEBroker } from "./dnse.js";
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
      cached = new DNSEBroker();
      return cached;
  }
}
