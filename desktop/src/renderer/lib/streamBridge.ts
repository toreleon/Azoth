import { useEffect } from "react";
import { useChatStore } from "../store/chatStore.js";

export function useStreamBridge(): void {
  const apply = useChatStore((s) => s.applyStreamEvent);
  useEffect(() => {
    return window.azoth.on((event) => {
      apply(event);
    });
  }, [apply]);
}
