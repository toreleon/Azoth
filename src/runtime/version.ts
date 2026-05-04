import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJson {
  version?: string;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

export function packageVersion(): string {
  if (process.env.npm_package_version) return process.env.npm_package_version;

  for (const packagePath of [
    resolve(moduleDir, "../../package.json"),
    resolve(moduleDir, "../../../package.json"),
  ]) {
    try {
      const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as PackageJson;
      if (pkg.version) return pkg.version;
    } catch {
      // Try the next runtime layout.
    }
  }

  return "unknown";
}
