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
  const label = toolLabel(record.toolName);
  const summary = summarizeToolInput(record.toolName, record.toolInput);
  const resultBody = record.text ?? "";
  const body = resultBody || (isResult ? record.text ?? "" : record.toolInput ?? "");
  const isError = /error|unauthorized|failed|exception|401|403|500/i.test(body);
  const className = [
    "tool-call",
    state === "running" ? "is-running" : "",
    isError ? "is-error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <details className={className} open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        <ToolIcon state={isError ? "error" : state} />
        <span>{summaryText({ isResult, isError, state, label, summary })}</span>
        {body ? <ChevronIcon /> : null}
      </summary>
      {open && body && (
        <div className="body">
          {bodyLines({ body, label, isError }).map((line, idx) => (
            <div key={idx} className={line.error ? "err" : undefined}>
              {line.tool ? <code>{line.tool}</code> : null}
              {line.tool ? " · " : null}
              {line.text}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function summaryText({
  isResult,
  isError,
  state,
  label,
  summary,
}: {
  isResult: boolean;
  isError: boolean;
  state: "running" | "done";
  label: string;
  summary: string;
}): string {
  if (isError) return `${humanizeTool(label)} failed`;
  if (state === "running") return humanizeTool(label);
  if (isResult) return humanizeTool(label);
  return summary ? `${humanizeTool(label)} ${summary}` : humanizeTool(label);
}

function humanizeTool(label: string): string {
  return label
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function bodyLines({
  body,
  label,
  isError,
}: {
  body: string;
  label: string;
  isError: boolean;
}): Array<{ tool?: string; text: string; error?: boolean }> {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.entries(parsed as Record<string, unknown>)
          .slice(0, 6)
          .map(([key, value]) => ({
            tool: label,
            text: `${key}=${formatValue(value)}`,
            error: isError,
          }));
      }
      if (Array.isArray(parsed)) {
        return parsed.slice(0, 6).map((item, idx) => ({
          tool: label,
          text: `${idx + 1}. ${formatValue(item)}`,
          error: isError,
        }));
      }
    } catch {
      // Fall through to plain text lines.
    }
  }
  return trimmed
    .split(/\n+/)
    .slice(0, 6)
    .map((line) => ({ tool: label, text: line.trim(), error: isError }));
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "null";
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 5)
    .map(([key, entryValue]) => `${key}=${formatValue(entryValue)}`)
    .join(" · ");
}

function ToolIcon({ state }: { state: "running" | "done" | "error" }) {
  if (state === "error") {
    return (
      <svg className="ticon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="7" r="5.2" />
        <path d="M7 4.5v3M7 9.5v.01" />
      </svg>
    );
  }
  if (state === "running") {
    return (
      <svg className="ticon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 3.5h9M2.5 7h9M2.5 10.5h6" />
      </svg>
    );
  }
  return (
    <svg className="ticon" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 10.5 5.5 7l2.5 2.5L12 4" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="chev" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m2 3.5 3 3 3-3" />
    </svg>
  );
}
