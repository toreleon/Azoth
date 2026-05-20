import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { azothHome, azothPaths, encodeProjectKey, ensureAzothDirs, projectDir } from "../src/runtime/paths.js";
import { initializeAzothRuntime } from "../src/runtime/init.js";
import { loadConfig, resetConfigCacheForTests, updateConfig } from "../src/config/loader.js";
import { verifyLlmEnvironment } from "../src/runtime/llmSetup.js";
import { closeDb, getDb } from "../src/storage/db.js";
import {
  activateSession,
  appendSessionRecord,
  createSession,
  latestSession,
  listSessions,
  readSessionRecords,
} from "../src/runtime/sessionStore.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "azoth-runtime-"));
  process.env.AZOTH_HOME = tmp;
  delete process.env.AZOTH_CONFIG;
  delete process.env.AZOTH_DB;
  resetConfigCacheForTests();
  closeDb();
});

afterEach(() => {
  vi.restoreAllMocks();
  resetConfigCacheForTests();
  closeDb();
  delete process.env.AZOTH_HOME;
  delete process.env.AZOTH_CONFIG;
  delete process.env.AZOTH_DB;
  rmSync(tmp, { recursive: true, force: true });
});

describe("LLM setup verification", () => {
  it("verifies compatible providers through /models without generation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "glm-5.1" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await verifyLlmEnvironment({
      provider: "compatible",
      apiKey: "test-key",
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      model: "glm-5.1",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://open.bigmodel.cn/api/anthropic/v1/models");
    expect((init as RequestInit).method).toBe("GET");
  });

  it("rejects when /models does not include the selected model", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "other-model" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(verifyLlmEnvironment({
      provider: "anthropic",
      apiKey: "test-key",
      baseUrl: "",
      model: "glm-5.1",
    })).rejects.toThrow("was not found");
  });
});

describe("Azoth runtime paths", () => {
  it("uses AZOTH_HOME and creates runtime directories", () => {
    expect(azothHome()).toBe(tmp);
    const paths = ensureAzothDirs();
    expect(existsSync(paths.home)).toBe(true);
    expect(existsSync(paths.projects)).toBe(true);
    expect(existsSync(paths.sessions)).toBe(true);
    expect(existsSync(paths.logs)).toBe(true);
    expect(existsSync(paths.cache)).toBe(true);
    expect(projectDir("/home/code/VNStockAgent")).toContain(encodeProjectKey("/home/code/VNStockAgent"));
  });
});

describe("Azoth config and DB defaults", () => {
  it("creates default config under AZOTH_HOME", () => {
    initializeAzothRuntime();
    const paths = azothPaths();
    expect(existsSync(paths.config)).toBe(true);
    expect(loadConfig().broker).toBe("paper");
  });

  it("treats blank AZOTH_CONFIG as unset", () => {
    initializeAzothRuntime();
    process.env.AZOTH_CONFIG = "";
    resetConfigCacheForTests();
    expect(loadConfig().broker).toBe("paper");
  });

  it("honors AZOTH_CONFIG override", () => {
    const custom = join(tmp, "custom.yaml");
    writeFileSync(custom, [
      "autonomy: manual",
      "model: test-model",
      "broker: paper",
      "risk:",
      "  max_position_pct: 0.1",
      "  max_daily_loss_pct: 0.1",
      "  max_order_notional_vnd: 1000000",
      "  ticker_whitelist: []",
      "  allow_margin: false",
      "",
    ].join("\n"));
    process.env.AZOTH_CONFIG = custom;
    resetConfigCacheForTests();
    expect(loadConfig().model).toBe("test-model");
  });

  it("persists config updates", () => {
    initializeAzothRuntime();
    const updated = updateConfig({ autonomy: "auto" });
    resetConfigCacheForTests();
    expect(updated.autonomy).toBe("auto");
    expect(loadConfig().autonomy).toBe("auto");
    expect(readFileSync(azothPaths().config, "utf8")).toContain("autonomy: auto");
  });

  it("uses AZOTH_HOME database by default and AZOTH_DB when provided", () => {
    const paths = azothPaths();
    getDb();
    closeDb();
    expect(existsSync(paths.db)).toBe(true);

    const custom = join(tmp, "override.db");
    process.env.AZOTH_DB = custom;
    closeDb();
    getDb();
    closeDb();
    expect(existsSync(custom)).toBe(true);
  });
});

describe("Azoth session store", () => {
  it("creates, appends, activates, lists, and resumes latest sessions", () => {
    const first = createSession({ cwd: "/tmp/project", title: "First" });
    appendSessionRecord(first.id, {
      type: "user",
      timestamp: 1,
      sessionId: first.id,
      cwd: "/tmp/project",
      text: "hello",
    }, "/tmp/project");
    const second = createSession({ cwd: "/tmp/project", title: "Second" });
    activateSession(first.id.slice(0, 8), "/tmp/project");

    const records = readSessionRecords(first.id, "/tmp/project");
    expect(records.some((r) => r.type === "user" && r.text === "hello")).toBe(true);
    expect(listSessions("/tmp/project").map((s) => s.id)).toContain(first.id);
    expect(latestSession("/tmp/project")?.id).toBe(first.id);
    expect(second.id).not.toBe(first.id);

    const active = readFileSync(join(projectDir("/tmp/project"), "active-session.json"), "utf8");
    expect(active).toContain(first.id);
  });
});
