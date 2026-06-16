import { nowSec } from "@azoth/core/agent/clock.js";
import { getBroker } from "@azoth/core/broker/index.js";
import type { Order, PlaceOrderInput } from "@azoth/core/broker/types.js";
import { getStockOhlcv, type Bar } from "@azoth/core/data/sources/dnsePublic.js";
import { placeOrderWithGuards } from "@azoth/core/tools/order.js";
import { shapeBrokerPortfolio } from "@azoth/core/tools/portfolio.js";
import {
  PortfolioCancelOrderReq,
  PortfolioHistoryReq,
  PortfolioOrdersReq,
  PortfolioPlaceOrderReq,
  type BrokerOrderUi,
  type PortfolioHistoryRes,
  type PortfolioPlaceOrderRes,
  type PortfolioSnapshot,
} from "../../shared/ipc.js";
import type { IpcRegister } from "./register.js";

async function lastCloseThousandVnd(ticker: string): Promise<number | null> {
  const to = nowSec();
  const from = to - 14 * 86400;
  const bars = await getStockOhlcv(ticker, "1D", from, to).catch(() => [] as Bar[]);
  return bars.length ? bars[bars.length - 1]!.close : null;
}

function toOrderUi(o: Order): BrokerOrderUi {
  return {
    id: o.id,
    broker: o.broker,
    ticker: o.ticker,
    side: o.side,
    type: o.type,
    quantity: o.quantity,
    limitPrice: o.limitPrice,
    status: o.status,
    rejectReason: o.rejectReason,
    createdAt: o.createdAt,
    filledAt: o.filledAt,
    filledPrice: o.filledPrice,
    filledQty: o.filledQty,
    notes: o.notes,
  };
}


export function registerPortfolioHandlers(register: IpcRegister): void {
  register("portfolio:snapshot", async () => {
    const broker = getBroker();
    const snap = await broker.snapshot();
    const shaped = await shapeBrokerPortfolio(snap, lastCloseThousandVnd);
    return shaped as unknown as PortfolioSnapshot;
  });

  register("portfolio:orders", async (raw) => {
    const req = PortfolioOrdersReq.parse(raw);
    const broker = getBroker();
    const orders = await broker.listOrders({
      ticker: req?.ticker,
      status: req?.status,
      limit: req?.limit ?? 50,
    });
    return { orders: orders.map(toOrderUi) };
  });

  register("portfolio:history", async (raw) => {
    const req = PortfolioHistoryReq.parse(raw);
    const broker = getBroker();
    if (!broker.accountHistory) {
      const res: PortfolioHistoryRes = {
        supported: false,
        broker: broker.name,
        reason: `Broker "${broker.name}" does not support account history.`,
      };
      return res;
    }
    const history = await broker.accountHistory({
      fromDate: req.fromDate,
      toDate: req.toDate,
      ticker: req.ticker?.toUpperCase(),
      limit: req.limit,
    });
    const kind = req.kind;
    const filtered = {
      orders: kind === "all" || kind === "orders" ? history.orders : [],
      fills: kind === "all" || kind === "orders" || kind === "fills" ? history.fills : [],
      transactions: kind === "all" || kind === "transactions" ? history.transactions : [],
      rights: kind === "all" || kind === "rights" ? history.rights : [],
    };
    const res: PortfolioHistoryRes = {
      supported: true,
      broker: history.broker,
      fromDate: history.fromDate,
      toDate: history.toDate,
      subAccounts: history.subAccounts,
      ...filtered,
      unavailable: history.unavailable,
    };
    return res;
  });

  register("portfolio:placeOrder", async (raw) => {
    const req = PortfolioPlaceOrderReq.parse(raw);
    const input: PlaceOrderInput = {
      ticker: req.ticker.toUpperCase(),
      side: req.side,
      type: req.type,
      quantity: req.quantity,
      limitPrice: req.limitPrice,
      notes: req.notes,
    };
    try {
      const result = await placeOrderWithGuards(input);
      if (!result.ok) {
        const res: PortfolioPlaceOrderRes =
          result.error === "no_reference_price"
            ? {
                ok: false,
                error: "no_reference_price",
                message: `No reference price available for ${result.ticker}.`,
              }
            : {
                ok: false,
                error: "guardrail_blocked",
                reasons: result.reasons,
                order: result.order ? toOrderUi(result.order) : undefined,
              };
        return res;
      }
      const okRes: PortfolioPlaceOrderRes = { ok: true, order: toOrderUi(result.order) };
      return okRes;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const res: PortfolioPlaceOrderRes = { ok: false, error: "broker_error", message };
      return res;
    }
  });

  register("portfolio:cancelOrder", async (raw) => {
    const req = PortfolioCancelOrderReq.parse(raw);
    const broker = getBroker();
    const order = await broker.cancelOrder(req.id);
    return { ok: order.status === "CANCELLED", order: toOrderUi(order) };
  });


}
