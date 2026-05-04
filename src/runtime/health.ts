import { existsSync } from "node:fs";
import { loadConfig } from "../config/loader.js";
import { getBroker } from "../broker/index.js";
import { getDb } from "../storage/db.js";
import { azothPaths } from "./paths.js";
import { checkVnMarketSession } from "../risk/vnMarketSession.js";
import { getMacroIndices } from "../tools/macro.js";

export interface HealthRow {
  name: string;
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  rows: HealthRow[];
}

export async function collectHealth(opts: { probeProviders?: boolean } = {}): Promise<HealthReport> {
  const rows: HealthRow[] = [];
  const paths = azothPaths();

  rows.push({
    name: "api_key",
    ok: Boolean(process.env.ANTHROPIC_API_KEY),
    detail: process.env.ANTHROPIC_API_KEY ? "ANTHROPIC_API_KEY is set" : "ANTHROPIC_API_KEY is missing",
  });

  let cfg: ReturnType<typeof loadConfig> | null = null;
  try {
    cfg = loadConfig();
    rows.push({ name: "config", ok: true, detail: `${paths.config} autonomy=${cfg.autonomy} broker=${cfg.broker}` });
  } catch (err) {
    rows.push({ name: "config", ok: false, detail: (err as Error).message });
  }

  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    rows.push({ name: "database", ok: true, detail: process.env.AZOTH_DB ?? paths.db });
  } catch (err) {
    rows.push({ name: "database", ok: false, detail: (err as Error).message });
  }

  if (cfg) {
    rows.push({
      name: "live_trading",
      ok: cfg.broker !== "dnse" || process.env.AZOTH_LIVE_TRADING === "1",
      detail:
        cfg.broker === "dnse"
          ? `dnse armed=${process.env.AZOTH_LIVE_TRADING === "1"}`
          : "paper broker selected",
    });
    try {
      const broker = getBroker();
      rows.push({ name: "broker", ok: true, detail: broker.name });
    } catch (err) {
      rows.push({ name: "broker", ok: false, detail: (err as Error).message });
    }
  }

  const session = checkVnMarketSession();
  rows.push({
    name: "market_session",
    ok: true,
    detail: session.open ? `open ${session.session} (${session.ictTime} ICT)` : `closed (${session.ictTime} ICT: ${session.reason})`,
  });

  const envFileExists = existsSync(paths.env);
  rows.push({
    name: "env_file",
    ok: envFileExists || Boolean(process.env.ANTHROPIC_API_KEY),
    detail: envFileExists ? paths.env : `${paths.env} not found; using process env only`,
  });

  if (opts.probeProviders) {
    try {
      const indices = await getMacroIndices(["VNINDEX"]);
      rows.push({
        name: "data_provider",
        ok: indices.length > 0,
        detail: indices[0] ? `VNINDEX ${indices[0].latest_close}` : "VNINDEX probe returned no data",
      });
    } catch (err) {
      rows.push({ name: "data_provider", ok: false, detail: (err as Error).message });
    }
  } else {
    rows.push({ name: "data_provider", ok: true, detail: "not probed; run /health --probe to check provider reachability" });
  }

  return {
    ok: rows.every((r) => r.ok),
    rows,
  };
}

export function renderHealth(report: HealthReport): string {
  return [
    `Health: ${report.ok ? "ok" : "attention needed"}`,
    ...report.rows.map((r) => `${r.ok ? "✓" : "✗"} ${r.name}: ${r.detail}`),
  ].join("\n");
}
