export function formatVnd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(amount);
}

export function formatBigVnd(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 1e9) return `${(amount / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(amount / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(amount / 1e3).toFixed(1)}K`;
  return amount.toFixed(0);
}

export function formatPct(p: number | null | undefined, withSign = true): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const sign = withSign && p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

export function formatPrice(p: number | null | undefined, decimals = 2): string {
  if (p == null || !Number.isFinite(p)) return "—";
  return p.toFixed(decimals);
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return "0";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatTime(epochSec: number | null | undefined): string {
  if (epochSec == null) return "—";
  const d = new Date(epochSec * 1000);
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

export function formatDate(epochSec: number | null | undefined): string {
  if (epochSec == null) return "—";
  return new Date(epochSec * 1000).toISOString().slice(0, 10);
}

export function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + "…";
}
