import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getBroker } from "../broker/index.js";
import type { BrokerAccountHistory } from "../broker/types.js";
import { currentBrokerName } from "../agent/clock.js";
import { requireBrokerConsent } from "./brokerConsent.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

type HistoryKind = "all" | "orders" | "fills" | "transactions" | "rights";

function filterHistory(history: BrokerAccountHistory, kind: HistoryKind): BrokerAccountHistory {
  if (kind === "all") return history;
  return {
    ...history,
    orders: kind === "orders" ? history.orders : [],
    fills: kind === "orders" || kind === "fills" ? history.fills : [],
    transactions: kind === "transactions" ? history.transactions : [],
    rights: kind === "rights" ? history.rights : [],
  };
}

export const accountHistoryTool = tool(
  "account_history",
  "Read-only broker account history: past orders/fills, cash transaction log, and dividend/rights issue events. In manual mode, the user is prompted before the tool runs. Dates are YYYY-MM-DD; default range is the last 365 days.",
  {
    kind: z.enum(["all", "orders", "fills", "transactions", "rights"]).default("all"),
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ticker: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(100),
  },
  async ({ kind, from_date, to_date, ticker, limit }) => {
    const selectedKind = (kind ?? "all") as HistoryKind;
    if (currentBrokerName() == null) {
      const detail = [
        `kind=${selectedKind}`,
        from_date ? `from=${from_date}` : "",
        to_date ? `to=${to_date}` : "",
        ticker ? `ticker=${ticker.toUpperCase()}` : "",
        `limit=${limit ?? 100}`,
      ].filter(Boolean).join(" ");
      const ok = await requireBrokerConsent(
        "account_history",
        `read broker account history ${detail}`,
      );
      if (!ok) return asText({ ok: false, error: "user_declined" });
    }

    const broker = getBroker();
    if (!broker.accountHistory) {
      return asText({
        ok: false,
        error: `broker ${broker.name} does not support account_history`,
      });
    }
    const history = await broker.accountHistory({
      fromDate: from_date,
      toDate: to_date,
      ticker: ticker?.toUpperCase(),
      limit,
    });
    const filtered = filterHistory(history, selectedKind);
    return asText({
      ok: true,
      counts: {
        orders: filtered.orders.length,
        fills: filtered.fills.length,
        transactions: filtered.transactions.length,
        rights: filtered.rights.length,
        unavailable: filtered.unavailable?.length ?? 0,
      },
      ...filtered,
    });
  },
);
