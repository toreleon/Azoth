const fs = require('fs');
let code = fs.readFileSync('src/tools/discover.ts', 'utf8');

// Replace rsi14 signature
code = code.replace(
  /function rsi14\(closes: number\[\]\): number \| null \{\n  if \(closes\.length < 15\) return null;\n  const window = closes\.slice\(-15\);\n  let gains = 0;\n  let losses = 0;\n  for \(let i = 1; i < window\.length; i\+\+\) \{\n    const d = window\[i\]! - window\[i - 1\]!;\n    if \(d > 0\) gains \+= d;\n    else losses -= d;\n  \}\n  const avgG = gains \/ 14;\n  const avgL = losses \/ 14;\n  if \(avgL === 0\) return 100;\n  const rs = avgG \/ avgL;\n  return 100 - 100 \/ \(1 \+ rs\);\n\}/,
`// ⚡ Bolt: Use direct array indexing to avoid object allocations in hot path
function rsi14(bars: readonly { close: number }[]): number | null {
  const len = bars.length;
  if (len < 15) return null;
  const start = Math.max(0, len - 15);
  let gains = 0;
  let losses = 0;
  for (let i = start + 1; i < len; i++) {
    const d = bars[i]!.close - bars[i - 1]!.close;
    if (d > 0) gains += d;
    else losses -= d;
  }
  const avgG = gains / 14;
  const avgL = losses / 14;
  if (avgL === 0) return 100;
  const rs = avgG / avgL;
  return 100 - 100 / (1 + rs);
}`
);

// Replace buildCandidate body
code = code.replace(
  /  const closes = bars\.map\(\(b\) => b\.close\);\n  const vols = bars\.map\(\(b\) => b\.volume\);\n  const last = closes\[closes\.length - 1\]!;\n  const prev1w = closes\[closes\.length - 6\];\n  const prev1m = closes\[closes\.length - 22\];\n  const recentVol = vols\.slice\(-5\)\.reduce\(\(a, b\) => a \+ b, 0\) \/ 5;\n  const priorVol =\n    vols\.length >= 25\n      \? vols\.slice\(-25, -5\)\.reduce\(\(a, b\) => a \+ b, 0\) \/ 20\n      : null;\n  const volRatio = priorVol != null && priorVol > 0 \? recentVol \/ priorVol : null;\n  return \{\n    ticker,\n    metric: null,\n    latest_close: last,\n    ret_1w: pct\(last, prev1w\),\n    ret_1m: pct\(last, prev1m\),\n    rsi14: rsi14\(closes\),\n    vol_ratio: volRatio,\n  \};/,
`  // ⚡ Bolt: Eliminate `.map().slice().reduce()` chains in favor of fast indexed loops
  const len = bars.length;
  const last = bars[len - 1]?.close;
  const prev1w = bars[len - 6]?.close;
  const prev1m = bars[len - 22]?.close;

  let recentVolSum = 0;
  const recentStart = Math.max(0, len - 5);
  for (let i = recentStart; i < len; i++) {
    recentVolSum += bars[i]!.volume;
  }
  const recentVol = recentVolSum / 5;

  let priorVolSum = 0;
  const priorStart = Math.max(0, len - 25);
  const priorEnd = len - 5;
  for (let i = priorStart; i < priorEnd; i++) {
    priorVolSum += bars[i]!.volume;
  }
  const priorVol = priorVolSum / 20;

  const volRatio = priorVol > 0 ? recentVol / priorVol : null;

  return {
    ticker,
    metric: null,
    latest_close: last ?? null,
    ret_1w: last != null ? pct(last, prev1w) : null,
    ret_1m: last != null ? pct(last, prev1m) : null,
    rsi14: rsi14(bars),
    vol_ratio: volRatio,
  };`
);

