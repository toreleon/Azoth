export type VnColor = "green" | "red" | "yellow" | "magenta" | "cyan" | "white";

export function vnColor(
  last: number | null | undefined,
  ref: number | null | undefined,
  ceiling: number | null | undefined,
  floor: number | null | undefined,
): VnColor {
  if (last == null || ref == null) return "white";
  if (ceiling != null && Math.abs(last - ceiling) < 1e-6) return "magenta";
  if (floor != null && Math.abs(last - floor) < 1e-6) return "cyan";
  if (Math.abs(last - ref) < 1e-6) return "yellow";
  return last > ref ? "green" : "red";
}

export function pctColor(p: number | null | undefined): VnColor {
  if (p == null || p === 0) return "yellow";
  return p > 0 ? "green" : "red";
}

export function pnlColor(v: number | null | undefined): VnColor {
  if (v == null || v === 0) return "white";
  return v > 0 ? "green" : "red";
}
