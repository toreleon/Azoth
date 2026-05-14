import * as readline from "node:readline/promises";
import { currentBrokerName } from "../agent/clock.js";
import { loadConfig } from "../config/loader.js";

export interface BrokerConsentRequest {
  action: string;
  detail: string;
  broker: string;
  autonomy: string;
}

type BrokerConsentHandler = (request: BrokerConsentRequest) => Promise<boolean>;

let brokerConsentHandler: BrokerConsentHandler | null = null;

export function setBrokerConsentHandler(handler: BrokerConsentHandler | null): void {
  brokerConsentHandler = handler;
}

async function confirmOnCli(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const ans = (await rl.question(prompt)).trim().toLowerCase();
    return ans === "y" || ans === "yes";
  } finally {
    rl.close();
  }
}

export async function requireBrokerConsent(action: string, detail: string): Promise<boolean> {
  if (currentBrokerName() != null) return true;
  const cfg = loadConfig();
  if (brokerConsentHandler) {
    return brokerConsentHandler({
      action,
      detail,
      broker: cfg.broker,
      autonomy: cfg.autonomy,
    });
  }
  return confirmOnCli(
    `\n  >> Allow broker action: ${action}` +
      `\n  broker=${cfg.broker} autonomy=${cfg.autonomy}` +
      (detail ? `\n  ${detail}` : "") +
      `\n  proceed? [y/N]: `,
  );
}
