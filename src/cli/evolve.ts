#!/usr/bin/env node
/**
 * Evolutionary harness for AgentProfile.
 *
 *   pnpm tsx src/cli/evolve.ts \
 *     --profile=vn-equity@v0 \
 *     --pop=8 --gens=5 \
 *     --train=2024-01-01:2024-06-30 \
 *     --val=2024-07-01:2024-12-31 \
 *     --holdout=2025-01-01:2025-06-30
 *
 * Each generation:
 *   1. Evaluate every population member on the train and val folds (cached).
 *   2. Compute fitness = sharpe_val − λ·max(0, mdd_val − dd_floor) − β·turnover − γ·complexity.
 *   3. Select top-4 survivors by val fitness penalized by a train/val stability gap.
 *   4. Build the next generation: 4 survivors + 2 LLM crossover children + 2 random control kids.
 *
 * After the final generation, the top profile is evaluated on the HOLDOUT
 * fold exactly once. The holdout is never visible to selection — it is the
 * single honest readout of out-of-sample performance.
 */
import "../runtime/bootstrap.js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runBacktestSession } from "../agent/backtestRunner.js";
import { getDb } from "../storage/db.js";
import { azothPaths } from "../runtime/paths.js";
import { loadProfile, saveProfile } from "../agent/profileStore.js";
import { profileRef, type AgentProfile } from "../agent/profile.js";
import {
  computeFitness,
  computeMetrics,
  DEFAULT_FITNESS,
  llmCrossover,
  randomMutate,
  selectSurvivors,
  type FoldMetrics,
  type ScoredMember,
} from "../agent/evolution.js";

interface FoldSpec {
  name: string;
  start: string;
  end: string;
}

interface EvolveArgs {
  seedRef: string;
  pop: number;
  gens: number;
  initialCash: number;
  train: FoldSpec;
  val: FoldSpec;
  holdout?: FoldSpec;
  cycleId: string;
}

function parseFold(raw: string, name: string): FoldSpec {
  const m = /^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (!m) throw new Error(`bad fold spec '${raw}' for ${name} (expected YYYY-MM-DD:YYYY-MM-DD)`);
  return { name, start: m[1]!, end: m[2]! };
}

function parseArgs(argv: string[]): EvolveArgs {
  let seedRef = "vn-equity@v0";
  let pop = 8;
  let gens = 5;
  let initialCash = 1_000_000_000;
  let train: FoldSpec | undefined;
  let val: FoldSpec | undefined;
  let holdout: FoldSpec | undefined;
  let cycleId = `cycle-${randomUUID().slice(0, 8)}`;

  for (const a of argv) {
    const m = /^--([\w-]+)=(.+)$/.exec(a);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "profile") seedRef = v!;
    else if (k === "pop") pop = Number(v);
    else if (k === "gens") gens = Number(v);
    else if (k === "initial-cash") initialCash = Number(v);
    else if (k === "train") train = parseFold(v!, "train");
    else if (k === "val") val = parseFold(v!, "val");
    else if (k === "holdout") holdout = parseFold(v!, "holdout");
    else if (k === "cycle-id") cycleId = v!;
  }
  if (!train || !val) throw new Error("--train and --val are required (YYYY-MM-DD:YYYY-MM-DD)");
  if (pop < 2) throw new Error("--pop must be ≥ 2");
  if (gens < 1) throw new Error("--gens must be ≥ 1");
  return { seedRef, pop, gens, initialCash, train, val, holdout, cycleId };
}

interface FoldEvaluation {
  runId: string;
  metrics: FoldMetrics;
  fitness: number;
}

