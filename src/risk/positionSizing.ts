export interface PositionSizeInput {
  accountEquity: number;
  riskFraction: number;
  entryPrice: number;
  stopPrice: number;
  lotSize?: number;
}

export interface PositionSizeResult {
  shares: number;
  riskAmount: number;
  riskPerShare: number;
}

function validateInput(input: PositionSizeInput): Required<Pick<PositionSizeInput, "lotSize">> {
  if (input.accountEquity <= 0) {
    throw new Error("accountEquity must be greater than 0");
  }

  if (input.riskFraction <= 0 || input.riskFraction > 1) {
    throw new Error("riskFraction must be greater than 0 and less than or equal to 1");
  }

  if (input.entryPrice <= 0) {
    throw new Error("entryPrice must be greater than 0");
  }

  if (input.stopPrice < 0) {
    throw new Error("stopPrice must be greater than or equal to 0");
  }

  if (input.stopPrice >= input.entryPrice) {
    throw new Error("stopPrice must be less than entryPrice");
  }

  const lotSize = input.lotSize ?? 100;
  if (!Number.isInteger(lotSize) || lotSize < 1) {
    throw new Error("lotSize must be an integer greater than or equal to 1");
  }

  return { lotSize };
}

export function calculatePositionSize(input: PositionSizeInput): PositionSizeResult {
  const { lotSize } = validateInput(input);
  const riskAmount = input.accountEquity * input.riskFraction;
  const riskPerShare = input.entryPrice - input.stopPrice;
  const rawShares = riskAmount / riskPerShare;
  const shares = Math.floor(rawShares / lotSize) * lotSize;

  return {
    shares,
    riskAmount,
    riskPerShare,
  };
}
