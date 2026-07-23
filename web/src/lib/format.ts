// Formatting helpers. Vietnam board prices arrive in THOUSAND VND; we render them
// as full VND (board * 1000) with the ₫ suffix, Google-Finance style.

const PRICE_SCALE = 1000;

/** Board price (thousand VND) → full VND string, e.g. 28.5 → "28,500". */
export function fmtPriceVnd(boardPrice: number | null | undefined, opts?: { suffix?: boolean }): string {
  if (boardPrice == null || !Number.isFinite(boardPrice)) return "—";
  const vnd = boardPrice * PRICE_SCALE;
  const digits = vnd >= 1000 ? 0 : vnd >= 100 ? 0 : 1;
  const s = vnd.toLocaleString("en-US", { maximumFractionDigits: digits });
  return opts?.suffix === false ? s : `${s} ₫`;
}

/** Board price → compact board number (no scaling), e.g. 28.5 → "28.50". */
export function fmtBoard(boardPrice: number | null | undefined): string {
  if (boardPrice == null || !Number.isFinite(boardPrice)) return "—";
  return boardPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Signed change in board units → full VND string, e.g. 0.5 → "+500". */
export function fmtChangeVnd(boardChange: number | null | undefined): string {
  if (boardChange == null || !Number.isFinite(boardChange)) return "—";
  const vnd = boardChange * PRICE_SCALE;
  const sign = vnd > 0 ? "+" : vnd < 0 ? "−" : "";
  const s = Math.abs(vnd).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${sign}${s}`;
}

/** Signed percent, e.g. 1.79 → "+1.79%". */
export function fmtPct(pct: number | null | undefined, digits = 2): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

/** Index value (points), e.g. 1281.34. */
export function fmtIndex(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Signed absolute change for indices, e.g. 5.06 → "+5.06". */
export function fmtChangeAbs(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  return `${sign}${Math.abs(v).toFixed(digits)}`;
}

/** Compact VND for market cap etc., e.g. 4.16e12 → "4.16T ₫". */
export function fmtBigVnd(vnd: number | null | undefined): string {
  if (vnd == null || !Number.isFinite(vnd)) return "—";
  const abs = Math.abs(vnd);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [base, suffix] of units) {
    if (abs >= base) {
      return `${(vnd / base).toFixed(2)}${suffix} ₫`;
    }
  }
  return `${vnd.toLocaleString("en-US", { maximumFractionDigits: 0 })} ₫`;
}

/** Compact count for shares / volume, e.g. 32_750_000 → "32.75M". */
export function fmtBigNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [base, suffix] of units) {
    if (abs >= base) return `${(n / base).toFixed(2)}${suffix}`;
  }
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

/** Plain percent value (already a ratio in %), e.g. 26.1 → "26.10". */
export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Percent as plain (no sign forcing), e.g. 1.24 → "1.24%". */
export function fmtPctPlain(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

/** "5 minutes ago" style relative time from an ISO string. */
export function fmtRelativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export type Direction = "up" | "down" | "flat";

/** Sign of a change → semantic direction. */
export function dirOf(v: number | null | undefined): Direction {
  if (v == null || !Number.isFinite(v) || v === 0) return "flat";
  return v > 0 ? "up" : "down";
}

/** Human label for a market session. */
export function sessionLabel(s: string, isOpen: boolean): string {
  const map: Record<string, string> = {
    "pre-open": "Pre-open",
    morning: "Market open",
    lunch: "Lunch break",
    afternoon: "Market open",
    atc: "ATC auction",
    "after-hours": "After hours",
    weekend: "Market closed",
  };
  return map[s] ?? (isOpen ? "Market open" : "Market closed");
}
