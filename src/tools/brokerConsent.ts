import * as readline from "node:readline/promises";
import { currentBrokerName } from "../agent/clock.js";
import { loadConfig } from "../config/loader.js";

export interface BrokerConsentRequest {
  action: string;
  detail: string;
  broker: string;
  autonomy: string;
  toolName?: string;
}

type BrokerConsentHandler = (request: BrokerConsentRequest) => Promise<boolean>;

let brokerConsentHandler: BrokerConsentHandler | null = null;
const approvedToolConsents = new Map<string, number>();

export function setBrokerConsentHandler(handler: BrokerConsentHandler | null): void {
  brokerConsentHandler = handler;
}

export function rememberApprovedToolConsent(action: string): void {
  approvedToolConsents.set(action, (approvedToolConsents.get(action) ?? 0) + 1);
}

function consumeApprovedToolConsent(action: string): boolean {
  const count = approvedToolConsents.get(action) ?? 0;
  if (count <= 0) return false;
  if (count === 1) approvedToolConsents.delete(action);
  else approvedToolConsents.set(action, count - 1);
  return true;
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

export async function requireToolConsent(action: string, detail: string, toolName = action): Promise<boolean> {
  const cfg = loadConfig();
  if (cfg.autonomy === "auto") return true;
  if (consumeApprovedToolConsent(action)) return true;
  if (brokerConsentHandler) {
    return brokerConsentHandler({
      action,
      detail,
      broker: cfg.broker,
      autonomy: cfg.autonomy,
      toolName,
    });
  }
  return confirmOnCli(
    `\n  >> Allow tool call: ${action}` +
      `\n  broker=${cfg.broker} autonomy=${cfg.autonomy}` +
      (detail ? `\n  ${detail}` : "") +
      `\n  proceed? [y/N]: `,
  );
}

export async function requireBrokerConsent(action: string, detail: string): Promise<boolean> {
  if (currentBrokerName() != null) return true;
  return requireToolConsent(action, detail);
}
