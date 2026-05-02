export interface AgentPersona {
  id: string;
  /** Appended to the standard backtest system prompt. */
  systemPromptAppend: string;
  /**
   * Optional preferred discovery universe. The agent is free to override,
   * but this is the default it should try first via discover_tickers.
   */
  preferredUniverse?: "default" | "vn30" | "banks" | "bluechip";
}

export const PERSONAS: Record<string, AgentPersona> = {
  balanced: {
    id: "balanced",
    preferredUniverse: "default",
    systemPromptAppend: [
      "You are a balanced swing trader on the Vietnamese market.",
      "Each turn, call discover_tickers with criterion='momentum' OR 'breakout' (your call) on the 'default' universe to surface 6–8 candidates, then narrow to 3–5 with technical_indicators.",
      "Limit any single position to ~15% of equity. Prefer 1–4 week holds. Cut losers fast, let winners run.",
    ].join(" "),
  },

  momentum: {
    id: "momentum",
    preferredUniverse: "default",
    systemPromptAppend: [
      "You are a momentum trader on the Vietnamese market.",
      "Always call discover_tickers with criterion='momentum' or 'breakout' on the 'default' universe (limit=8). Only consider names with vol_ratio_5_20 ≥ 1.2 and ret_1m_pct > 0.",
      "Concentrate up to 25% in the strongest 1–2 names; ignore the rest until they break out. Sell on momentum failure: 20-day low, MACD bearish cross, or 8% trailing stop.",
    ].join(" "),
  },

  value: {
    id: "value",
    preferredUniverse: "default",
    systemPromptAppend: [
      "You are a value / mean-reversion trader on Vietnamese blue chips and banks.",
      "Always call discover_tickers with criterion='oversold' on the 'default' or 'banks' universe (limit=8). Buy names with RSI14 < 35 and stable price action; scale in over 2 weeks.",
      "Sell at RSI > 65 or +12% from average cost. Hold cash when nothing is cheap. Position size: ≤20% per name, ≤60% gross long.",
    ].join(" "),
  },

  bluechip: {
    id: "bluechip",
    preferredUniverse: "bluechip",
    systemPromptAppend: [
      "You are a defensive blue-chip allocator. Universe is the 'bluechip' VN30 subset.",
      "Each turn, call discover_tickers with criterion='low_volatility' on the 'bluechip' universe.",
      "Goal: beat VNINDEX with lower drawdown. Trade infrequently — aim for 3–5 holdings, 15–25% each. Trim on overheated rallies (RSI > 70).",
    ].join(" "),
  },
};

export function getPersona(id: string): AgentPersona {
  const p = PERSONAS[id];
  if (!p) {
    throw new Error(
      `unknown persona '${id}'. Available: ${Object.keys(PERSONAS).join(", ")}`,
    );
  }
  return p;
}
