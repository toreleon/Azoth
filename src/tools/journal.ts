import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getDb } from "../storage/db.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

const ACTIONS = ["BUY", "SELL", "HOLD", "WATCH"] as const;

export const journalAppendTool = tool(
  "journal_append",
  "Persist a buy/sell/hold/watch decision with the four-dimension rationale. Always call this when delivering a recommendation so it can be reviewed later.",
  {
    ticker: z.string(),
    action: z.enum(ACTIONS),
    rationale: z
      .string()
      .min(20)
      .describe(
        "Plain-text synthesis citing technical, fundamental, news, and macro evidence. Include the indicator values, ratios, and dates you relied on.",
      ),
    exit_plan: z
      .string()
      .optional()
      .describe(
        "Optional: stop-loss / take-profit / time-based exit thresholds.",
      ),
  },
  async ({ ticker, action, rationale, exit_plan }) => {
    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const info = db
      .prepare(
        `INSERT INTO decisions (created_at, ticker, action, rationale, exit_plan)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(now, ticker.toUpperCase(), action, rationale, exit_plan ?? null);
    return asText({ ok: true, id: info.lastInsertRowid, created_at: now });
  },
);

export const journalReadTool = tool(
  "journal_read",
  "Read recent decisions from the journal. Optionally filter by ticker.",
  {
    ticker: z.string().optional(),
    limit: z.number().int().min(1).max(50).default(10),
  },
  async ({ ticker, limit }) => {
    const db = getDb();
    const rows = ticker
      ? (db
          .prepare(
            `SELECT id, created_at, ticker, action, rationale, exit_plan
             FROM decisions WHERE ticker = ? ORDER BY created_at DESC LIMIT ?`,
          )
          .all(ticker.toUpperCase(), limit) as Record<string, unknown>[])
      : (db
          .prepare(
            `SELECT id, created_at, ticker, action, rationale, exit_plan
             FROM decisions ORDER BY created_at DESC LIMIT ?`,
          )
          .all(limit) as Record<string, unknown>[]);
    const items = rows.map((r) => ({
      ...r,
      created_at: new Date((r.created_at as number) * 1000).toISOString(),
    }));
    return asText({ count: items.length, items });
  },
);
