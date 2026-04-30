import { randomUUID } from "node:crypto";
import { getDb } from "../storage/db.js";
import { getStockOhlcv } from "../data/sources/dnsePublic.js";
import type {
  Broker,
  BrokerPosition,
  BrokerSnapshot,
  Order,
  OrderStatus,
  PlaceOrderInput,
} from "./types.js";

const NAME = "paper";
const LOT_SIZE = 100;          // HOSE board lot
const SLIPPAGE = 0.001;        // 10 bps adverse fill
const FEE_PCT = 0.0015;        // 0.15% all-in commission + tax estimate

interface OrderRow {
  id: string;
  broker: string;
  ticker: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  quantity: number;
  limit_price: number | null;
  status: OrderStatus;
  reject_reason: string | null;
  created_at: number;
  filled_at: number | null;
  filled_price: number | null;
  filled_qty: number | null;
  notes: string | null;
}

function rowToOrder(r: OrderRow): Order {
  return {
    id: r.id,
    broker: r.broker,
    ticker: r.ticker,
    side: r.side,
    type: r.type,
    quantity: r.quantity,
    limitPrice: r.limit_price,
    status: r.status,
    rejectReason: r.reject_reason,
    createdAt: r.created_at,
    filledAt: r.filled_at,
    filledPrice: r.filled_price,
    filledQty: r.filled_qty,
    notes: r.notes,
  };
}

async function lastClose(ticker: string): Promise<number | null> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 14 * 86400;
  const bars = await getStockOhlcv(ticker, "1D", from, to).catch(() => []);
  return bars.length ? bars[bars.length - 1]!.close : null;
}

export class PaperBroker implements Broker {
  readonly name = NAME;
  private initialCashVnd: number;
  private overridePrice: ((ticker: string) => number | null) | null = null;

  constructor(initialCashVnd = 1_000_000_000) {
    this.initialCashVnd = initialCashVnd;
    this.ensureState();
  }

  /** Backtest hook: force fills at a specific price (e.g. that day's close). */
  setPriceOverride(fn: ((ticker: string) => number | null) | null) {
    this.overridePrice = fn;
  }

  private ensureState() {
    const db = getDb();
    const row = db
      .prepare("SELECT cash_vnd FROM broker_state WHERE broker = ?")
      .get(NAME) as { cash_vnd: number } | undefined;
    if (!row) {
      db.prepare(
        "INSERT INTO broker_state (broker, cash_vnd, updated_at) VALUES (?, ?, ?)",
      ).run(NAME, this.initialCashVnd, Math.floor(Date.now() / 1000));
    }
  }

