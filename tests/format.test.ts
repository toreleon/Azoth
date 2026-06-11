import { describe, it, expect } from 'vitest';
import { formatTokens } from '../src/tui/lib/format';

describe('formatTokens', () => {
  it('returns "0" for null', () => {
    expect(formatTokens(null)).toBe('0');
  });

  it('returns "0" for undefined', () => {
    expect(formatTokens(undefined)).toBe('0');
  });

  it('formats values less than 1000 as strings without k suffix', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(5)).toBe('5');
    expect(formatTokens(999)).toBe('999');
    expect(formatTokens(999.9)).toBe('999.9');
  });

  it('formats values greater than or equal to 1000 with a k suffix', () => {
    expect(formatTokens(1000)).toBe('1.0k');
    expect(formatTokens(1500)).toBe('1.5k');
    expect(formatTokens(1550)).toBe('1.6k'); // toFixed(1) rounds
    expect(formatTokens(10000)).toBe('10.0k');
    expect(formatTokens(1234567)).toBe('1234.6k');
  });
});
