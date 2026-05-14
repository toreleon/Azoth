import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, updateConfig } from "../src/config/loader.js";
import { azothPaths } from "../src/runtime/paths.js";

const ORIGIN = "invest.fhsc.com.vn";
const DEFAULT_BASE = "https://api.vinasecurities.com";

interface Candidate {
  profile: string;
  file: string;
  mtimeMs: number;
  accessToken?: string;
  accessKey?: string;
  deviceId?: string;
  userId?: string;
  custId?: string;
}

function profileDirs(): Array<{ profile: string; dir: string }> {
  const home = process.env.HOME ?? "";
  const roots = [
    join(home, "Library/Application Support/Google/Chrome"),
    join(home, "Library/Application Support/Chromium"),
    join(home, "Library/Application Support/BraveSoftware/Brave-Browser"),
    join(home, "Library/Application Support/Microsoft Edge"),
  ];
  const dirs: Array<{ profile: string; dir: string }> = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const profile of readdirSync(root)) {
      if (!/^(Default|Profile \d+)$/i.test(profile)) continue;
      const dir = join(root, profile, "Local Storage/leveldb");
      if (existsSync(dir)) dirs.push({ profile: `${root.split("/").at(-1) ?? "browser"} ${profile}`, dir });
    }
  }
  return dirs;
}

function printable(value: string): string {
  return value.replace(/[^\x20-\x7e]+/g, " ");
}

function tokensAfter(window: string, key: string): string[] {
  const i = window.indexOf(key);
  if (i < 0) return [];
  const tail = printable(window.slice(i + key.length, i + key.length + 600));
  return tail.match(/[A-Za-z0-9._:-]{3,}/g) ?? [];
}

function rejectToken(token: string): boolean {
  return (
    token.includes(ORIGIN) ||
    token.startsWith("https:") ||
    token.startsWith("_https:") ||
    ["access_key", "access_token", "device_id", "cust_id", "persist:root"].includes(token)
  );
}

function firstTokenAfter(window: string, key: string): string | undefined {
  return tokensAfter(window, key).find((token) => !rejectToken(token));
}

function extractFromWindow(window: string): Omit<Candidate, "profile" | "file" | "mtimeMs"> {
  const accessToken = window.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/)?.[0];
  const accessKey = firstTokenAfter(window, "access_key") ?? firstTokenAfter(window, "accessKey");
  const deviceId = firstTokenAfter(window, "device_id") ?? firstTokenAfter(window, "deviceId");
  const userId = tokensAfter(window, "user_id").find((token) => /^\d{3,}$/.test(token));
  const custId = tokensAfter(window, "cust_id").find((token) => /^\d{6,}$/.test(token));
  return { accessToken, accessKey, deviceId, userId, custId };
}

function candidatesFromFile(profile: string, file: string): Candidate[] {
  const buf = readFileSync(file);
  const text = buf.toString("latin1");
  const stat = statSync(file);
  const candidates: Candidate[] = [];
  let index = 0;
  while ((index = text.indexOf(ORIGIN, index)) >= 0) {
    const window = text.slice(Math.max(0, index - 250), index + 2_500);
    const found = extractFromWindow(window);
    if (found.accessToken || found.accessKey || found.deviceId) {
      candidates.push({ profile, file, mtimeMs: stat.mtimeMs, ...found });
    }
    index += ORIGIN.length;
  }
  return candidates;
}

function score(candidate: Candidate): number {
  return (
    (candidate.accessToken ? 4 : 0) +
    (candidate.accessKey ? 4 : 0) +
    (candidate.deviceId ? 2 : 0) +
    (candidate.custId ? 1 : 0)
  );
}

function bestCandidate(): Candidate | undefined {
  const candidates: Candidate[] = [];
  for (const { profile, dir } of profileDirs()) {
    for (const name of readdirSync(dir)) {
      if (!/\.(ldb|log)$/i.test(name)) continue;
      candidates.push(...candidatesFromFile(profile, join(dir, name)));
    }
  }
  return candidates
    .filter((candidate) => candidate.accessToken && candidate.accessKey)
    .sort((a, b) => score(b) - score(a) || b.mtimeMs - a.mtimeMs)[0];
}

function main() {
  const candidate = bestCandidate();
  if (!candidate?.accessToken || !candidate.accessKey) {
    console.error(
      `No FHSC browser session found. Log in to https://${ORIGIN} in Chrome, then rerun this command.`,
    );
    process.exitCode = 1;
    return;
  }

  const current = loadConfig();
  updateConfig({
    broker: "fhsc",
    fhsc: {
      ...current.fhsc,
      base_url: current.fhsc.base_url.trim() || DEFAULT_BASE,
      access_token: candidate.accessToken,
      access_key: candidate.accessKey,
      device_id: candidate.deviceId ?? current.fhsc.device_id,
      user_id: candidate.userId ?? current.fhsc.user_id,
      cust_id: candidate.custId ?? current.fhsc.cust_id,
    },
  });

  const fields = ["access_token", "access_key"];
  if (candidate.deviceId) fields.push("device_id");
  if (candidate.userId) fields.push("user_id");
  if (candidate.custId) fields.push("cust_id");
  console.log(`Imported FHSC browser session from ${candidate.profile}.`);
  console.log(`Updated ${azothPaths().config} (${fields.join(", ")}). Secret values were not printed.`);
}

main();
