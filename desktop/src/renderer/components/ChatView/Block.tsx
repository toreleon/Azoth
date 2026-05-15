import type { ChatRecord } from "../../../shared/ipc.js";
import { MarkdownContent } from "./MarkdownContent.js";
import { ToolChip } from "./ToolChip.js";

export function Block({ record }: { record: ChatRecord }) {
  switch (record.type) {
    case "user":
      return (
        <article className="turn user">
          <div className="bubble">{record.text}</div>
        </article>
      );
    case "assistant":
      return (
        <article className="turn assistant">
          <div className="bubble md">
            <MarkdownContent text={record.text ?? ""} />
          </div>
        </article>
      );
    case "thinking":
      return (
        <article className="turn thinking">
          <div className="label">Reasoning</div>
          {record.text}
        </article>
      );
    case "tool_use":
      return <ToolChip record={record} state="running" />;
    case "tool_result":
      return <ToolChip record={record} state="done" />;
    case "result":
      return null;
    case "error":
      return (
        <article className="turn assistant">
          <div className="error-bubble">{record.text}</div>
        </article>
      );
    case "session_start":
    case "system":
    default:
      return null;
  }
}
