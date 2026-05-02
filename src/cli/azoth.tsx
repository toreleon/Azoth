#!/usr/bin/env node
import "dotenv/config";
import React from "react";
import { render } from "ink";
import { App } from "../tui/App.js";
import { getDb, closeDb } from "../storage/db.js";
import { loadConfig } from "../config/loader.js";

function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }
  loadConfig();
  getDb();

  const instance = render(<App />);

  const shutdown = () => {
    instance.unmount();
    try { closeDb(); } catch {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  void instance.waitUntilExit().then(() => {
    try { closeDb(); } catch {}
  });
}

main();
