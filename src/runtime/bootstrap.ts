import { initializeAzothRuntime } from "./init.js";

initializeAzothRuntime();

for (const key of ["AZOTH_DB", "AZOTH_CONFIG", "AZOTH_HOME"] as const) {
  if (process.env[key]?.trim() === "") delete process.env[key];
}
