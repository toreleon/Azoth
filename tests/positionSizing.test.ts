import { describe, expect, it } from 'vitest';
import { calculatePositionSize } from '../src/risk/positionSizing.js';

describe('calculatePositionSize', () => {
  it('computes the worked example and rounds to the HOSE lot size', () => {
    const result = calculatePositionSize({
      accountEquity: 100_000_000,
      riskFraction: 0.01,
      entryPrice: 30_000,
      stopPrice: 28_000,
    });

    expect(result).toEqual({
      shares: 500,
      riskAmount: 1_000_000,
      riskPerShare: 2_000,
    });
  });

  it('floors down to the nearest 100-share lot when raw shares are not a multiple of 100', () => {
    const result = calculatePositionSize({
      accountEquity: 10_000_000,
      riskFraction: 0.0599,
      entryPrice: 10_000,
      stopPrice: 9_000,
    });

    expect(result).toEqual({
      shares: 500,
      riskAmount: 599_000,
      riskPerShare: 1_000,
    });
  });

  it('rounds down to 0 shares when the risk budget does not cover one lot', () => {
    const result = calculatePositionSize({
      accountEquity: 100_000,
      riskFraction: 0.25,
      entryPrice: 10_000,
      stopPrice: 9_700,
    });

    expect(result).toEqual({
      shares: 0,
      riskAmount: 25_000,
      riskPerShare: 300,
    });
  });

  it('rejects non-positive account equity', () => {
    expect(() =>
      calculatePositionSize({
        accountEquity: 0,
        riskFraction: 0.01,
        entryPrice: 30_000,
        stopPrice: 28_000,
      }),
    ).toThrow('accountEquity must be greater than 0');
  });

  it('rejects riskFraction values at or below 0', () => {
    expect(() =>
      calculatePositionSize({
        accountEquity: 100_000_000,
        riskFraction: 0,
        entryPrice: 30_000,
        stopPrice: 28_000,
      }),
    ).toThrow('riskFraction must be greater than 0 and less than or equal to 1');
  });

  it('rejects riskFraction values greater than 1', () => {
    expect(() =>
      calculatePositionSize({
        accountEquity: 100_000_000,
        riskFraction: 1.1,
        entryPrice: 30_000,
        stopPrice: 28_000,
      }),
    ).toThrow('riskFraction must be greater than 0 and less than or equal to 1');
  });

  it('rejects non-positive entry prices', () => {
    expect(() =>
      calculatePositionSize({
        accountEquity: 100_000_000,
        riskFraction: 0.01,
        entryPrice: 0,
        stopPrice: 28_000,
      }),
    ).toThrow('entryPrice must be greater than 0');
  });

  it('rejects negative stop prices', () => {
    expect(() =>
      calculatePositionSize({
        accountEquity: 100_000_000,
        riskFraction: 0.01,
        entryPrice: 30_000,
        stopPrice: -1,
      }),
    ).toThrow('stopPrice must be greater than or equal to 0');
  });

  it('rejects stop prices that are at or above the entry price', () => {
    expect(() =>
      calculatePositionSize({
        accountEquity: 100_000_000,
        riskFraction: 0.01,
        entryPrice: 30_000,
        stopPrice: 30_000,
      }),
    ).toThrow('stopPrice must be less than entryPrice');
  });

  it('rejects invalid lot sizes', () => {
    expect(() =>
      calculatePositionSize({
        accountEquity: 100_000_000,
        riskFraction: 0.01,
        entryPrice: 30_000,
        stopPrice: 28_000,
        lotSize: 0,
      }),
    ).toThrow('lotSize must be an integer greater than or equal to 1');

    expect(() =>
      calculatePositionSize({
        accountEquity: 100_000_000,
        riskFraction: 0.01,
        entryPrice: 30_000,
        stopPrice: 28_000,
        lotSize: 1.5,
      }),
    ).toThrow('lotSize must be an integer greater than or equal to 1');
  });
});
