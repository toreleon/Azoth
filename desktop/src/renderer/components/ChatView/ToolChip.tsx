import { useState } from "react";
import type { ChatRecord } from "../../../shared/ipc.js";
import { summarizeToolInput, toolLabel } from "../../lib/toolSummary.js";

interface Props {
  record: ChatRecord;
  state: "running" | "done";
}

export function ToolChip({ record, state }: Props) {
  const [open, setOpen] = useState(false);
  const isResult = record.type === "tool_result";
  const label = isResult ? "result" : toolLabel(record.toolName);
  const summary = isResult ? "" : summarizeToolInput(record.toolName, record.toolInput);
  const body = isResult ? record.text ?? "" : record.toolInput ?? "";

  return (
    <details className="tool-call" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <span className="chev">▸</span>
        <span className="name">{label}</span>
        {summary && <span className="arg">{summary}</span>}
        <span className={state === "running" ? "ok pending" : "ok"}>
          {state === "running" ? "Running" : "Done"}
        </span>
      </summary>
      {open && body && (
        <div className="out">
          {body}
        </div>
      )}
    </details>
  );
}
