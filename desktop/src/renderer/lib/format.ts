const vndFormatter = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const intFormatter = new Intl.NumberFormat("en-US");
const decimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatVnd(amountVnd: number | null | undefined): string {
  if (amountVnd == null || !Number.isFinite(amountVnd)) return "—";
  return `${vndFormatter.format(Math.round(amountVnd))} ₫`;
}

export function formatVndCompact(amountVnd: number | null | undefined): string {
  if (amountVnd == null || !Number.isFinite(amountVnd)) return "—";
  const abs = Math.abs(amountVnd);
  const sign = amountVnd < 0 ? "-" : "";
  if (abs >= 1_000_000_000)
    return `${sign}${decimalFormatter.format(abs / 1_000_000_000)}B ₫`;
  if (abs >= 1_000_000) return `${sign}${decimalFormatter.format(abs / 1_000_000)}M ₫`;
  if (abs >= 1_000) return `${sign}${decimalFormatter.format(abs / 1_000)}K ₫`;
  return `${sign}${vndFormatter.format(abs)} ₫`;
}

export function formatThousandVnd(priceThousandVnd: number | null | undefined): string {
  if (priceThousandVnd == null || !Number.isFinite(priceThousandVnd)) return "—";
  return decimalFormatter.format(priceThousandVnd);
}

export function formatQuantity(qty: number | null | undefined): string {
  if (qty == null || !Number.isFinite(qty)) return "—";
  return intFormatter.format(qty);
}

export function formatPercent(pct: number | null | undefined, digits = 2): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

export function formatSignedVnd(amountVnd: number | null | undefined): string {
  if (amountVnd == null || !Number.isFinite(amountVnd)) return "—";
  const sign = amountVnd > 0 ? "+" : "";
  return `${sign}${formatVndCompact(amountVnd)}`;
}

export function pnlClass(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return "pnl-flat";
  return value > 0 ? "pnl-up" : "pnl-down";
}