async function evaluateFold(
  profile: AgentProfile,
  fold: FoldSpec,
  initialCash: number,
): Promise<FoldEvaluation> {
  const db = getDb();
  // Memoization: any prior evaluation row for this (profile, fold) is reused.
  const cached = db
    .prepare(
      `SELECT pe.run_id, pe.fitness, pe.sharpe, pe.max_dd, pe.alpha, pe.total_return
         FROM profile_evaluations pe
         JOIN backtest_runs br ON br.id = pe.run_id
        WHERE pe.profile_id = ? AND pe.profile_ver = ? AND pe.fold = ?
        ORDER BY pe.created_at DESC
        LIMIT 1`,
    )
    .get(profile.id, profile.version, fold.name) as
    | { run_id: string; fitness: number; sharpe: number; max_dd: number; alpha: number; total_return: number }
    | undefined;
  if (cached) {
    const equity = db
      .prepare("SELECT mtm_vnd, benchmark_mtm_vnd FROM backtest_equity WHERE run_id = ? ORDER BY as_of")
      .all(cached.run_id) as { mtm_vnd: number; benchmark_mtm_vnd: number }[];
    const filledNotional = sumFilledNotional(cached.run_id);
    const metrics = computeMetrics(
      initialCash,
      equity.map((e) => ({ mtmVnd: e.mtm_vnd, benchmarkMtmVnd: e.benchmark_mtm_vnd })),
      filledNotional,
    );
    return { runId: cached.run_id, metrics, fitness: cached.fitness };
  }

  const ref = profileRef(profile);
  process.stdout.write(`    ${ref} on ${fold.name} ${fold.start}→${fold.end} … `);
  const summary = await runBacktestSession({
    start: fold.start,
    end: fold.end,
    profileRef: ref,
    initialCash,
  });
  const equity = db
    .prepare("SELECT mtm_vnd, benchmark_mtm_vnd FROM backtest_equity WHERE run_id = ? ORDER BY as_of")
    .all(summary.runId) as { mtm_vnd: number; benchmark_mtm_vnd: number }[];
  const filledNotional = sumFilledNotional(summary.runId);
  const metrics = computeMetrics(
    initialCash,
    equity.map((e) => ({ mtmVnd: e.mtm_vnd, benchmarkMtmVnd: e.benchmark_mtm_vnd })),
    filledNotional,
  );
  const fitness = computeFitness(profile, metrics);

  db.prepare(
    `INSERT OR REPLACE INTO profile_evaluations
       (profile_id, profile_ver, fold, run_id, sharpe, max_dd, alpha, total_return, fitness, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    profile.id,
    profile.version,
    fold.name,
    summary.runId,
    metrics.sharpe,
    metrics.maxDd,
    metrics.alpha,
    metrics.totalReturn,
    fitness,
    Math.floor(Date.now() / 1000),
  );

  process.stdout.write(`sharpe=${metrics.sharpe.toFixed(2)} mdd=${(metrics.maxDd * 100).toFixed(1)}% fitness=${fitness.toFixed(3)}\n`);
  return { runId: summary.runId, metrics, fitness };
}

function sumFilledNotional(runId: string): number {
  const db = getDb();
  const brokerLike = `paper-bt-${runId.slice(0, 8)}`;
  const rows = db
    .prepare(
      `SELECT filled_price, filled_qty FROM broker_orders
        WHERE broker = ? AND status = 'FILLED' AND filled_price IS NOT NULL AND filled_qty IS NOT NULL`,
    )
    .all(brokerLike) as { filled_price: number; filled_qty: number }[];
  return rows.reduce((s, r) => s + r.filled_price * r.filled_qty * 1000, 0);
}

async function buildInitialPopulation(seed: AgentProfile, target: number): Promise<AgentProfile[]> {
  const out: AgentProfile[] = [seed];
  while (out.length < target) {
    const parent = out[Math.floor(Math.random() * out.length)]!;
    const child = randomMutate(parent);
    saveProfile(child);
    out.push(child);
  }
  return out;
}

async function nextGeneration(
  survivors: ScoredMember[],
  metricsByRef: Map<string, FoldMetrics>,
  popSize: number,
): Promise<AgentProfile[]> {
  const next: AgentProfile[] = survivors.map((s) => s.profile);
  const slots = popSize - next.length;
  // 50/50 split between LLM crossover children and random control kids.
  const crossoverSlots = Math.ceil(slots / 2);
  const randomSlots = slots - crossoverSlots;

  for (let i = 0; i < crossoverSlots; i++) {
    const a = survivors[i % survivors.length]!.profile;
    const b = survivors[(i + 1) % survivors.length]!.profile;
    const aMetrics = metricsByRef.get(profileRef(a))!;
    const bMetrics = metricsByRef.get(profileRef(b))!;
    const child = await llmCrossover({ parents: [a, b], parentMetrics: [aMetrics, bMetrics] });
    saveProfile(child);
    next.push(child);
  }
  for (let i = 0; i < randomSlots; i++) {
    const parent = survivors[i % survivors.length]!.profile;
    const child = randomMutate(parent);
    saveProfile(child);
    next.push(child);
  }
  return next;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Azoth evolve cycle ${args.cycleId}`);
  console.log(`  seed=${args.seedRef}  pop=${args.pop}  gens=${args.gens}`);
  console.log(`  train=${args.train.start}→${args.train.end}  val=${args.val.start}→${args.val.end}`);
  if (args.holdout) console.log(`  holdout=${args.holdout.start}→${args.holdout.end}`);
  console.log("");

  const seed = loadProfile(args.seedRef);
  let population = await buildInitialPopulation(seed, args.pop);

  const generationLog: Array<{
    gen: number;
    members: { ref: string; trainFitness: number; valFitness: number }[];
    topRef: string;
    topVal: number;
  }> = [];

  for (let gen = 0; gen < args.gens; gen++) {
    console.log(`Generation ${gen + 1}/${args.gens}`);
    const valMetrics = new Map<string, FoldMetrics>();
    const scored: ScoredMember[] = [];
    for (const profile of population) {
      console.log(`  member ${profileRef(profile)}`);
      const trainEval = await evaluateFold(profile, args.train, args.initialCash);
      const valEval = await evaluateFold(profile, args.val, args.initialCash);
      valMetrics.set(profileRef(profile), valEval.metrics);
      scored.push({
        profile,
        trainFitness: trainEval.fitness,
        valFitness: valEval.fitness,
      });
    }

    scored.sort((a, b) => b.valFitness - a.valFitness);
    const top = scored[0]!;
    generationLog.push({
      gen: gen + 1,
      members: scored.map((s) => ({
        ref: profileRef(s.profile),
        trainFitness: s.trainFitness,
        valFitness: s.valFitness,
      })),
      topRef: profileRef(top.profile),
      topVal: top.valFitness,
    });
    console.log(`  ↑ best: ${profileRef(top.profile)}  val_fitness=${top.valFitness.toFixed(3)}`);

    if (gen === args.gens - 1) {
      population = [top.profile]; // signal to holdout step
      break;
    }

    const survivors = selectSurvivors(scored, Math.min(4, args.pop - 1));
    population = await nextGeneration(survivors, valMetrics, args.pop);
  }

  const winner = population[0]!;
  console.log(`\nWinner: ${profileRef(winner)}`);

  let holdoutEval: FoldEvaluation | undefined;
  if (args.holdout) {
    console.log(`\nHoldout fold (single-touch): ${args.holdout.start}→${args.holdout.end}`);
    holdoutEval = await evaluateFold(winner, args.holdout, args.initialCash);
    console.log(
      `  oos: sharpe=${holdoutEval.metrics.sharpe.toFixed(2)}  mdd=${(holdoutEval.metrics.maxDd * 100).toFixed(1)}%  alpha=${(holdoutEval.metrics.alpha * 100).toFixed(2)}%  fitness=${holdoutEval.fitness.toFixed(3)}`,
    );
  } else {
    console.log("  (no --holdout fold provided; skipping single-touch evaluation)");
  }

  const outDir = resolve(azothPaths().logs, "evolve");
  mkdirSync(outDir, { recursive: true });
  const reportPath = resolve(outDir, `${args.cycleId}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        cycleId: args.cycleId,
        seedRef: args.seedRef,
        winner: profileRef(winner),
        fitnessConfig: DEFAULT_FITNESS,
        train: args.train,
        val: args.val,
        holdout: args.holdout,
        generations: generationLog,
        holdoutEvaluation: holdoutEval
          ? { runId: holdoutEval.runId, metrics: holdoutEval.metrics, fitness: holdoutEval.fitness }
          : undefined,
      },
      null,
      2,
    ),
  );
  console.log(`\nreport: ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
