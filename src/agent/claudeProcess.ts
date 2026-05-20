import { spawn } from "node:child_process";
import type { SpawnOptions, SpawnedProcess } from "@anthropic-ai/claude-agent-sdk";

export function spawnTrackedClaudeCodeProcess(options: SpawnOptions): SpawnedProcess {
  const child = spawn(options.command, options.args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "ignore"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  let killTimer: NodeJS.Timeout | undefined;

  const killProcess = (signal: NodeJS.Signals): boolean => {
    if (child.exitCode !== null || child.killed) return true;
    try {
      if (process.platform !== "win32" && child.pid) {
        process.kill(-child.pid, signal);
        return true;
      }
    } catch {
      // Fall back to killing the direct child below.
    }
    return child.kill(signal);
  };

  const abort = () => {
    killProcess("SIGTERM");
    killTimer = setTimeout(() => killProcess("SIGKILL"), 1500);
    killTimer.unref();
  };

  if (options.signal.aborted) abort();
  else options.signal.addEventListener("abort", abort, { once: true });

  child.once("exit", () => {
    if (killTimer) clearTimeout(killTimer);
    options.signal.removeEventListener("abort", abort);
  });

  return {
    stdin: child.stdin,
    stdout: child.stdout,
    get killed() {
      return child.killed;
    },
    get exitCode() {
      return child.exitCode;
    },
    kill: killProcess,
    on: child.on.bind(child),
    once: child.once.bind(child),
    off: child.off.bind(child),
  };
}