// Replace scored mapping
code = code.replace(
  /  const valid = candidates\.filter\(\(c\) => c\.latest_close != null\);\n\n  let scored: Candidate\[\];\n  switch \(criterion\) \{\n    case "momentum":\n      scored = valid\n        \.filter\(\(c\) => c\.rsi14 != null && c\.rsi14 >= 50 && c\.rsi14 <= 75\)\n        \.map\(\(c\) => \(\{ \.\.\.c, metric: c\.ret_1m \?\? -Infinity \}\)\)\n        \.sort\(\(a, b\) => \(b\.metric \?\? -Infinity\) - \(a\.metric \?\? -Infinity\)\);\n      break;\n    case "breakout":\n      scored = valid\n        \.filter\(\(c\) => \(c\.vol_ratio \?\? 0\) > 1\.3\)\n        \.map\(\(c\) => \(\{ \.\.\.c, metric: c\.ret_1w \?\? -Infinity \}\)\)\n        \.sort\(\(a, b\) => \(b\.metric \?\? -Infinity\) - \(a\.metric \?\? -Infinity\)\);\n      break;\n    case "oversold":\n      scored = valid\n        \.map\(\(c\) => \(\{ \.\.\.c, metric: c\.rsi14 \?\? Infinity \}\)\)\n        \.sort\(\(a, b\) => \(a\.metric \?\? Infinity\) - \(b\.metric \?\? Infinity\)\);\n      break;\n    case "low_volatility":\n      scored = valid\n        \.filter\(\(c\) => \(c\.ret_1w \?\? -Infinity\) > 0\)\n        \.map\(\(c\) => \(\{ \.\.\.c, metric: Math\.abs\(c\.ret_1m \?\? Infinity\) \}\)\)\n        \.sort\(\(a, b\) => \(a\.metric \?\? Infinity\) - \(b\.metric \?\? Infinity\)\);\n      break;\n    case "high_volume":\n      scored = valid\n        \.map\(\(c\) => \(\{ \.\.\.c, metric: c\.vol_ratio \?\? -Infinity \}\)\)\n        \.sort\(\(a, b\) => \(b\.metric \?\? -Infinity\) - \(a\.metric \?\? -Infinity\)\);\n      break;\n    case "top_gainers":\n      scored = valid\n        \.map\(\(c\) => \(\{ \.\.\.c, metric: c\.ret_1w \?\? -Infinity \}\)\)\n        \.sort\(\(a, b\) => \(b\.metric \?\? -Infinity\) - \(a\.metric \?\? -Infinity\)\);\n      break;\n    case "top_losers":\n      scored = valid\n        \.map\(\(c\) => \(\{ \.\.\.c, metric: c\.ret_1w \?\? Infinity \}\)\)\n        \.sort\(\(a, b\) => \(a\.metric \?\? Infinity\) - \(b\.metric \?\? Infinity\)\);\n      break;\n  \}/,
`  // ⚡ Bolt: Optimized by combining filtering/mapping into a single pass and mutating objects in-place
  const scored: Candidate[] = new Array(candidates.length);
  let count = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!;
    if (c.latest_close == null) continue;

    let include = false;
    switch (criterion) {
      case "momentum":
        if (c.rsi14 != null && c.rsi14 >= 50 && c.rsi14 <= 75) {
          c.metric = c.ret_1m ?? -Infinity;
          include = true;
        }
        break;
      case "breakout":
        if ((c.vol_ratio ?? 0) > 1.3) {
          c.metric = c.ret_1w ?? -Infinity;
          include = true;
        }
        break;
      case "oversold":
        c.metric = c.rsi14 ?? Infinity;
        include = true;
        break;
      case "low_volatility":
        if ((c.ret_1w ?? -Infinity) > 0) {
          c.metric = Math.abs(c.ret_1m ?? Infinity);
          include = true;
        }
        break;
      case "high_volume":
        c.metric = c.vol_ratio ?? -Infinity;
        include = true;
        break;
      case "top_gainers":
        c.metric = c.ret_1w ?? -Infinity;
        include = true;
        break;
      case "top_losers":
        c.metric = c.ret_1w ?? Infinity;
        include = true;
        break;
    }
    if (include) {
      scored[count++] = c;
    }
  }
  scored.length = count;

  switch (criterion) {
    case "momentum":
    case "breakout":
    case "high_volume":
    case "top_gainers":
      scored.sort((a, b) => (b.metric ?? -Infinity) - (a.metric ?? -Infinity));
      break;
    case "oversold":
    case "low_volatility":
    case "top_losers":
      scored.sort((a, b) => (a.metric ?? Infinity) - (b.metric ?? Infinity));
      break;
  }`
);

fs.writeFileSync('src/tools/discover.ts', code);
