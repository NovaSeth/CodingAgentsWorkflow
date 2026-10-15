#!/usr/bin/env node
// Freezes the eval suite and turns a finished eval run into publishable numbers.
//
//   node scripts/eval-publish.mjs lock [--check] [--evals <dir>] [--hidden <dir>]
//     Writes plugins/<plugin>/evals/suite.lock.json (scripts/eval-lib/lock.mjs: publication rules, per-case class,
//     completion checks, process indicators, content hashes); --check writes nothing and fails when it is stale.
//   node scripts/eval-publish.mjs summarize --results <aggregate-result.json> --hidden-report <file>
//                                 [--out <file>] [--markdown <file>] [--evals <dir>] [--hidden <dir>]
//     Validates the run against the lock and computes, per the lock's publication rules:
//     - quality per run from the hidden report (1 complete, 0 incomplete), per case and arm with Wilson intervals;
//     - the primary statistic: mean over cases of (mean with - mean without), with a seeded percentile bootstrap
//       (runs resampled within each case x arm) for the main interval and a wider sensitivity interval;
//     - process indicators (harness grader scores, verification after the last change) apart from quality;
//     - small-task overhead per trivial case (median tokens and wall time, with / without) and the cost delta;
//     - conditions (Claude Code version, models, judge, Node, concurrency, run order, cache use) and raw runs.
//     Refuses (exit 1, reasons listed) a stale or different lock, a partial or incomplete run, a missing, duplicate,
//     extra, unchecked or self-contradicting hidden result, a hidden report made from another results file, a
//     hidden result not bound to its run or whose kept run (trace, final workspace) no longer matches the hashes
//     the post-pass recorded, skipped paid graders, an infrastructure error, or candidate code run unconfined.
//     The kept run directories (--keep-temp) must still exist when publishing.
// Exit: 0 written · 1 lock stale (--check) or publication refused · 2 usage or input error · 70 internal error
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { verifyKept } from './eval-lib/kept.mjs';
import { lockState, writeLock } from './eval-lib/lock.mjs';
import { bootstrap, interval, mean, median, suiteDelta, wilson } from './eval-lib/stats.mjs';
import { SuiteError, defaultEvals, defaultHidden } from './eval-lib/suite.mjs';

const USAGE = [
  'usage: node scripts/eval-publish.mjs lock [--check] [--evals <dir>] [--hidden <dir>]',
  '       node scripts/eval-publish.mjs summarize --results <file> --hidden-report <file> [--out <file>] [--markdown <file>] [--evals <dir>] [--hidden <dir>]',
  '',
].join('\n');
const INFRASTRUCTURE = /not logged in|authenticat|api error|rate limit|overloaded|ECONNRESET|socket hang up|credential/i;

class Invalid extends Error {}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === '--help' || command === '-h') return { help: true };
  if (!['lock', 'summarize'].includes(command)) throw new Invalid(`unknown command: ${command ?? '(none)'}\n${USAGE}`);
  const opts = { command, check: false, results: null, report: null, out: null, markdown: null, evals: null, hidden: null };
  const flags = { '--results': 'results', '--hidden-report': 'report', '--out': 'out', '--markdown': 'markdown', '--evals': 'evals', '--hidden': 'hidden' };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--check' && command === 'lock') opts.check = true;
    else if (flags[arg] && i + 1 < rest.length && !rest[i + 1].startsWith('--')) opts[flags[arg]] = resolve(rest[++i]);
    else throw new Invalid(`unknown or incomplete argument: ${arg}\n${USAGE}`);
  }
  if (command === 'summarize' && (!opts.results || !opts.report)) throw new Invalid(`summarize needs --results and --hidden-report\n${USAGE}`);
  return opts;
}

const readJson = (file) => {
  if (!existsSync(file)) throw new Invalid(`${file} does not exist`);
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (err) { throw new Invalid(`${file}: ${err.message}`); }
};

const armRuns = (entry, arm) => (arm === 'with' ? entry.runs ?? entry.arms?.with : entry.runs_without ?? entry.arms?.without) ?? [];
const field = (run, snake, camel) => run?.[snake] ?? run?.[camel];
const tokensOf = (usage) => (usage ? ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((n, k) => n + (Number(usage[k]) || 0), 0) : null);
const round = (x, digits = 4) => (Number.isFinite(x) ? Number(x.toFixed(digits)) : null);

