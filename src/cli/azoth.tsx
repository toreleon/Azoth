#!/usr/bin/env node
import { render } from "ink";
import { App } from "../tui/App.js";
import { getDb, closeDb } from "../storage/db.js";
import { loadConfig } from "../config/loader.js";
import { initializeAzothRuntime } from "../runtime/init.js";
import { packageVersion } from "../runtime/version.js";
import { isVersionCommand } from "./args.js";

function sanitizeRuntimeEnv() {
  for (const key of ["AZOTH_DB", "AZOTH_CONFIG", "AZOTH_HOME"] as const) {
    if (process.env[key]?.trim() === "") delete process.env[key];
  }
}

function printVersion() {
  console.log(`azoth ${packageVersion()}`);
}

function main() {
  const args = process.argv.slice(2);
  if (isVersionCommand(args)) {
    printVersion();
    return;
  }

  sanitizeRuntimeEnv();
  initializeAzothRuntime();
  loadConfig();
  getDb();

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Azoth TUI requires an interactive terminal (TTY). Run it from a normal shell session.");
    process.exit(1);
  }

  // Keep the app in the main screen buffer by default so Ink's <Static>
  // history is available in normal terminal scrollback. The alternate screen
  // can still be useful for demos or constrained terminals, but it hides old
  // messages from the user's scrollback in many terminal emulators.
  const enteredAlt = process.stdout.isTTY && process.env.AZOTH_ALT_SCREEN === "1";
  if (enteredAlt) process.stdout.write("\x1b[?1049h\x1b[H");

  const exitAlt = () => {
    if (enteredAlt) process.stdout.write("\x1b[?1049l");
  };

  const instance = render(<App />, { exitOnCtrlC: true });

  const shutdown = () => {
    instance.unmount();
    try { closeDb(); } catch {}
    exitAlt();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  void instance.waitUntilExit().then(() => {
    try { closeDb(); } catch {}
    exitAlt();
  });
}

main();
