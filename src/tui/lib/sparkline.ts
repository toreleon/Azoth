const BLOCKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export function sparkline(values: Array<number | null | undefined>, width?: number): string {
  const filtered = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (filtered.length === 0) return "";
  const series = width != null && filtered.length > width
    ? sample(filtered, width)
    : filtered;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  if (span === 0) return BLOCKS[3]!.repeat(series.length);
  return series
    .map((v) => {
      const idx = Math.min(BLOCKS.length - 1, Math.floor(((v - min) / span) * BLOCKS.length));
      return BLOCKS[idx];
    })
    .join("");
}

function sample(arr: number[], n: number): number[] {
  if (n >= arr.length) return arr;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / (n - 1)) * (arr.length - 1));
    out.push(arr[idx]!);
  }
  return out;
}