// One hidden result: a decided status, a quality that matches it, and checks that agree with both.
function recordProblem(hidden) {
  if (!['pass', 'fail', 'unchecked'].includes(hidden.status)) return `unknown hidden status ${JSON.stringify(hidden.status)}`;
  if (hidden.status === 'unchecked') return `hidden result unchecked (${hidden.reason ?? 'a check could not run'})`;
  if (hidden.quality !== (hidden.status === 'pass' ? 1 : 0)) return `quality ${JSON.stringify(hidden.quality)} contradicts status ${hidden.status}`;
  const checks = Array.isArray(hidden.checks) ? hidden.checks : [];
  if (checks.length === 0) return 'no checks recorded';
  if (checks.some((c) => c?.ok !== true && c?.ok !== false)) return 'a check is unchecked';
  if (hidden.status === 'pass' && checks.some((c) => c.ok !== true)) return 'status pass with a failing check';
  if (hidden.status === 'fail' && !checks.some((c) => c.ok === false)) return 'status fail without a failing check';
  return null;
}

// resultsSha256: hash of the results file as read; verifyRun(hidden, run): null, or why the kept run no longer
// matches the binding the hidden result recorded (scripts/eval-lib/kept.mjs verifyKept for real runs).
export function summarize({ results, report, lock, resultsSha256, verifyRun }) {
  const refusals = [];
  const pub = lock.lock.publication;
  const perArm = pub.runs_per_arm;
  if (!lock.current) refusals.push('the suite lock is stale: run `node scripts/eval-publish.mjs lock` and rerun');
  if (report.suite_lock?.sha256 !== lock.sha256) refusals.push('the hidden report was produced under a different suite lock');
  if (report.suite_lock?.current !== true) refusals.push('the hidden report was produced under a stale suite lock');
  if (results.partial) refusals.push(`the eval run is partial (${results.partialReason ?? results.partial_reason ?? 'no reason given'})`);
  if ((results.suite?.ablation ?? 'with-without') !== 'with-without') refusals.push('the eval run has no without arm (ablation is not with-without)');
  if (report.confinement?.unconfined) refusals.push('candidate code ran unconfined in the hidden post-pass');
  if (!results.claudeVersion && !results.claude_version) refusals.push('the eval run does not record the Claude Code version');
  if (!resultsSha256 || report.source?.results_sha256 !== resultsSha256) refusals.push('the hidden report was made from another results file (or does not say which)');

  const byName = new Map(results.cases.map((c) => [c.name, c]));
  const hiddenRuns = new Map();
  for (const r of report.runs ?? []) {
    const key = `${r.case}/${r.arm}/${r.run}`;
    if (hiddenRuns.has(key)) refusals.push(`case ${r.case}, arm ${r.arm}, run ${r.run}: more than one hidden result`);
    hiddenRuns.set(key, r);
  }
  const used = new Set();
  const cases = [];
  const raw = [];
  for (const [name, def] of Object.entries(lock.lock.cases)) {
    const entry = byName.get(name);
    if (!entry) { refusals.push(`case ${name} is missing from the eval run`); continue; }
    const arms = {};
    for (const arm of ['with', 'without']) {
      const runs = armRuns(entry, arm);
      if (runs.length !== perArm) refusals.push(`case ${name}, arm ${arm}: ${runs.length} runs, the lock requires ${perArm}`);
      const rows = runs.map((run, i) => {
        const at = `case ${name}, arm ${arm}, run ${i + 1}`;
        const hidden = hiddenRuns.get(`${name}/${arm}/${i + 1}`);
        used.add(`${name}/${arm}/${i + 1}`);
        if (!hidden) refusals.push(`${at}: no hidden result`);
        else {
          const problem = recordProblem(hidden);
          if (problem) refusals.push(`${at}: ${problem}`);
          const tracePath = field(run, 'trace_path', 'tracePath');
          if (!hidden.binding) refusals.push(`${at}: the hidden result is not bound to a run`);
          else if (!tracePath || hidden.binding.trace_path !== tracePath) refusals.push(`${at}: the hidden result is bound to another run (${hidden.binding.trace_path})`);
          else if (!hidden.binding.run_id) refusals.push(`${at}: the hidden result records no run id`);
          else {
            const mismatch = verifyRun(hidden, run);
            if (mismatch) refusals.push(`${at}: ${mismatch}`);
          }
        }
        if (field(run, 'skipped_paid_graders', 'skippedPaidGraders')) refusals.push(`case ${name}, arm ${arm}, run ${i + 1}: paid graders were skipped`);
        const error = String(run?.error ?? '');
        if (field(run, 'ended_on_api_error', 'endedOnApiError') || (error && INFRASTRUCTURE.test(error))) refusals.push(`case ${name}, arm ${arm}, run ${i + 1}: infrastructure error (${error.slice(0, 120) || 'API error'})`);
        const row = {
          case: name,
          arm,
          run: i + 1,
          quality: hidden?.quality ?? null,
          hidden_checks_passed: hidden?.checks ? hidden.checks.filter((c) => c.ok === true).length : null,
          hidden_checks: hidden?.checks?.length ?? null,
          process_score: run?.score ?? null,
          verified_after_last_change: hidden?.process?.verified_after_last_change ?? null,
          cost_usd: field(run, 'cost_usd', 'costUsd') ?? null,
          duration_seconds: field(run, 'duration_seconds', 'durationSeconds') ?? null,
          tokens: tokensOf(hidden?.process?.usage),
          cache_read_tokens: hidden?.process?.usage?.cache_read_input_tokens ?? null,
          model: hidden?.process?.model ?? null,
          started_at: field(run, 'started_at', 'startedAt') ?? null,
          error: error || null,
        };
        raw.push(row);
        return row;
      });
      const quality = rows.map((r) => r.quality).filter((q) => q === 0 || q === 1);
      const complete = quality.filter((q) => q === 1).length;
      arms[arm] = {
        n: rows.length,
        quality_mean: round(mean(quality)),
        complete,
        pass_rate_ci80: wilson(complete, quality.length, 0.8).map((x) => round(x)),
        pass_rate_ci95: wilson(complete, quality.length, 0.95).map((x) => round(x)),
        process_score_mean: round(mean(rows.map((r) => r.process_score).filter(Number.isFinite))),
        cost_mean: round(mean(rows.map((r) => r.cost_usd).filter(Number.isFinite))),
        tokens_median: median(rows.map((r) => r.tokens).filter(Number.isFinite)),
        duration_median: median(rows.map((r) => r.duration_seconds).filter(Number.isFinite)),
        quality_runs: quality,
      };
    }
    cases.push({ name, class: def.class, ...arms, delta: round(arms.with.quality_mean - arms.without.quality_mean) });
  }
  for (const key of hiddenRuns.keys()) if (!used.has(key)) refusals.push(`hidden result ${key} has no run in the eval results`);
  if (refusals.length > 0) return { refused: [...new Set(refusals)] };

  const samples = cases.map((c) => ({ with: c.with.quality_runs, without: c.without.quality_runs }));
  const reps = bootstrap(samples, { replicates: pub.bootstrap.replicates, seed: pub.bootstrap.seed });
  const value = suiteDelta(samples);
  const ci = interval(reps, pub.bootstrap.interval).map((x) => round(x));
  const sensitivity = interval(reps, pub.bootstrap.sensitivity).map((x) => round(x));
  const costWith = mean(raw.filter((r) => r.arm === 'with').map((r) => r.cost_usd).filter(Number.isFinite));
  const costWithout = mean(raw.filter((r) => r.arm === 'without').map((r) => r.cost_usd).filter(Number.isFinite));
  const costDelta = (costWith - costWithout) / costWithout;
  const overhead = cases.filter((c) => pub.small_task_overhead.classes.includes(c.class)).map((c) => {
    const tokens = c.with.tokens_median / c.without.tokens_median;
    const wall = c.with.duration_median / c.without.duration_median;
    return {
      case: c.name,
      tokens_ratio: round(tokens),
      wall_time_ratio: round(wall),
      tokens_within: Number.isFinite(tokens) ? tokens <= pub.small_task_overhead.tokens_ratio_max : null,
      wall_time_within: Number.isFinite(wall) ? wall <= pub.small_task_overhead.wall_time_ratio_max : null,
    };
  });
  const runOrder = [...raw].filter((r) => r.started_at).sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))).map((r) => `${r.case}/${r.arm}/${r.run}`);
  const cache = (arm) => raw.filter((r) => r.arm === arm).reduce((n, r) => n + (Number(r.cache_read_tokens) || 0), 0);
  return {
    label: pub.label,
    n_per_arm: perArm,
    suite_lock: lock.sha256,
    primary: {
      statistic: pub.statistic,
      outcome: pub.primary_outcome,
      value: round(value),
      [`ci${Math.round(pub.bootstrap.interval * 100)}`]: ci,
      [`sensitivity_ci${Math.round(pub.bootstrap.sensitivity * 100)}`]: sensitivity,
      replicates: pub.bootstrap.replicates,
      seed: pub.bootstrap.seed,
      resample: pub.bootstrap.resample,
      scope: 'uncertainty for this fixed suite of cases; not a claim about other tasks',
    },
    quality_and_cost: {
      delta: round(value),
      delta_ci_lower: ci[0],
      cost_delta: round(costDelta),
      met: value > pub.quality_and_cost.delta_min_exclusive && ci[0] >= pub.quality_and_cost.delta_ci_lower_min && costDelta <= pub.quality_and_cost.cost_delta_max,
    },
    small_task_overhead: overhead,
    cases: cases.map(({ with: w, without: wo, ...rest }) => ({ ...rest, with: { ...w, quality_runs: undefined }, without: { ...wo, quality_runs: undefined } })),
    conditions: {
      claude_version: results.claudeVersion ?? results.claude_version,
      plugin: results.suite?.plugins?.[0] ? `${results.suite.plugins[0].name}@${results.suite.plugins[0].version ?? '?'}` : null,
      agent_models: [...new Set(raw.map((r) => r.model).filter(Boolean))],
      judge_model: results.suite?.judgeModel ?? 'harness default (haiku)',
      model_override: results.suite?.modelOverride ?? null,
      concurrency: results.suite?.concurrency ?? results.concurrency ?? null,
      node: report.node ?? null,
      confinement: report.confinement ?? null,
      run_order: runOrder,
      cache_read_tokens: { with: cache('with'), without: cache('without') },
      started_at: results.startedAt ?? results.started_at ?? null,
    },
    runs: raw,
  };
}

