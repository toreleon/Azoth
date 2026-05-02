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
    expect(out).toContain("VN-stock copilot");
    expect(out).toContain("Tips for getting started");
    expect(out).toContain("advisory");
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
    expect(out).toContain("Tips for getting started");
    unmount();
  });

  it("does not pin a dashboard grid above chat", async () => {
    const { lastFrame, unmount } = render(<App />);
    await tick();
    const out = strip(lastFrame() ?? "");
    expect(out).not.toMatch(/INDICES|TOP GAINERS|TOP LOSERS|FOREIGN FLOW/);
    unmount();
  });

  it("/journal prints rows inline in chat", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/journal decisions 5");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("DECISIONS");
    unmount();
  });

  it("/backtest help prints usage in chat", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/backtest help");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("/backtest");
    expect(out).toContain("[persona]");
    unmount();
  });

  it("typing / shows the slash command suggest", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    stdin.write("/");
    await tick();
    const out = strip(lastFrame() ?? "");
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
    expect(out).toContain("balanced · momentum · value · bluechip");
    unmount();
  });

  it("/journal renders as a bordered card", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/journal decisions 5");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("DECISIONS");
    // Panel uses round borders; assert at least one border glyph appears with the card.
    expect(out).toMatch(/[╭╮╰╯─│]/);
    unmount();
  });

  it("bottom status shows persona, autonomy, hint", async () => {
    const { lastFrame, stdin, unmount } = render(<App />);
    await tick();
    await type(stdin, "/persona momentum");
    const out = strip(lastFrame() ?? "");
    expect(out).toContain("advisory");
    expect(out).toContain("momentum");
    expect(out).toMatch(/Ctrl\+A|Ctrl\+C|\/backtest/);
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
