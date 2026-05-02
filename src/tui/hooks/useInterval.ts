import { useEffect, useRef } from "react";

export function useInterval(cb: () => void, delayMs: number | null): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (delayMs == null) return;
    const id = setInterval(() => ref.current(), delayMs);
    return () => clearInterval(id);
  }, [delayMs]);
}
