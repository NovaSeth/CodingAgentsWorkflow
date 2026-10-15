// Receipts unit (spec §4.2, §5.1, §7.11, SD-23, SC16, ruling R70): tokens and estimated cost of a task or of one
// external run, from the repository's Claude Code transcripts (lib/receipts/sessions.mjs) and run records (runs.mjs).
// Money is whole micro-dollars (costMicroUsd), durations whole milliseconds (wallMs).
//   taskReceipt(id, ctx) → { receipt (spec §7.11 schema, the RECEIPT kind), problems, warnings, where }; reads only
//   saveReceipt(receipt, { where, names }) → { saved, kept, file }: receipts/<task>.json through lib/state
//   runReceipt(id, ctx)  → { run }; reads only
//   totals({ task } | { run }, ctx) → { task | run, tokens, costMicroUsd, partial }: for the loop's budget caps; reads only
//   costSince(startedAt, ctx) → { costMicroUsd, partial, unmeasurable, problems }: the repository's spending since a
//     time (the loop's cost cap, spec §7.7); reads only
//   readRuns(dir) (runs.mjs) → { runs, problems }: the run records, also for the loop's live-run check
// ctx = { cwd, env, names }. A task's tokens: its requests (attributed in sessions.mjs) and its external runs; its
// cost: each request priced by prices.json (rounded to a whole micro-dollar) plus the runs' own costs. `partial` is
// true when something could not be read or priced: the numbers are then a lower bound, `problems` says what is
// missing. In an inactive repository there is no task document and no run record: the receipt comes from the
// transcripts alone (class and rounds null). Fields whose source unit does not exist yet are null: tier (engine),
// gates (verify), defectsBeforeMerge (review records), processOverhead.hookInjectedChars.
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { KINDS, PATTERNS, StateError, open, resolve } from '../state/index.mjs';
import { RECEIPT } from './kind.mjs';
import { PRICES, priceOf, requestMicroUsd } from './prices.mjs';
import { RUN_ID, readRuns } from './runs.mjs';
import { MAIN, label, readLedger, slug } from './sessions.mjs';

export { PRICES, RECEIPT, RUN_ID, priceOf, readRuns, requestMicroUsd, slug };

