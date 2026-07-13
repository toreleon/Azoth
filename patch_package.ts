import { readFileSync, writeFileSync } from "fs";

let content = readFileSync("package.json", "utf8");
const pkg = JSON.parse(content);
if (!pkg.pnpm) { pkg.pnpm = {}; }
if (!pkg.pnpm.overrides) { pkg.pnpm.overrides = {}; }
pkg.pnpm.overrides["undici"] = "^7.28.0";
writeFileSync("package.json", JSON.stringify(pkg, null, 2));
