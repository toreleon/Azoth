import { describe, expect, it } from "vitest";
import { autonomyColor, theme } from "../src/tui/lib/theme.js";

describe("theme", () => {
  describe("autonomyColor", () => {
    it('returns theme.down for "auto"', () => {
      expect(autonomyColor("auto")).toBe(theme.down);
    });

    it('returns theme.flat for "confirm"', () => {
      expect(autonomyColor("confirm")).toBe(theme.flat);
    });

    it('returns theme.up for "off"', () => {
      expect(autonomyColor("off")).toBe(theme.up);
    });

    it('returns theme.up for any other string', () => {
      expect(autonomyColor("unknown")).toBe(theme.up);
      expect(autonomyColor("manual")).toBe(theme.up);
      expect(autonomyColor("")).toBe(theme.up);
    });
  });
});
