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
      setSnapshot(snap);
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
