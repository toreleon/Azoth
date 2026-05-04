#!/usr/bin/env node
import "../runtime/bootstrap.js";
import { render } from "ink";
import { App } from "../tui/App.js";
import { getDb, closeDb } from "../storage/db.js";
import { loadConfig } from "../config/loader.js";
import { azothPaths } from "../runtime/paths.js";

function printInitResult() {
  getDb();
  closeDb();
  const paths = azothPaths();
  console.log(`Azoth runtime initialized at ${paths.home}`);
  console.log(`Config: ${paths.config}`);
  console.log(`Database: ${process.env.VNSTOCK_DB ?? paths.db}`);
}

function main() {
  const command = process.argv[2];
  if (command === "init" || command === "--init") {
    printInitResult();
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy ~/.azoth/.env.example to ~/.azoth/.env and fill it in.");
    process.exit(1);
  }
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
