import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { MarketIndexOverview } from "../../../shared/ipc.js";

export type SizeBy = "marketCap" | "volume";

type Rect = { x: number; y: number; w: number; h: number };

type SectorBucket = {
  industry: string;
  assets: MarketIndexOverview[];
  weight: number;
  averageChangePct: number;
};

type PlacedTile = {
  asset: MarketIndexOverview;
  rect: Rect;
};

type PlacedSector = {
  bucket: SectorBucket;
  rect: Rect;
  tiles: PlacedTile[];
};

export function tileWeightFor(asset: MarketIndexOverview, sizeBy: SizeBy): number {
  const primary = sizeBy === "marketCap" ? asset.marketCap : asset.volume;
  return Math.max(0, primary ?? asset.marketCap ?? asset.volume ?? 0);
}

export function MarketTreemap({
  assets,
  sizeBy,
  sectorFilter,
  selectedSymbol,
  onSelect,
}: {
  assets: MarketIndexOverview[];
  sizeBy: SizeBy;
  sectorFilter: string | null;
  selectedSymbol: string | undefined;
  onSelect: (asset: MarketIndexOverview) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const sectors = useMemo(() => groupSectors(assets, sizeBy), [assets, sizeBy]);
  const visibleSectors = useMemo(
    () => (sectorFilter ? sectors.filter((sector) => sector.industry === sectorFilter) : sectors),
    [sectors, sectorFilter],
  );

  const layout = useMemo<PlacedSector[]>(() => {
    if (size.w <= 0 || size.h <= 0 || visibleSectors.length === 0) return [];
    const SECTOR_GAP = 2;
    const HEADER_H = 18;
    const TILE_GAP = 1;

    const sectorRects = squarify(
      visibleSectors.map((sector) => ({ weight: Math.max(sector.weight, 1), data: sector })),
      { x: 0, y: 0, w: size.w, h: size.h },
    );

    return sectorRects.map(({ data: sector, rect }) => {
      const innerRect = inset(rect, SECTOR_GAP);
      const showHeader = innerRect.w >= 110 && innerRect.h >= 60;
      const contentRect: Rect = showHeader
        ? { x: innerRect.x, y: innerRect.y + HEADER_H, w: innerRect.w, h: Math.max(0, innerRect.h - HEADER_H) }
        : innerRect;

      const tileRects =
        contentRect.w > 4 && contentRect.h > 4
          ? squarify(
              sector.assets
                .filter((asset) => tileWeightFor(asset, sizeBy) > 0)
                .map((asset) => ({ weight: tileWeightFor(asset, sizeBy), data: asset })),
              contentRect,
            )
          : [];

      return {
        bucket: sector,
        rect: innerRect,
        tiles: tileRects.map(({ data: asset, rect: tileRect }) => ({
          asset,
          rect: insetTile(tileRect, TILE_GAP, contentRect),
        })),
      };
    });
  }, [visibleSectors, size, sizeBy]);

  return (
    <div ref={containerRef} className="market-treemap">
      {layout.map((sector) => {
        const showHeader = sector.rect.w >= 110 && sector.rect.h >= 60;
        const tone = sectorTone(sector.bucket.averageChangePct);
        return (
          <div
            key={sector.bucket.industry}
            className="market-treemap-sector"
            style={absStyle(sector.rect)}
            aria-label={sector.bucket.industry}
          >
            {showHeader ? (
              <div className={`market-treemap-sector-head is-${tone}`}>
                <span>{sector.bucket.industry}</span>
                <strong>{formatPct(sector.bucket.averageChangePct)}</strong>
              </div>
            ) : null}
            {sector.tiles.map(({ asset, rect }) => {
              const area = rect.w * rect.h;
              const pct = asset.changePct ?? 0;
              const tileTone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
              const isSelected = asset.symbol === selectedSymbol;
              return (
                <button
                  key={asset.symbol}
                  type="button"
                  className={`market-treemap-tile is-${tileTone}${isSelected ? " is-selected" : ""}`}
                  style={
                    {
                      ...absStyle(rect),
                      "--pct": pct.toFixed(2),
                      "--intensity": clamp(Math.abs(pct) / 4, 0, 1).toFixed(3),
                    } as CSSProperties
                  }
                  onClick={() => onSelect(asset)}
                  title={`${asset.symbol} · ${asset.name} · ${formatPct(pct)} · ${asset.industry ?? asset.exchange}`}
                >
                  <TileContent asset={asset} area={area} width={rect.w} height={rect.h} />
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function TileContent({
  asset,
  area,
  width,
  height,
}: {
  asset: MarketIndexOverview;
  area: number;
  width: number;
  height: number;
}) {
  if (width < 28 || height < 18) return null;
  const pct = asset.changePct ?? 0;

  if (area >= 9000) {
    return (
      <>
        <span className="market-treemap-symbol is-xl">{asset.symbol}</span>
        <strong className="market-treemap-price">{formatCompact(asset.latestClose)}</strong>
        <em className="market-treemap-pct">{formatPct(pct)}</em>
      </>
    );
  }
  if (area >= 3000) {
    return (
      <>
        <span className="market-treemap-symbol is-lg">{asset.symbol}</span>
        <em className="market-treemap-pct">{formatPct(pct)}</em>
      </>
    );
  }
  if (area >= 800) {
    return <span className="market-treemap-symbol">{asset.symbol}</span>;
  }
  return null;
}

function groupSectors(assets: MarketIndexOverview[], sizeBy: SizeBy): SectorBucket[] {
  const map = new Map<string, MarketIndexOverview[]>();
  for (const asset of assets) {
    const industry = asset.industry?.trim() || "Unclassified";
    const list = map.get(industry) ?? [];
    list.push(asset);
    map.set(industry, list);
  }
  return Array.from(map, ([industry, list]) => {
    const weight = list.reduce((sum, asset) => sum + tileWeightFor(asset, sizeBy), 0);
    const withChange = list.filter((asset) => Number.isFinite(asset.changePct));
    const averageChangePct = withChange.length
      ? withChange.reduce((sum, asset) => sum + (asset.changePct ?? 0), 0) / withChange.length
      : 0;
    return { industry, assets: list, weight, averageChangePct };
  })
    .filter((sector) => sector.weight > 0 && sector.assets.length > 0)
    .sort((a, b) => b.weight - a.weight);
}

function sectorTone(changePct: number): "up" | "down" | "flat" {
  if (changePct > 0.05) return "up";
  if (changePct < -0.05) return "down";
  return "flat";
}

function absStyle(rect: Rect): CSSProperties {
  return {
    position: "absolute",
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.w}px`,
    height: `${rect.h}px`,
  };
}

function inset(rect: Rect, amount: number): Rect {
  return {
    x: rect.x + amount,
    y: rect.y + amount,
    w: Math.max(0, rect.w - amount * 2),
    h: Math.max(0, rect.h - amount * 2),
  };
}

function insetTile(rect: Rect, gap: number, bounds: Rect): Rect {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  const boundsRight = bounds.x + bounds.w;
  const boundsBottom = bounds.y + bounds.h;
  const x = rect.x + (rect.x > bounds.x + 0.5 ? gap : 0);
  const y = rect.y + (rect.y > bounds.y + 0.5 ? gap : 0);
  const w = right - x - (right < boundsRight - 0.5 ? gap : 0);
  const h = bottom - y - (bottom < boundsBottom - 0.5 ? gap : 0);
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatPct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function formatCompact(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, notation: "compact" }).format(value);
}

// Squarified treemap (Bruls, Huijsen, van Wijk 2000).
function squarify<T>(items: Array<{ weight: number; data: T }>, rect: Rect): Array<{ data: T; rect: Rect }> {
  if (items.length === 0 || rect.w <= 0 || rect.h <= 0) return [];
  const sorted = [...items].filter((item) => item.weight > 0).sort((a, b) => b.weight - a.weight);
  if (sorted.length === 0) return [];

  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  const totalArea = rect.w * rect.h;
  const scale = totalArea / totalWeight;
  const scaled = sorted.map((item) => ({ ...item, area: item.weight * scale }));

  const results: Array<{ data: T; rect: Rect }> = [];
  let remaining = { ...rect };
  let queue = [...scaled];

  while (queue.length > 0) {
    const row: typeof queue = [];
    const shorter = Math.min(remaining.w, remaining.h);
    if (shorter <= 0) break;

    let lastRatio = Infinity;
    while (queue.length > 0) {
      const candidate = [...row, queue[0]];
      const ratio = worstRatio(candidate, shorter);
      if (ratio <= lastRatio) {
        row.push(queue.shift()!);
        lastRatio = ratio;
      } else {
        break;
      }
    }

    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    if (remaining.w >= remaining.h) {
      const rowWidth = rowArea / remaining.h;
      let y = remaining.y;
      for (const item of row) {
        const h = item.area / rowWidth;
        results.push({ data: item.data, rect: { x: remaining.x, y, w: rowWidth, h } });
        y += h;
      }
      remaining = { x: remaining.x + rowWidth, y: remaining.y, w: remaining.w - rowWidth, h: remaining.h };
    } else {
      const rowHeight = rowArea / remaining.w;
      let x = remaining.x;
      for (const item of row) {
        const w = item.area / rowHeight;
        results.push({ data: item.data, rect: { x, y: remaining.y, w, h: rowHeight } });
        x += w;
      }
      remaining = { x: remaining.x, y: remaining.y + rowHeight, w: remaining.w, h: remaining.h - rowHeight };
    }
  }

  return results;
}

function worstRatio(row: Array<{ area: number }>, shorter: number): number {
  if (row.length === 0) return Infinity;
  const sum = row.reduce((acc, item) => acc + item.area, 0);
  const max = Math.max(...row.map((item) => item.area));
  const min = Math.min(...row.map((item) => item.area));
  const side = shorter;
  const sumSq = sum * sum;
  const sideSq = side * side;
  return Math.max((sideSq * max) / sumSq, sumSq / (sideSq * min));
}
