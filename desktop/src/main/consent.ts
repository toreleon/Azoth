import { randomUUID } from "node:crypto";
import { setBrokerConsentHandler, type BrokerConsentRequest } from "@azoth/core/tools/brokerConsent.js";
import { sendStream } from "./streamBus.js";

const pending = new Map<string, (approved: boolean) => void>();

export function installConsentBridge(): void {
  setBrokerConsentHandler(async (req: BrokerConsentRequest) => {
    return new Promise<boolean>((resolve) => {
      const id = randomUUID();
      pending.set(id, resolve);
      sendStream({
        kind: "consent:request",
        id,
        action: req.action,
        detail: req.detail,
        broker: req.broker,
        autonomy: req.autonomy,
      });
    });
  });
}

export function respondConsent(id: string, approved: boolean): void {
  const resolve = pending.get(id);
  if (!resolve) return;
  pending.delete(id);
  resolve(approved);
}

export function clearConsent(): void {
  for (const resolve of pending.values()) resolve(false);
  pending.clear();
}