  /** Reset the paper broker's cash + positions + orders (testing). */
  reset(initialCashVnd?: number) {
    const db = getDb();
    if (initialCashVnd != null) this.initialCashVnd = initialCashVnd;
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM broker_orders WHERE broker = ?").run(NAME);
      db.prepare("DELETE FROM broker_positions WHERE broker = ?").run(NAME);
      db.prepare(
        "INSERT OR REPLACE INTO broker_state (broker, cash_vnd, updated_at) VALUES (?, ?, ?)",
      ).run(NAME, this.initialCashVnd, Math.floor(Date.now() / 1000));
    });
    tx();
  }

  async placeOrder(input: PlaceOrderInput): Promise<Order> {
    const db = getDb();
    const ticker = input.ticker.toUpperCase();
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const reject = (reason: string): Order => {
      db.prepare(
        `INSERT INTO broker_orders (id,broker,ticker,side,type,quantity,limit_price,status,reject_reason,created_at,notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        NAME,
        ticker,
        input.side,
        input.type,
        input.quantity,
        input.limitPrice ?? null,
        "REJECTED",
        reason,
        now,
        input.notes ?? null,
      );
      return rowToOrder(
        db
          .prepare("SELECT * FROM broker_orders WHERE id = ?")
          .get(id) as OrderRow,
      );
    };

    if (input.quantity <= 0 || !Number.isInteger(input.quantity)) {
      return reject("quantity must be a positive integer");
    }
    if (input.quantity % LOT_SIZE !== 0) {
      return reject(`quantity must be a multiple of HOSE lot size (${LOT_SIZE})`);
    }
    if (input.type === "LIMIT" && (input.limitPrice == null || input.limitPrice <= 0)) {
      return reject("LIMIT order requires positive limitPrice");
    }

    // Resolve fill price
    const refPrice =
      this.overridePrice?.(ticker) ?? (await lastClose(ticker));
    if (refPrice == null) {
      return reject(`no recent price available for ${ticker}`);
    }

    let fillPrice: number;
    if (input.type === "MARKET") {
      fillPrice =
        input.side === "BUY"
          ? refPrice * (1 + SLIPPAGE)
          : refPrice * (1 - SLIPPAGE);
    } else {
      // LIMIT — fill iff price crosses; otherwise PENDING.
      const lp = input.limitPrice!;
      const crosses =
        input.side === "BUY" ? refPrice <= lp : refPrice >= lp;
      if (!crosses) {
        db.prepare(
          `INSERT INTO broker_orders (id,broker,ticker,side,type,quantity,limit_price,status,created_at,notes)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          id,
          NAME,
          ticker,
          input.side,
          input.type,
          input.quantity,
          lp,
          "PENDING",
          now,
          input.notes ?? null,
        );
        return rowToOrder(
          db.prepare("SELECT * FROM broker_orders WHERE id = ?").get(id) as OrderRow,
        );
      }
      fillPrice = lp;
    }

    const notional = fillPrice * input.quantity * 1000; // thousand VND -> VND
    const fees = notional * FEE_PCT;

    // Atomic ledger update
    const tx = db.transaction(() => {
      const stateRow = db
        .prepare("SELECT cash_vnd FROM broker_state WHERE broker = ?")
        .get(NAME) as { cash_vnd: number };
      const posRow = db
        .prepare(
          "SELECT quantity, avg_cost FROM broker_positions WHERE broker = ? AND ticker = ?",
        )
        .get(NAME, ticker) as { quantity: number; avg_cost: number } | undefined;

      let cash = stateRow.cash_vnd;
      let qty = posRow?.quantity ?? 0;
      let avgCost = posRow?.avg_cost ?? 0;

      if (input.side === "BUY") {
        const total = notional + fees;
        if (cash < total) {
          throw new Error(
            `insufficient cash: need ${total.toFixed(0)} VND, have ${cash.toFixed(0)}`,
          );
        }
        cash -= total;
        const newQty = qty + input.quantity;
        avgCost = (qty * avgCost + input.quantity * fillPrice) / newQty;
        qty = newQty;
      } else {
        if (qty < input.quantity) {
          throw new Error(`insufficient position: have ${qty}, sell ${input.quantity}`);
        }
        cash += notional - fees;
        qty -= input.quantity;
        if (qty === 0) avgCost = 0;
      }

      db.prepare(
        "UPDATE broker_state SET cash_vnd = ?, updated_at = ? WHERE broker = ?",
      ).run(cash, now, NAME);

      if (qty === 0 && posRow) {
        db.prepare(
          "DELETE FROM broker_positions WHERE broker = ? AND ticker = ?",
        ).run(NAME, ticker);
      } else {
        db.prepare(
          `INSERT INTO broker_positions (broker, ticker, quantity, avg_cost, updated_at)
           VALUES (?,?,?,?,?)
           ON CONFLICT(broker, ticker) DO UPDATE SET
             quantity = excluded.quantity,
             avg_cost = excluded.avg_cost,
             updated_at = excluded.updated_at`,
        ).run(NAME, ticker, qty, avgCost, now);
      }

      db.prepare(
        `INSERT INTO broker_orders (id,broker,ticker,side,type,quantity,limit_price,status,created_at,filled_at,filled_price,filled_qty,notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        NAME,
        ticker,
        input.side,
        input.type,
        input.quantity,
        input.limitPrice ?? null,
        "FILLED",
        now,
        now,
        fillPrice,
        input.quantity,
        input.notes ?? null,
      );
    });

    try {
      tx();
    } catch (err) {
      return reject((err as Error).message);
    }

    return rowToOrder(
      db.prepare("SELECT * FROM broker_orders WHERE id = ?").get(id) as OrderRow,
    );
  }

  async cancelOrder(id: string): Promise<Order> {
    const db = getDb();
    const row = db
      .prepare("SELECT * FROM broker_orders WHERE id = ? AND broker = ?")
      .get(id, NAME) as OrderRow | undefined;
    if (!row) throw new Error(`order ${id} not found`);
    if (row.status !== "PENDING") {
      return rowToOrder(row);
    }
    db.prepare(
      "UPDATE broker_orders SET status = 'CANCELLED' WHERE id = ?",
    ).run(id);
    return rowToOrder(
      db.prepare("SELECT * FROM broker_orders WHERE id = ?").get(id) as OrderRow,
    );
  }

  async listOrders(filter: {
    ticker?: string;
    status?: OrderStatus;
    limit?: number;
  } = {}): Promise<Order[]> {
    const db = getDb();
    const limit = filter.limit ?? 50;
    const where: string[] = ["broker = ?"];
    const args: unknown[] = [NAME];
    if (filter.ticker) {
      where.push("ticker = ?");
      args.push(filter.ticker.toUpperCase());
    }
    if (filter.status) {
      where.push("status = ?");
      args.push(filter.status);
    }
    args.push(limit);
    const rows = db
      .prepare(
        `SELECT * FROM broker_orders WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...args) as OrderRow[];
    return rows.map(rowToOrder);
  }

  async snapshot(): Promise<BrokerSnapshot> {
    const db = getDb();
    const state = db
      .prepare("SELECT cash_vnd FROM broker_state WHERE broker = ?")
      .get(NAME) as { cash_vnd: number };
    const posRows = db
      .prepare(
        "SELECT ticker, quantity, avg_cost FROM broker_positions WHERE broker = ? ORDER BY ticker",
      )
      .all(NAME) as { ticker: string; quantity: number; avg_cost: number }[];
    const positions: BrokerPosition[] = posRows.map((r) => ({
      ticker: r.ticker,
      quantity: r.quantity,
      avgCost: r.avg_cost,
    }));
    return { broker: NAME, cashVnd: state.cash_vnd, positions };
  }
}
