export const theme = {
  brand: "red",
  brandBright: "redBright",
  accent: "cyan",
  accentSoft: "gray",
  up: "green",
  down: "red",
  flat: "yellow",
  ceiling: "magenta",
  floor: "cyan",
  ref: "yellow",
  thinking: "yellow",
  persona: "magenta",
  muted: "gray",
} as const;

export const autonomyColor = (a: string): string =>
  a === "auto" ? theme.down : theme.up;

export const sessionColor = (label: string): string =>
  label === "morning" || label === "afternoon"
    ? theme.up
    : label === "atc"
      ? theme.flat
      : label === "lunch"
        ? theme.flat
        : theme.muted;

export const glyph = {
  bar: "▌",
  toolRunning: "◇",
  toolDone: "◆",
  ok: "✓",
  fail: "✗",
  up: "▲",
  down: "▼",
  flat: "▬",
  thinking: "· · ·",
  nav: "▸",
  pipe: "│",
} as const;
