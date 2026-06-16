import { existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export function resolveClaudeCodeExecutable(): string | undefined {
  const explicit = [
    process.env.AZOTH_CLAUDE_CODE_EXECUTABLE,
    process.env.CLAUDE_CODE_EXECUTABLE,
    process.env.CLAUDE_CODE_PATH,
  ].find((value) => value?.trim());

  if (explicit) return explicit;

  try {
    const sdkCli = require.resolve("@anthropic-ai/claude-agent-sdk/cli.js");
    if (existsSync(sdkCli)) return sdkCli;
  } catch {
    // Fall back to the SDK default; query() will surface a concrete install error.
  }

  return undefined;
}