const STORE_KINDS = Object.freeze({ ...KINDS, [RECEIPT.name]: RECEIPT });
const zero = () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
const collapse = (t) => ({ input: t.input, output: t.output, cacheRead: t.cacheRead, cacheWrite: t.cacheWrite5m + t.cacheWrite1h });
const add = (sum, t) => { for (const k of Object.keys(sum)) sum[k] += t[k]; return sum; };
const tokenSum = (t) => t.input + t.output + t.cacheRead + t.cacheWrite;
const usage = (code, message, hint) => new StateError(code, 'USAGE', message, { hint });
const semver = (v) => v.split('.').map(Number);
const newer = (a, b) => { const [x, y] = [semver(a), semver(b)]; for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const rank = (g) => (g.agentType === MAIN ? 0 : 1); // the main session first

// The receipt of `task` ({ id, class, round } of its task.json) from a ledger (sessions.mjs readLedger) and run records.
export function buildReceipt({ task, ledger, runs, names }) {
  const wrapper = `${names.plugin}:external`;
  const problems = [...ledger.problems, ...runs.problems];
  const mine = ledger.requests.filter((r) => r.task === task.id);
  const external = runs.runs.filter((r) => r.task === task.id);
  const tokens = zero();
  const wrapperTokens = zero();
  const groups = new Map();
  const unpriced = new Set();
  let cost = 0;
  for (const r of mine) {
    const t = collapse(r.tokens);
    const c = requestMicroUsd(r.model, r.tokens);
    const model = label(r.model);
    if (c === null) unpriced.add(model);
    const key = `${r.agentType}\n${model}`;
    if (!groups.has(key)) groups.set(key, { agentType: r.agentType, model, tokens: zero(), costMicroUsd: 0 });
    const g = groups.get(key);
    add(g.tokens, t);
    g.costMicroUsd += c ?? 0;
    add(tokens, t);
    cost += c ?? 0;
    if (r.agentType === wrapper) add(wrapperTokens, t);
  }
  for (const m of unpriced) problems.push({ code: 'model-unpriced', message: `${task.id}: model ${m} is not in the price table of ${PRICES.date}; its tokens count, its cost does not`, hint: 'add the model to lib/receipts/prices.json' });
  for (const e of external) {
    if (e.tokens) add(tokens, e.tokens);
    cost += e.costMicroUsd ?? 0;
  }
  const times = [...mine.map((r) => r.at), ...external.flatMap((e) => [e.startedAt, e.endedAt])].filter(Boolean).sort();
  const startedAt = times[0] ?? null;
  const endedAt = times[times.length - 1] ?? null;
  const versions = [...ledger.versions].sort(newer);
  const byAgent = [...groups.values()]
    .sort((a, b) => rank(a) - rank(b) || a.agentType.localeCompare(b.agentType, 'en') || a.model.localeCompare(b.model, 'en'));
  const receipt = {
    schema: RECEIPT.version, task: task.id, class: task.class, tier: null, startedAt, endedAt,
    wallMs: startedAt ? Date.parse(endedAt) - Date.parse(startedAt) : null,
    tokens, costMicroUsd: cost, byAgent,
    external: external.map((e) => ({ provider: e.provider, runId: e.runId, model: e.model, tokens: e.tokens, tokensReason: e.tokensReason, costMicroUsd: e.costMicroUsd, wallMs: e.wallMs, exit: e.exit })),
    rounds: task.round, gates: null, defectsBeforeMerge: null,
    processOverhead: { wrapperTokens, hookInjectedChars: null },
    priceTable: PRICES.date, source: versions.length ? `transcripts@${versions[versions.length - 1]}` : 'transcripts',
    partial: problems.length > 0,
  };
  const warnings = ledger.found ? [] : [{ code: 'no-transcripts', message: 'no Claude Code transcripts found for this repository or its worktrees', hint: 'transcripts live in $CLAUDE_CONFIG_DIR/projects (default ~/.claude/projects)' }];
  return { receipt, problems, warnings };
}

export function taskReceipt(id, { cwd, env, names }) {
  if (typeof id !== 'string' || !PATTERNS.taskId.test(id)) throw usage('invalid-value', `not a task ID: ${String(id).slice(0, 60)}`, 'a task ID is T-<handle>-<number>');
  const where = resolve({ cwd, env, names });
  let task = { id, class: null, round: null };
  let runs = { runs: [], problems: [] };
  if (where.active) {
    task = open(where.dir, { names }).read('task', id);
    if (!task) throw usage('task-unknown', `no task ${id} in ${where.dir}`, `'${names.bin} task list' lists the tasks`);
    runs = readRuns(join(where.local, 'runs'));
  }
  const ledger = readLedger({ repo: where.repo, env, bin: names.bin });
  return { ...buildReceipt({ task, ledger, runs, names }), where };
}

// Writes the receipt of an active repository through lib/state under the store lock. Unchanged → no write. Fewer
// tokens than the saved receipt (transcripts cleaned up, or another machine without them) → the saved one is kept.
export function saveReceipt(receipt, { where, names }) {
  const store = open(where.dir, { names, kinds: STORE_KINDS });
  let outcome = 'unchanged';
  store.update(RECEIPT.name, receipt.task, (cur) => {
    if (cur && isDeepStrictEqual(cur, receipt)) return undefined;
    if (cur && tokenSum(receipt.tokens) < tokenSum(cur.tokens)) { outcome = 'kept'; return undefined; }
    outcome = 'saved';
    return receipt;
  });
  return { saved: outcome === 'saved', kept: outcome === 'kept', file: join(where.dir, RECEIPT.path(receipt.task)) };
}

export function runReceipt(id, { cwd, env, names }) {
  if (typeof id !== 'string' || !RUN_ID.test(id)) throw usage('invalid-value', `not a run ID: ${String(id).slice(0, 60)}`, 'a run ID is <provider>-<task>-<role>-<n>');
  const where = resolve({ cwd, env, names });
  const { runs, problems } = readRuns(join(where.local, 'runs'));
  const run = runs.find((r) => r.runId === id);
  if (!run) {
    const bad = problems.find((p) => p.message.includes(`/${id}.json:`));
    if (bad) throw new StateError(bad.code, 'FAIL', bad.message, { hint: bad.hint });
    throw usage('run-unknown', `no run record ${id} in ${join(where.local, 'runs')}`, 'external runs are recorded by the exec command');
  }
  const { startedAt, endedAt, ...rest } = run;
  return { run: rest };
}

// Totals for the loop's budget caps (spec §7.7): { task, tokens, costMicroUsd, partial } or { run, task, tokens,
// costMicroUsd, partial }. Writes nothing. Throws a StateError (USAGE) for an unknown ID.
export function totals(scope, ctx) {
  if (typeof scope?.task === 'string') {
    const { receipt } = taskReceipt(scope.task, ctx);
    return { task: receipt.task, tokens: receipt.tokens, costMicroUsd: receipt.costMicroUsd, partial: receipt.partial };
  }
  if (typeof scope?.run === 'string') {
    const { run } = runReceipt(scope.run, ctx);
    return { run: run.runId, task: run.task, tokens: run.tokens, costMicroUsd: run.costMicroUsd, partial: false };
  }
  throw new TypeError('receipts.totals: give a task or a run: { task: <id> } or { run: <id> }');
}

// The cost of the repository's work since `startedAt` (an ISO time), for the loop's cost cap (spec §7.7, SD-17, R70):
// every request of the repository's transcripts made at or after it, of any task or none, priced like a receipt, plus
// the full cost of every external run live at that time or started later (only a run that ended before it is left
// out: counting a run that overlaps the start in full is the safe side of a cap). Whole micro-dollars. A
// request without a time is left out. `partial`: a source is missing or something could not be read or priced, so the
// cost is a lower bound (`problems` says what); `unmeasurable`: no transcript was found or none could be read, so the
// cost is not measured at all (never a complete zero). `where` (resolve()) may be passed to spare a second git call.
// Writes nothing.
export function costSince(startedAt, { cwd, env, names, where = null }) {
  const since = typeof startedAt === 'string' ? Date.parse(startedAt) : NaN;
  if (Number.isNaN(since)) throw new TypeError('receipts.costSince: startedAt must be an ISO time');
  const at = where ?? resolve({ cwd, env, names });
  const ledger = readLedger({ repo: at.repo, env, bin: names.bin });
  const dir = join(at.local, 'runs');
  let runs = { runs: [], problems: [] };
  try { if (at.active) runs = readRuns(dir); } catch (err) {
    runs = { runs: [], problems: [{ code: 'run-unreadable', message: `${dir}: ${err.code ?? err.message}`, hint: 'check the directory permissions; the cost is a lower bound' }] };
  }
  const problems = [...ledger.problems, ...runs.problems];
  if (!ledger.found) problems.unshift({ code: 'no-transcripts', message: `no Claude Code transcripts found for ${at.repo} or its worktrees: their cost is not counted`, hint: 'transcripts live in $CLAUDE_CONFIG_DIR/projects (default ~/.claude/projects)' });
  const unpriced = new Set();
  let cost = 0;
  for (const r of ledger.requests) {
    if (!r.at || Date.parse(r.at) < since) continue;
    const c = requestMicroUsd(r.model, r.tokens);
    if (c === null) unpriced.add(label(r.model));
    else cost += c;
  }
  for (const m of unpriced) problems.push({ code: 'model-unpriced', message: `model ${m} is not in the price table of ${PRICES.date}; its tokens count, its cost does not`, hint: 'add the model to lib/receipts/prices.json' });
  for (const e of runs.runs) if (!(e.endedAt && Date.parse(e.endedAt) < since)) cost += e.costMicroUsd ?? 0;
  const unmeasurable = !ledger.found || (ledger.requests.length === 0 && ledger.problems.length > 0);
  return { costMicroUsd: cost, partial: problems.length > 0, unmeasurable, problems };
}
