import { useEffect } from "react";
import type { StreamEvent } from "../../shared/ipc.js";
import { useChatStore } from "../store/chatStore.js";

const STREAM_FRAME_MS = 1000 / 30;

export function useStreamBridge(): void {
  const apply = useChatStore((s) => s.applyStreamEvent);
  useEffect(() => {
    const pendingDeltas = new Map<string, Extract<StreamEvent, { kind: "turn:block_delta" }>>();
    let timer: number | null = null;
    let lastFlush = 0;

    const flush = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
      if (pendingDeltas.size === 0) return;
      const deltas = Array.from(pendingDeltas.values());
      pendingDeltas.clear();
      lastFlush = performance.now();
      for (const delta of deltas) apply(delta);
    };

    const scheduleFlush = () => {
      if (timer != null) return;
      const elapsed = performance.now() - lastFlush;
      const delay = Math.max(0, STREAM_FRAME_MS - elapsed);
      timer = window.setTimeout(flush, delay);
    };

    const unsubscribe = window.azoth.on((event) => {
      if (event.kind === "turn:block_delta") {
        const key = `${event.turnId}:${event.sessionId}`;
        const pending = pendingDeltas.get(key);
        if (pending) {
          pending.delta += event.delta;
        } else {
          pendingDeltas.set(key, { ...event });
        }
        scheduleFlush();
        return;
      }

      flush();
      apply(event);
    });

    return () => {
      unsubscribe();
      flush();
      if (timer != null) window.clearTimeout(timer);
      pendingDeltas.clear();
    };
  }, [apply]);
}
