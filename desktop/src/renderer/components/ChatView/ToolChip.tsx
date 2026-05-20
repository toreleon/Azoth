import { useState } from "react";
import type { ChatRecord } from "../../../shared/ipc.js";
import { AlertIcon, CheckIcon, ChevronDownIcon, ListIcon } from "../Icon.js";
import { summarizeToolInput, toolLabel } from "../../lib/toolSummary.js";

const MAX_BODY_LINES = 8;
const MAX_ARRAY_ITEMS = 8;
const MAX_OBJECT_ENTRIES = 6;
const MAX_VALUE_CHARS = 420;
const MAX_LINE_CHARS = 720;

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
  const isError = isToolError(body);
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

function isToolError(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      if (obj.ok === false) return true;
      if (typeof obj.error === "string" && obj.error.trim()) return true;
      if (typeof obj.message === "string" && isErrorText(obj.message)) return true;
      const status = Number(obj.status ?? obj.statusCode ?? obj.code);
      if (Number.isFinite(status) && status >= 400) return true;
    }
    return false;
  } catch {
    return isErrorText(trimmed);
  }
}

function isErrorText(text: string): boolean {
  return (
    /\b(error|failed|exception|unauthorized|forbidden|invalid)\b/i.test(text) ||
    /\bno\s+json\s+object\s+found\b/i.test(text) ||
    /\bHTTP\s*(4\d\d|5\d\d)\b/i.test(text) ||
    /\b(status|statusCode|code)\s*[:=]\s*(4\d\d|5\d\d)\b/i.test(text)
  );
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
          .slice(0, MAX_BODY_LINES)
          .map(([key, value]) => ({
            tool: label,
            text: truncateText(`${key}=${formatValue(value)}`, MAX_LINE_CHARS),
            error: isError,
          }));
      }
      if (Array.isArray(parsed)) {
        return parsed.slice(0, MAX_BODY_LINES).map((item, idx) => ({
          tool: label,
          text: truncateText(`${idx + 1}. ${formatValue(item)}`, MAX_LINE_CHARS),
          error: isError,
        }));
      }
    } catch {
      // Fall through to plain text lines.
    }
  }
  return trimmed
    .split(/\n+/)
    .slice(0, MAX_BODY_LINES)
    .map((line) => ({ tool: label, text: truncateText(line.trim(), MAX_LINE_CHARS), error: isError }));
}

function formatValue(value: unknown, depth = 0): string {
  if (typeof value === "string") return truncateText(value, MAX_VALUE_CHARS);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value == null) return "null";
  if (depth >= 2) return truncateText(JSON.stringify(value), MAX_VALUE_CHARS);
  if (Array.isArray(value)) {
    const visible = value.slice(0, MAX_ARRAY_ITEMS).map((item) => formatValue(item, depth + 1));
    const suffix = value.length > MAX_ARRAY_ITEMS ? `, ... +${value.length - MAX_ARRAY_ITEMS}` : "";
    return `[${visible.join(", ")}${suffix}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  const visible = entries
    .slice(0, MAX_OBJECT_ENTRIES)
    .map(([key, entryValue]) => `${key}=${formatValue(entryValue, depth + 1)}`);
  const suffix = entries.length > MAX_OBJECT_ENTRIES ? ` · ... +${entries.length - MAX_OBJECT_ENTRIES}` : "";
  return `${visible.join(" · ")}${suffix}`;
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const visibleLength = Math.max(0, max - 24);
  return `${text.slice(0, visibleLength).trimEnd()} ... (${text.length - visibleLength} more chars)`;
}

function ToolIcon({ state }: { state: "running" | "done" | "error" }) {
  if (state === "error") {
    return <AlertIcon className="ticon" />;
  }
  if (state === "running") {
    return <ListIcon className="ticon" />;
  }
  return <CheckIcon className="ticon" />;
}

function ChevronIcon() {
  return <ChevronDownIcon className="chev" />;
}
