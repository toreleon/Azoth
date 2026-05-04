import { loadConfig } from "../config/loader.js";
import type { Broker, PlaceOrderInput } from "../broker/types.js";
import { currentBrokerName, currentFreezeBuys } from "../agent/clock.js";
import { checkVnMarketSession } from "./vnMarketSession.js";

export interface GuardrailResult {
  ok: boolean;
  reasons: string[];
}

/**
 * Pre-trade checks for order-capable autonomy modes. `confirm` adds a human
 * gate after these checks pass; `advisory` never reaches the broker.
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

  const inBacktest = currentBrokerName() != null;
  const allowed = cfg.risk.ticker_whitelist;
  if (allowed.length > 0 && !allowed.map((t) => t.toUpperCase()).includes(ticker)) {
    reasons.push(`ticker ${ticker} is not in ticker_whitelist`);
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
  if (inBacktest) {
    return { ok: reasons.length === 0, reasons };
  }

  const session = checkVnMarketSession();
  if (!session.open) {
    reasons.push(`market closed (${session.ictTime} ICT: ${session.reason})`);
  }

  return { ok: reasons.length === 0, reasons };
}
