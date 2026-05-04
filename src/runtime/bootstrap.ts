import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { initializeAzothRuntime } from "./init.js";
import { azothPaths } from "./paths.js";

initializeAzothRuntime();

const paths = azothPaths();
if (existsSync(paths.env)) {
  loadDotenv({ path: paths.env });
}

const localEnv = resolve(process.cwd(), ".env");
if (existsSync(localEnv)) {
  loadDotenv({ path: localEnv, override: false });
}

for (const key of ["VNSTOCK_DB", "VNSTOCK_CONFIG", "AZOTH_HOME"] as const) {
  if (process.env[key]?.trim() === "") delete process.env[key];
}
