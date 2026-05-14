import { describe, expect, it } from "vitest";
import { isVersionCommand } from "../src/cli/args.js";

describe("Azoth CLI args", () => {
  it.each([["--version"], ["-v"], ["version"]])("recognizes %s as a version command", (arg) => {
    expect(isVersionCommand([arg])).toBe(true);
  });

  it("does not treat TUI or mixed args as version commands", () => {
    expect(isVersionCommand([])).toBe(false);
    expect(isVersionCommand(["--version", "--help"])).toBe(false);
    expect(isVersionCommand(["about"])).toBe(false);
  });
});
