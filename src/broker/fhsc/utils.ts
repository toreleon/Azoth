import type { Order, OrderStatus } from "../types.js";
import { DEFAULT_FHSC_BASE_URL, FHSC_BROKER_NAME, LEGACY_FINHAY_GW_BASE_URL } from "./constants.js";
import type { FhscEnvelope, FhscOrderItem } from "./types.js";

export function numberOf(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[,_\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function vndToThousand(vnd: unknown): number {
  return numberOf(vnd) / 1000;
}

export function payload<T>(json: FhscEnvelope<T>): T {
  return (json.data ?? json.result ?? json) as T;
}

export function rowsFrom<T>(raw: unknown, keys: string[] = ["data", "items", "rows", "records", "list"]): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (Array.isArray(value)) return value as T[];
  }
  return [];
}

export function isSuccess(json: FhscEnvelope): boolean {
  const code = json.error_code;
  return code == null || code === 0 || code === "0" || code === "SUCCESS";
}

export function mapStatus(raw: string | undefined): OrderStatus {
  switch ((raw ?? "").toUpperCase()) {
    case "MATCHED_ALL":
    case "COMPLETED":
    case "FILLED":
      return "FILLED";
    case "CANCELLED":
    case "CANCELED":
      return "CANCELLED";
    case "REJECTING":
    case "REJECTED":
    case "EXPIRED":
      return "REJECTED";
    default:
      return "PENDING";
  }
}

export function mapSide(raw: unknown) {
  const s = String(raw ?? "").toUpperCase();
  return s === "S" || s.includes("SELL") || s.includes("BAN") || s.includes("BÁN") ? "SELL" : "BUY";
}

export function parseDateSec(raw: unknown): number {
  if (typeof raw !== "string" || !raw.trim()) return 0;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return Math.floor(direct / 1000);
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return 0;
  const [, dd, mm, yyyy] = m;
  return Math.floor(Date.parse(`${yyyy}-${mm}-${dd}T00:00:00+07:00`) / 1000);
}

export function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = raw.trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const parsed = Date.parse(s);
  if (!Number.isFinite(parsed)) return null;
  const d = new Date(parsed);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function inDateRange(raw: unknown, fromDate: string, toDate: string): boolean {
  const d = normalizeDate(raw);
  return d == null || (d >= fromDate && d <= toDate);
}

export function todayRange(): { from: string; to: string } {
  const date = todayIso();
  return { from: date, to: date };
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed === LEGACY_FINHAY_GW_BASE_URL ? DEFAULT_FHSC_BASE_URL : trimmed;
}

export function normalizeOrder(o: FhscOrderItem): Order {
  const rawType = String(o.orderType ?? o.order_type ?? "").toUpperCase();
  const status = mapStatus(o.status);
  const filledQty = numberOf(o.exec_qtty);
  return {
    id: String(o.order_id ?? o.id ?? ""),
    broker: FHSC_BROKER_NAME,
    ticker: String(o.symbol ?? "").toUpperCase(),
    side: mapSide(o.side),
    type: rawType === "LO" || rawType === "LIMIT" ? "LIMIT" : "MARKET",
    quantity: numberOf(o.order_qtty ?? o.quantity),
    limitPrice: o.price || o.order_price ? vndToThousand(o.price ?? o.order_price) : null,
    status,
    rejectReason: o.reject_reason ? String(o.reject_reason) : null,
    createdAt: parseDateSec(o.tx_date ?? o.created_at),
    filledAt: status === "FILLED" ? parseDateSec(o.tx_date ?? o.created_at) : null,
    filledPrice: o.exec_price ? vndToThousand(o.exec_price) : null,
    filledQty: filledQty || null,
    notes: null,
  };
}

