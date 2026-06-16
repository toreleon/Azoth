export function summarizeToolInput(name: string | undefined, input: string | undefined): string {
  if (!input) return "";
  try {
    const obj = JSON.parse(input);
    if (typeof obj !== "object" || obj === null) return String(obj);
    const entries = Object.entries(obj as Record<string, unknown>).slice(0, 4);
    return entries
      .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
      .join(" ");
  } catch {
    return input.slice(0, 80);
  }
}

export function toolLabel(name: string | undefined): string {
  if (!name) return "tool";
  return name.replace(/^mcp__azoth__/, "");
}
