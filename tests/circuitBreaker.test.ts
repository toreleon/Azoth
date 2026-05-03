import { describe, expect, it } from "vitest";
import { asOfClock, currentBrokerName, currentFreezeBuys, setActiveAsOf } from "../src/agent/clock.js";

describe("MDD circuit breaker flag", () => {
  it("returns false by default", () => {
    setActiveAsOf(null);
    expect(currentFreezeBuys()).toBe(false);
  });

  it("respects the module-level override", () => {
    setActiveAsOf({ asOfSec: 1, brokerName: "paper-bt-x", freezeBuys: true });
    try {
      expect(currentFreezeBuys()).toBe(true);
      expect(currentBrokerName()).toBe("paper-bt-x");
    } finally {
      setActiveAsOf(null);
    }
  });

  it("respects the AsyncLocalStorage store when no override is set", () => {
    setActiveAsOf(null);
    asOfClock.run({ asOfSec: 1, brokerName: "paper-bt-y", freezeBuys: true }, () => {
      expect(currentFreezeBuys()).toBe(true);
    });
    expect(currentFreezeBuys()).toBe(false);
  });
});
