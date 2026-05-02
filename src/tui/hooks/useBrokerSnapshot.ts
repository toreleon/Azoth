import { useCallback, useEffect, useState } from "react";
import { getBroker } from "../../broker/index.js";
import type { BrokerSnapshot } from "../../broker/types.js";

export function useBrokerSnapshot(refreshMs = 5000): {
  snapshot: BrokerSnapshot | null;
  refresh: () => Promise<void>;
  error: Error | null;
} {
  const [snapshot, setSnapshot] = useState<BrokerSnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snap = await getBroker().snapshot();
      setSnapshot((prev) => (snapshotsEqual(prev, snap) ? prev : snap));
      setError(null);
    } catch (e) {
      setError(e as Error);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [refresh, refreshMs]);

  return { snapshot, refresh, error };
}

function snapshotsEqual(a: BrokerSnapshot | null, b: BrokerSnapshot | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.broker !== b.broker || a.cashVnd !== b.cashVnd) return false;
  if (a.positions.length !== b.positions.length) return false;
  for (let i = 0; i < a.positions.length; i++) {
    const p = a.positions[i]!;
    const q = b.positions[i]!;
    if (p.ticker !== q.ticker || p.quantity !== q.quantity || p.avgCost !== q.avgCost) return false;
  }
  return true;
}
