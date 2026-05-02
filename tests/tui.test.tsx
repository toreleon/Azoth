import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React from "react";
import { describe, it, expect, beforeAll } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../src/tui/App.js";
import { sparkline } from "../src/tui/lib/sparkline.js";
import { vnColor, pctColor } from "../src/tui/lib/colors.js";
import { classifySession } from "../src/tui/lib/marketSession.js";
import { formatBigVnd, formatPct, formatPrice } from "../src/tui/lib/format.js";
import { getDb } from "../src/storage/db.js";
import { appendSessionRecord, createSession } from "../src/runtime/sessionStore.js";

beforeAll(() => {
  process.env.AZOTH_HOME = mkdtempSync(join(tmpdir(), "azoth-tui-"));
  process.env.VNSTOCK_DB = join(process.env.AZOTH_HOME, "test.db");
  process.env.ANTHROPIC_API_KEY ??= "test-key";
  getDb();
});

function strip(s: string) {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

async function tick(ms = 80) {
  await new Promise((r) => setTimeout(r, ms));
}

async function type(stdin: { write: (s: string) => void }, s: string) {
  stdin.write(s);
  await tick();
  stdin.write("\r");
  await tick();
}

describe("Azoth TUI", () => {
  it("boots into chat mode", async () => {
    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("agent · VN equities");
    expect(out).toContain("Try one");
    expect(out).toContain("advisory autonomy");
    unmount();
  });

  it("opens with a fresh chat session", async () => {
    const previous = createSession({ title: "previous" });
    appendSessionRecord(previous.id, {
      type: "user",
      timestamp: Date.now(),
      sessionId: previous.id,
      cwd: process.cwd(),
      text: "old session text should not appear",
    });

    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).not.toContain("old session text should not appear");
    expect(out).toContain("Try one");
    unmount();
  });

  it("/dashboard switches to dashboard, ESC returns to chat", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/dashboard");
    const dash = strip(lastFrame() ?? "");
    expect(dash).toContain("AZOTH  dashboard");
    expect(dash).toMatch(/INDICES|WATCHLIST|TOP GAINERS/);

    stdin.write("\x1b");
    await tick();
    const back = strip(lastFrame() ?? "");
    expect(back).toContain("Try one");
    unmount();
  });

  it("/journal shows tabs", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/journal");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("AZOTH  journal");
    expect(out).toContain("Decisions");
    expect(out).toContain("Orders");
    expect(out).toContain("Fills");
    expect(out).toContain("Alerts");
    unmount();
  });

  it("/backtest shows form", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/backtest");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("AZOTH  backtest");
    expect(out).toContain("CONFIGURE BACKTEST");
    unmount();
  });

  it("typing / shows the slash command suggest", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    stdin.write("/");
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/dashboard");
    expect(out).toContain("/backtest");
    expect(out).toContain("/journal");
    expect(out).toContain("Tab to complete");
    unmount();
  });

  it("typing /per filters to /persona", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    stdin.write("/per");
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/persona");
    expect(out).not.toContain("/dashboard");
    unmount();
  });

  it("bottom status only shows autonomy", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/persona momentum");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("advisory autonomy");
    expect(out).not.toContain("broker");
    expect(out).not.toContain("in/out");
    expect(out).not.toContain("sid");
    unmount();
  });
});

describe("TUI lib helpers", () => {
  it("vnColor follows VN convention", () => {
    expect(vnColor(100, 100, 110, 90)).toBe("yellow");
    expect(vnColor(110, 100, 110, 90)).toBe("magenta");
    expect(vnColor(90, 100, 110, 90)).toBe("cyan");
    expect(vnColor(105, 100, 110, 90)).toBe("green");
    expect(vnColor(95, 100, 110, 90)).toBe("red");
  });

  it("pctColor", () => {
    expect(pctColor(0)).toBe("yellow");
    expect(pctColor(1)).toBe("green");
    expect(pctColor(-1)).toBe("red");
  });

  it("sparkline", () => {
    expect(sparkline([1, 2, 3, 4, 5])).toHaveLength(5);
    expect(sparkline([])).toBe("");
    expect(sparkline([5, 5, 5])).toMatch(/^.{3}$/);
  });

  it("formatters", () => {
    expect(formatBigVnd(1.5e9)).toBe("1.50B");
    expect(formatBigVnd(2.3e6)).toBe("2.3M");
    expect(formatPct(3.14)).toBe("+3.14%");
    expect(formatPct(-1.2)).toBe("-1.20%");
    expect(formatPrice(28.5)).toBe("28.50");
    expect(formatPrice(null)).toBe("—");
  });

  it("market session classifier", () => {
    expect(classifySession(Date.UTC(2026, 4, 4, 3, 0, 0) / 1000).label).toBe("morning");
    expect(classifySession(Date.UTC(2026, 4, 4, 5, 0, 0) / 1000).label).toBe("lunch");
    expect(classifySession(Date.UTC(2026, 4, 4, 7, 0, 0) / 1000).label).toBe("afternoon");
    expect(classifySession(Date.UTC(2026, 4, 2, 7, 0, 0) / 1000).label).toBe("weekend");
  });
});
