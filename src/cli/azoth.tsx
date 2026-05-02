#!/usr/bin/env node
import "../runtime/bootstrap.js";
import React from "react";
import { render } from "ink";
import { App } from "../tui/App.js";
import { getDb, closeDb } from "../storage/db.js";
import { loadConfig } from "../config/loader.js";

function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy ~/.azoth/.env.example to ~/.azoth/.env and fill it in.");
    process.exit(1);
  }
  loadConfig();
  getDb();

  // Enter the terminal's alternate screen buffer. Ink's log-update can't do
  // in-place line patching when its dynamic frame exceeds the visible rows
  // (it ends up re-clearing/re-emitting the frame, which the user sees as
  // flicker). The alt buffer gives Ink a clean fixed canvas + clears
  // scrollback on exit so the user's prior shell history is preserved.
  const enteredAlt = process.stdout.isTTY;
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
