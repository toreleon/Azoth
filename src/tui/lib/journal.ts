import { getDb } from "../../storage/db.js";
import { formatDate, formatPrice } from "./format.js";

export type JournalTab = "decisions" | "orders" | "fills" | "alerts";

export interface JournalRow {
  id: string | number;
  primary: string;
  secondary: string;
  detail: string;
  ts: number;
  color?: string;
}

export function loadJournal(tab: JournalTab, limit = 10): JournalRow[] {
  const db = getDb();
  const n = Math.max(1, Math.min(200, Math.floor(limit)));
  if (tab === "decisions") {
    const rows = db
      .prepare(
        "SELECT id, ticker, action, rating, rationale, exit_plan, created_at FROM decisions ORDER BY created_at DESC LIMIT ?",
      )
      .all(n) as Array<{ id: number; ticker: string; action: string; rating: string | null; rationale: string; exit_plan: string; created_at: number }>;
    return rows.map((r) => {
      const rating = r.rating ?? r.action;
      return {
        id: r.id,
        primary: `${rating.padEnd(11)} ${r.ticker}`,
        secondary: formatDate(r.created_at),
        detail: `Rating: ${rating}\nLegacy action: ${r.action}\nTicker: ${r.ticker}\nDate: ${formatDate(r.created_at)}\n\nRationale:\n${r.rationale ?? "—"}\n\nExit plan:\n${r.exit_plan ?? "—"}`,
        ts: r.created_at,
        color:
          rating === "Buy" || rating === "Overweight" || r.action === "BUY"
            ? "green"
            : rating === "Sell" || rating === "Underweight" || r.action === "SELL"
              ? "red"
              : "yellow",
      };
    });
  }
  if (tab === "orders") {
    const rows = db
      .prepare(
        "SELECT id, ticker, side, status, quantity, type, limit_price, filled_price, created_at, notes FROM broker_orders ORDER BY created_at DESC LIMIT ?",
      )
      .all(n) as Array<{ id: string; ticker: string; side: string; status: string; quantity: number; type: string; limit_price: number | null; filled_price: number | null; created_at: number; notes: string | null }>;
    return rows.map((r) => ({
      id: r.id,
      primary: `${r.side.padEnd(4)} ${r.ticker} ${r.quantity}`,
      secondary: `${r.status} · ${formatDate(r.created_at)}`,
      detail: `Order ${r.id}\n${r.side} ${r.ticker} qty=${r.quantity} type=${r.type}\nlimit=${formatPrice(r.limit_price)} filled=${formatPrice(r.filled_price)}\nstatus=${r.status}\ndate=${formatDate(r.created_at)}\nnotes: ${r.notes ?? "—"}`,
      ts: r.created_at,
      color: r.side === "BUY" ? "green" : "red",
    }));
  }
  if (tab === "fills") {
    const rows = db
      .prepare(
        "SELECT id, ticker, side, quantity, filled_price, filled_at FROM broker_orders WHERE status = 'FILLED' ORDER BY filled_at DESC LIMIT ?",
      )
      .all(n) as Array<{ id: string; ticker: string; side: string; quantity: number; filled_price: number; filled_at: number }>;
    return rows.map((r) => ({
      id: r.id,
      primary: `${r.side.padEnd(4)} ${r.ticker} ${r.quantity} @ ${formatPrice(r.filled_price)}`,
      secondary: formatDate(r.filled_at),
      detail: `${r.side} ${r.ticker}\nqty=${r.quantity}\nprice=${formatPrice(r.filled_price)}\nfilled=${formatDate(r.filled_at)}`,
      ts: r.filled_at,
      color: r.side === "BUY" ? "green" : "red",
    }));
  }
  try {
    const rows = db
      .prepare("SELECT id, level, message, created_at FROM alerts ORDER BY created_at DESC LIMIT ?")
      .all(n) as Array<{ id: number; level: string; message: string; created_at: number }>;
    return rows.map((r) => ({
      id: r.id,
      primary: r.level.toUpperCase(),
      secondary: formatDate(r.created_at),
      detail: r.message,
      ts: r.created_at,
      color: r.level === "critical" ? "red" : r.level === "warn" ? "yellow" : "white",
    }));
  } catch {
    return [];
  }
}
