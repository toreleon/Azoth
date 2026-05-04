import * as readline from "node:readline/promises";
import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { getBroker } from "../broker/index.js";
import { loadConfig } from "../config/loader.js";
import { checkOrder } from "../risk/guardrails.js";
import { getStockOhlcv } from "../data/sources/dnsePublic.js";
import type { OrderStatus, PlaceOrderInput } from "../broker/types.js";
import { nowSec, currentBrokerName } from "../agent/clock.js";

function asText(obj: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(obj) }] };
}

async function lastClose(ticker: string): Promise<number | null> {
  const to = nowSec();
  const from = to - 14 * 86400;
  const bars = await getStockOhlcv(ticker, "1D", from, to).catch(() => []);
  return bars.length ? bars[bars.length - 1]!.close : null;
}

async function confirmOnCli(prompt: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  try {
    const ans = (await rl.question(prompt)).trim().toLowerCase();
    return ans === "y" || ans === "yes";
  } finally {
    rl.close();
  }
}

export const placeOrderTool = tool(
  "place_order",
  "Place a paper or live broker order. Quantity must be a multiple of 100 (HOSE lot). limit_price is in thousand VND (e.g. 28.5 = 28,500 VND). In 'confirm' autonomy the user is prompted in the CLI before submission; in 'auto' the order is run through risk guardrails and then submitted. Always call journal_append after a successful fill to record the rationale.",
  {
    ticker: z.string(),
    side: z.enum(["BUY", "SELL"]),
    type: z.enum(["MARKET", "LIMIT"]).default("MARKET"),
    quantity: z.number().int().positive(),
    limit_price: z.number().positive().optional(),
    notes: z.string().optional(),
  },
  async ({ ticker, side, type, quantity, limit_price, notes }) => {
    const cfg = loadConfig();
    const inBacktest = currentBrokerName() != null;
    if (!inBacktest && cfg.autonomy === "advisory") {
      return asText({
        ok: false,
        error: "autonomy=advisory; place_order is disabled. Recommend manually instead.",
      });
    }

    const broker = getBroker();
    const input: PlaceOrderInput = {
      ticker: ticker.toUpperCase(),
      side,
      type,
      quantity,
      limitPrice: limit_price,
      notes,
    };

    const refPrice = (await lastClose(input.ticker)) ?? input.limitPrice ?? null;

    if (inBacktest || cfg.autonomy === "auto" || cfg.autonomy === "confirm") {
      if (refPrice == null) {
        return asText({ ok: false, error: `no reference price for ${input.ticker}` });
      }
      const guard = await checkOrder(broker, input, refPrice);
      if (!guard.ok) {
        const reason = `guardrail_blocked: ${guard.reasons.join("; ")}`;
        const order =
          inBacktest && broker.recordRejectedOrder
            ? await broker.recordRejectedOrder(input, reason)
            : undefined;
        return asText({
          ok: false,
          error: "guardrail_blocked",
          reasons: guard.reasons,
          ...(order ? { order } : {}),
        });
      }
    }

    if (!inBacktest && cfg.autonomy === "confirm") {
      const px =
        refPrice != null ? `${refPrice} (last close)` : "(price unavailable)";
      const ok = await confirmOnCli(
        `\n  >> ${side} ${quantity} ${input.ticker} ${type}` +
          (limit_price ? ` @ ${limit_price}` : "") +
          `  ref=${px}` +
          `\n  proceed? [y/N]: `,
      );
      if (!ok) {
        return asText({ ok: false, error: "user_declined" });
      }
    }

    const order = await broker.placeOrder(input);
    return asText({
      ok: order.status === "FILLED" || order.status === "PENDING",
      order,
    });
  },
);

export const cancelOrderTool = tool(
  "cancel_order",
  "Cancel a pending broker order by id.",
  { id: z.string() },
  async ({ id }) => {
    const broker = getBroker();
    const order = await broker.cancelOrder(id);
    return asText({ ok: order.status === "CANCELLED", order });
  },
);

export const listOrdersTool = tool(
  "list_orders",
  "List recent broker orders (paper or live), optionally filtered by ticker or status.",
  {
    ticker: z.string().optional(),
    status: z.enum(["PENDING", "FILLED", "CANCELLED", "REJECTED"]).optional(),
    limit: z.number().int().min(1).max(200).default(20),
  },
  async ({ ticker, status, limit }) => {
    const broker = getBroker();
    const orders = await broker.listOrders({
      ticker,
      status: status as OrderStatus | undefined,
      limit,
    });
    return asText({ count: orders.length, orders });
  },
);

export const brokerStateTool = tool(
  "broker_state",
  "Get the broker's current cash + open positions (paper or live).",
  {},
  async () => {
    const broker = getBroker();
    const snap = await broker.snapshot();
    return asText(snap);
  },
);
