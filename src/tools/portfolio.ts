import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb } from "../storage/db.js";
import { getStockOhlcv } from "../data/sources/dnsePublic.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

interface PositionRow {
  ticker: string;
  quantity: number;
  avg_cost: number;
  opened_at: number;
  notes: string | null;
}

async function lastClose(ticker: string): Promise<number | null> {
  const to = Math.floor(Date.now() / 1000);
  const from = to - 14 * 86400;
  const bars = await getStockOhlcv(ticker, "1D", from, to).catch(() => []);
  return bars.length ? bars[bars.length - 1]!.close : null;
}

export const listPositionsTool = tool(
  "portfolio_list",
  "List the user's recorded positions with current price and unrealized P&L. Prices and avg_cost are in thousand VND (e.g. 28.5 = 28,500 VND). Position values are computed from the latest DNSE daily bar.",
  {},
  async () => {
    const db = getDb();
    const rows = db
      .prepare("SELECT ticker, quantity, avg_cost, opened_at, notes FROM positions")
      .all() as PositionRow[];

    const enriched = await Promise.all(
      rows.map(async (r) => {
        const px = await lastClose(r.ticker);
        const market_value = px != null ? px * r.quantity : null;
        const cost_basis = r.avg_cost * r.quantity;
        const unrealized_pnl =
          px != null ? (px - r.avg_cost) * r.quantity : null;
        const unrealized_pnl_pct =
          px != null && r.avg_cost > 0
            ? ((px - r.avg_cost) / r.avg_cost) * 100
            : null;
        return {
          ticker: r.ticker,
          quantity: r.quantity,
          avg_cost: r.avg_cost,
          last_close: px,
          opened_at: new Date(r.opened_at * 1000).toISOString(),
          cost_basis,
          market_value,
          unrealized_pnl,
          unrealized_pnl_pct,
          notes: r.notes,
        };
      }),
    );

    const totals = enriched.reduce(
      (a, p) => {
        a.cost_basis += p.cost_basis;
        if (p.market_value != null) a.market_value += p.market_value;
        if (p.unrealized_pnl != null) a.unrealized_pnl += p.unrealized_pnl;
        return a;
      },
      { cost_basis: 0, market_value: 0, unrealized_pnl: 0 },
    );

    return asText({ positions: enriched, totals });
  },
);

export const recordPositionTool = tool(
  "portfolio_record",
  "Insert or update a position. avg_cost is in thousand VND (e.g. 28.5 means 28,500 VND). Use to seed the portfolio from real holdings or to overwrite after a fill.",
  {
    ticker: z.string(),
    quantity: z.number().int(),
    avg_cost: z.number().positive(),
    notes: z.string().optional(),
  },
  async ({ ticker, quantity, avg_cost, notes }) => {
    const db = getDb();
    const t = ticker.toUpperCase();
    const now = Math.floor(Date.now() / 1000);
    db.prepare(
      `INSERT INTO positions (ticker, quantity, avg_cost, opened_at, notes)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(ticker) DO UPDATE SET
         quantity = excluded.quantity,
         avg_cost = excluded.avg_cost,
         notes    = excluded.notes`,
    ).run(t, quantity, avg_cost, now, notes ?? null);
    return asText({ ok: true, ticker: t, quantity, avg_cost });
  },
);

export const removePositionTool = tool(
  "portfolio_remove",
  "Remove a position from the portfolio (e.g. after a full close).",
  { ticker: z.string() },
  async ({ ticker }) => {
    const db = getDb();
    const t = ticker.toUpperCase();
    const info = db.prepare("DELETE FROM positions WHERE ticker = ?").run(t);
    return asText({ ok: info.changes > 0, ticker: t, removed: info.changes });
  },
);