export function markdown(summary) {
  const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
  const lines = [
    `Quality delta (with - without), mean over ${summary.cases.length} cases: **${summary.primary.value}** `
      + `[80% CI ${summary.primary.ci80.join(', ')}; 95% ${summary.primary.sensitivity_ci95.join(', ')}]; cost delta ${pct(summary.quality_and_cost.cost_delta)}; ${summary.label}`,
    '',
    '| Case | Class | n/arm | Complete with | Complete without | Delta | Process with / without | Cost with / without |',
    '|---|---|---|---|---|---|---|---|',
    ...summary.cases.map((c) => `| ${c.name} | ${c.class} | ${c.with.n} | ${c.with.complete}/${c.with.n} | ${c.without.complete}/${c.without.n} | ${c.delta} | ${c.with.process_score_mean} / ${c.without.process_score_mean} | $${c.with.cost_mean} / $${c.without.cost_mean} |`),
    '',
    `Claude Code ${summary.conditions.claude_version}; agent model ${summary.conditions.agent_models.join(', ') || 'unknown'}; judge ${summary.conditions.judge_model}; concurrency ${summary.conditions.concurrency}.`,
  ];
  return `${lines.join('\n')}\n`;
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  const evals = opts.evals ?? defaultEvals();
  const hidden = opts.hidden ?? defaultHidden();
  if (opts.command === 'lock') {
    if (!opts.check) {
      writeLock({ evals, hidden });
      return 0;
    }
    const state = lockState({ evals, hidden });
    if (!state.current) process.stderr.write(`suite lock is stale: ${state.path} (run node scripts/eval-publish.mjs lock)\n`);
    return state.current ? 0 : 1;
  }
  const results = readJson(opts.results);
  const report = readJson(opts.report);
  if (!Array.isArray(results.cases)) throw new Invalid(`${opts.results}: not an eval result (no "cases" array)`);
  const resultsSha256 = createHash('sha256').update(readFileSync(opts.results)).digest('hex');
  const verifyRun = (hidden) => verifyKept(hidden.binding.trace_path, hidden.binding);
  const summary = summarize({ results, report, lock: lockState({ evals, hidden }), resultsSha256, verifyRun });
  if (summary.refused) {
    process.stderr.write(`publication refused:\n${summary.refused.map((r) => `- ${r}`).join('\n')}\n`);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return 1;
  }
  const text = `${JSON.stringify(summary, null, 2)}\n`;
  if (opts.out) writeFileSync(opts.out, text);
  else process.stdout.write(text);
  if (opts.markdown) writeFileSync(opts.markdown, markdown(summary));
  return 0;
}

const invoked = Boolean(process.argv[1]) && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invoked) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (err) {
    const known = err instanceof Invalid || err instanceof SuiteError;
    process.stderr.write(`eval-publish: ${known ? err.message : err.stack}\n`);
    process.exitCode = known ? 2 : 70;
  }
}
