import { loadConfig } from "../config/loader.js";
import type { Broker, PlaceOrderInput } from "../broker/types.js";
import { currentBrokerName, currentFreezeBuys } from "../agent/clock.js";

export interface GuardrailResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Pre-trade checks for `auto` autonomy mode. `confirm` mode skips these
 * since the human is the final gate; `advisory` never reaches the broker.
 */
export async function checkOrder(
  broker: Broker,
  input: PlaceOrderInput,
  refPriceVnd: number,
): Promise<GuardrailResult> {
  const cfg = loadConfig();
  const reasons: string[] = [];
  const ticker = input.ticker.toUpperCase();
  const notionalVnd = refPriceVnd * input.quantity * 1000;

  if (notionalVnd > cfg.risk.max_order_notional_vnd) {
    reasons.push(
      `order notional ${(notionalVnd / 1e6).toFixed(1)}M VND exceeds max ${(cfg.risk.max_order_notional_vnd / 1e6).toFixed(1)}M VND`,
    );
  }

  const allowed =
    cfg.risk.ticker_whitelist.length > 0
      ? cfg.risk.ticker_whitelist
      : cfg.watchlist;
  if (!allowed.map((t) => t.toUpperCase()).includes(ticker)) {
    reasons.push(`ticker ${ticker} is not in watchlist/whitelist`);
  }

  if (input.side === "BUY" && currentFreezeBuys()) {
    reasons.push("drawdown circuit breaker active: BUY orders are frozen this turn");
  }

  if (input.side === "BUY") {
    const snapshot = await broker.snapshot();
    const portfolioValue =
      snapshot.cashVnd +
      snapshot.positions.reduce(
        (sum, p) => sum + p.avgCost * p.quantity * 1000,
        0,
      );
    const existing = snapshot.positions.find((p) => p.ticker === ticker);
    const projectedVnd =
      ((existing?.quantity ?? 0) + input.quantity) * refPriceVnd * 1000;
    const projectedPct = portfolioValue > 0 ? projectedVnd / portfolioValue : 1;
    if (projectedPct > cfg.risk.max_position_pct) {
      reasons.push(
        `projected ${ticker} position ${(projectedPct * 100).toFixed(1)}% would exceed max_position_pct ${(cfg.risk.max_position_pct * 100).toFixed(1)}%`,
      );
    }
  }

  // Backtest mode (per-run broker pinned via ALS): skip wall-clock checks.
  // The harness only fires on simulated Friday closes, which by definition
  // sit outside live trading hours of the real wall clock.
  if (currentBrokerName()) {
    return { ok: reasons.length === 0, reasons };
  }

  // Vietnamese market hours: Mon–Fri, 09:00–15:00 ICT (UTC+7).
  const now = new Date();
  const ict = new Date(now.getTime() + 7 * 3600 * 1000);
  const day = ict.getUTCDay();
  const hour = ict.getUTCHours();
  const minute = ict.getUTCMinutes();
  const minsSinceMidnight = hour * 60 + minute;
  const open = day >= 1 && day <= 5 && minsSinceMidnight >= 9 * 60 && minsSinceMidnight <= 15 * 60;
  if (!open) {
    reasons.push(
      `market closed (Vietnam time ${ict.toISOString().replace("T", " ").slice(0, 16)} ICT, weekday=${day})`,
    );
  }

  return { ok: reasons.length === 0, reasons };
}
