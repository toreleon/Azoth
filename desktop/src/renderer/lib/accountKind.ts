import type { PortfolioSubAccount } from "../../shared/ipc.js";

export type AccountKind = "all" | "main" | "margin" | "other";

function accountText(account: PortfolioSubAccount | null): string {
  return [account?.type, account?.label, account?.id].filter(Boolean).join(" ");
}

function normalizeWords(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isMarginAccount(account: PortfolioSubAccount | null): boolean {
  const text = normalizeWords(accountText(account));
  return /\b(margin|mr|loan|ky quy|vay)\b/.test(text);
}

export function isMainAccount(account: PortfolioSubAccount | null): boolean {
  const text = normalizeWords(accountText(account));
  return /\b(main|normal|cash|thuong|co so|base)\b/.test(text);
}

export function accountKindOf(
  account: PortfolioSubAccount | null,
  index: number,
  accountCount: number,
): AccountKind {
  if (isMarginAccount(account)) return "margin";
  if (isMainAccount(account)) return "main";
  if (accountCount === 2) return index === 0 ? "main" : "margin";
  return "other";
}

export function accountTitle(
  kind: AccountKind,
  account: PortfolioSubAccount | null,
  index: number,
): string {
  if (kind === "main") return "Main account";
  if (kind === "margin") return "Margin account";
  return account?.label || account?.id || `Account ${index + 1}`;
}
