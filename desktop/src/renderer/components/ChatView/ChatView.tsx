import { useEffect, useRef } from "react";
import { useChatStore } from "../../store/chatStore.js";
import { Block } from "./Block.js";

interface Props {
  sessionId: string;
}

export function ChatView({ sessionId }: Props) {
  const records = useChatStore((s) => s.recordsBySession[sessionId] ?? []);
  const liveRecords = useChatStore((s) => s.liveRecordsBySession[sessionId] ?? []);
  const isStreaming = useChatStore((s) => Boolean(s.activeTurnsBySession[sessionId]));
  const scrollRef = useRef<HTMLElement>(null);
  const liveTextSize = liveRecords.reduce(
    (sum, record) => sum + (record.text?.length ?? 0) + (record.toolInput?.length ?? 0),
    0,
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [records.length, liveRecords.length, liveTextSize]);

  return (
    <section ref={scrollRef} className="thread" id="thread">
      {records.map((record, idx) => (
        <Block key={`${record.timestamp}-${idx}`} record={record} />
      ))}
      {liveRecords.map((record, idx) => (
        <Block key={`live-${record.timestamp}-${idx}`} record={record} />
      ))}
      {isStreaming && liveRecords.length === 0 && (
        <article className="turn thinking">
          <div className="label">Reasoning</div>
          Thinking...
        </article>
      )}
    </section>
  );
}
