#!/usr/bin/env node
// Trusted post-pass of the eval suite: decides, for every kept run, whether the task was completed. The
// harness's own graders stay process indicators; quality comes from here.
//
// For each run the workspace is copied (without .git and without links that leave it) and its .git is
// snapshotted for a trusted git reader. Then the case's completion checks run (evals-hidden/<case>/
// completion.json; scripts/eval-lib/checks.mjs lists the kinds):
// - Hidden tests (evals-hidden/<case>/*.test.mjs) and ports of the fixture's visible tests run in a trusted Node
//   process. It never loads candidate code: it calls the candidate's functions through a confined child process
//   over a JSON protocol (scripts/eval-lib/candidate.mjs). Candidate stdout and exit codes are never verdicts.
//   A missing answer, an early exit or a timeout fails the file. Hidden tests never enter the candidate's view.
// - The candidate's own test suite runs confined. A red suite fails the run; a green one proves nothing alone.
// - Static and history checks compare with the trusted baseline (the case fixture).
// Quality is 1 when every check passes, 0 when one fails; a check that cannot run leaves the run unchecked.
//
// Confinement: Node's permission model (Node >= 22.13) for every candidate process, plus sandbox-exec (macOS)
// or bwrap (Linux) when present; the child environment holds only PATH and TZ. Without the permission model
// the post-pass refuses, unless --allow-unconfined is given (recorded in the report).
//
// Kept run layout (the harness seals it read-only): <root>/out/trace.jsonl is the run's trace path and the
// workspace is <root>/sealed/home/cwd (or <root>/home/cwd when unsealed). Read access is added to <root> and
// <root>/sealed for the copy and the original modes are restored afterwards; nothing runs in place.
//
// Usage:
//   node scripts/eval-hidden.mjs --results <file> [--case <name>] [options]
//   node scripts/eval-hidden.mjs --workspace <dir> --case <name> [--trace <file>] [options]
//   --results <file>     aggregate-result.json of an eval run, or the file its --json option wrote (runs in
//                        cases[].arms.with/without with tracePath; runs/runs_without with trace_path also read)
//   --workspace <dir>    check one workspace directory instead (for example a fixture with a change applied)
//   --trace <file>       trace for --workspace (checks that need one are unchecked without it)
//   --case <name>        the case to check (required with --workspace)
//   --evals <dir>        the eval suite (default: plugins/<plugin>/evals of this repository)
//   --hidden <dir>       hidden tests and completion definitions, one directory per case (default: evals-hidden/)
//   --out <file>         write the JSON report to <file> instead of stdout
//   --timeout <s>        limit per trusted test file and per suite run, in seconds (default 120)
//   --allow-unconfined   run candidate code even without Node's permission model (recorded)
// Report: confinement, the suite lock state, the results file and its sha256, per case and arm the
// complete/incomplete/unchecked counts, and per run {case, arm, run, status: pass|fail|unchecked, quality, checks[],
// process{...}, hidden_exposed, binding}. binding = {trace_path, run_id (the harness session), trace_sha256,
// workspace_sha256}: the run's trace and final workspace, hashed before any check; scripts/eval-publish.mjs
// re-hashes the kept run and refuses a result that does not match its run.
// Exit: 0 report written, every run checked · 1 report written, some run unchecked (no kept workspace: the
// eval ran without --keep-temp; a check could not run) · 2 usage or input error, or unconfined execution
// refused · 70 internal error
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { runChecks } from './eval-lib/checks.mjs';
import { Refused, command, decide, detect } from './eval-lib/confine.mjs';
import { gitReader, snapshotGit } from './eval-lib/git.mjs';
import { keptRun, traceHash, withReadable, workspaceHash, workspaceOf } from './eval-lib/kept.mjs';
import { lockState } from './eval-lib/lock.mjs';
import { SuiteError, defaultEvals, defaultHidden, readCase, readCompletion } from './eval-lib/suite.mjs';
import { parseTrace, verifiedAfterLastChange } from './eval-lib/trace.mjs';

const LIB = join(dirname(fileURLToPath(import.meta.url)), 'eval-lib');
const HOST = join(LIB, 'candidate-host.mjs');
const REPORTER = join(LIB, 'reporter.mjs');
const CLIENT_URL = pathToFileURL(join(LIB, 'candidate.mjs')).href;
const USAGE = [
  'usage: node scripts/eval-hidden.mjs --results <file> [--case <name>] [options]',
  '       node scripts/eval-hidden.mjs --workspace <dir> --case <name> [--trace <file>] [options]',
  'options: --evals <dir> --hidden <dir> --out <file> --timeout <s> --allow-unconfined',
  '',
].join('\n');
const OUTPUT_TAIL = 4000;

class Invalid extends Error {}

function parseArgs(argv) {
  const opts = { results: null, workspace: null, trace: null, caseName: null, evals: null, hidden: null, out: null, timeout: 120, allowUnconfined: false, help: false };
  const value = (i, flag) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Invalid(`${flag} needs a value\n${USAGE}`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--allow-unconfined') opts.allowUnconfined = true;
    else if (arg === '--results') opts.results = resolve(value(i++, arg));
    else if (arg === '--workspace') opts.workspace = resolve(value(i++, arg));
    else if (arg === '--trace') opts.trace = resolve(value(i++, arg));
    else if (arg === '--case') opts.caseName = value(i++, arg);
    else if (arg === '--evals') opts.evals = resolve(value(i++, arg));
    else if (arg === '--hidden') opts.hidden = resolve(value(i++, arg));
    else if (arg === '--out') opts.out = resolve(value(i++, arg));
    else if (arg === '--timeout') {
      const seconds = Number(value(i++, arg));
      if (!Number.isInteger(seconds) || seconds < 1) throw new Invalid(`--timeout must be a positive whole number of seconds\n${USAGE}`);
      opts.timeout = seconds;
    } else throw new Invalid(`unknown argument: ${arg}\n${USAGE}`);
  }
  if (opts.help) return opts;
  if (!opts.results === !opts.workspace) throw new Invalid(`give exactly one of --results and --workspace\n${USAGE}`);
  if (opts.workspace && !opts.caseName) throw new Invalid(`--workspace needs --case\n${USAGE}`);
  if (opts.trace && !opts.workspace) throw new Invalid(`--trace goes with --workspace (kept runs bring their own)\n${USAGE}`);
  if (opts.caseName !== null && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(opts.caseName)) throw new Invalid(`invalid case name ${opts.caseName}`);
  return opts;
}

const isDir = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};




// Copies the workspace without .git and without links that leave it; links to files inside become files.
function copyTree(src, dst, top, notes) {
  mkdirSync(dst, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    const rel = relative(top, from);
    if (entry.name === '.git') continue;
    if (entry.isSymbolicLink()) {
      let target;
      try { target = realpathSync(from); } catch { notes.push(`skipped dangling link ${rel}`); continue; }
      if (!inside(realpathSync(top), target)) { notes.push(`skipped link leaving the workspace: ${rel}`); continue; }
      if (statSync(target).isFile()) copyFileSync(target, to);
      else notes.push(`skipped directory link ${rel}`);
    } else if (entry.isDirectory()) {
      copyTree(from, to, top, notes);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

function tapCounts(output) {
  const pick = (name) => {
    const m = new RegExp(`^# ${name} (\\d+)\\s*$`, 'm').exec(output);
    return m ? Number(m[1]) : 0;
  };
  return { pass: pick('pass'), fail: pick('fail') };
}

function readEvents(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

// Everything one run's checks need, built over a private scratch directory.
function evaluate({ caseName, workspace, traceText, evals, hidden, conf, timeoutMs }) {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'eval-run-')));
  const notes = [];
  let git = null;
  try {
    const ws = join(scratch, 'ws');
    copyTree(workspace, ws, workspace, notes);
    const gitDir = snapshotGit(workspace, scratch);
    if (gitDir) git = gitReader(gitDir, ws);
    else notes.push('the workspace has no git repository');
    const candidateTmp = join(scratch, 'candidate-tmp');
    const trusted = join(scratch, 'trusted');
    mkdirSync(candidateTmp);
    mkdirSync(trusted);
    const host = command(conf, { script: HOST, args: [ws], read: [ws, LIB], write: [candidateTmp], cwd: ws });
    const configFile = join(trusted, 'candidate.json');
    writeFileSync(configFile, JSON.stringify({ root: ws, scratch: candidateTmp, ...host, callTimeoutMs: 10000 }));
    let n = 0;
    const runTrusted = (file) => {
      const events = join(trusted, `events-${++n}.jsonl`);
      const r = spawnSync(process.execPath, [`--test-reporter=${REPORTER}`, `--test-reporter-destination=${events}`, file], {
        cwd: trusted,
        env: { PATH: process.env.PATH ?? '', TZ: 'UTC', EVAL_CANDIDATE_CONFIG: configFile },
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      });
      const list = readEvents(events).filter((e) => e.nesting === 0);
      const pass = list.filter((e) => e.type === 'pass' && !e.skip && !e.todo).length;
      const fail = list.filter((e) => e.type === 'fail').length;
      const skipped = list.filter((e) => e.skip || e.todo).length;
      const timedOut = r.error?.code === 'ETIMEDOUT' || (r.signal !== null && r.status === null);
      const ok = r.status === 0 && !timedOut && fail === 0 && skipped === 0 && pass > 0;
      return {
        status: ok ? 'pass' : 'fail',
        pass,
        fail,
        ...(skipped && { skipped }),
        exit: r.status,
        ...(timedOut && { timed_out: true }),
        ...(!ok && {
          failures: list.filter((e) => e.type === 'fail').slice(0, 20).map((e) => `${e.name}: ${e.error ?? ''}`.slice(0, 500)),
          stderr: String(r.stderr ?? '').slice(-OUTPUT_TAIL),
        }),
      };
    };
    const runSuite = () => {
      const spec = command(conf, { args: ['--test', ...(conf.test_isolation ? [conf.test_isolation] : []), '--test-reporter=tap'], read: [ws], write: [candidateTmp], cwd: ws });
      const r = spawnSync(spec.command, spec.args, { cwd: ws, env: spec.env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
      return { exit: r.status, ...tapCounts(String(r.stdout ?? '')), reported_by: 'candidate' };
    };
    const completion = readCompletion(hidden, caseName);
    const trace = traceText === null ? null : parseTrace(traceText);
    const checks = runChecks(completion, {
      ws,
      fixture: join(evals, caseName, 'fixture'),
      hiddenDir: join(hidden, caseName),
      caseDef: readCase(evals, caseName),
      trace,
      git,
      clientUrl: CLIENT_URL,
      trustedTmp: trusted,
      runTrusted,
      runSuite,
    });
    const status = checks.some((c) => c.ok === null) ? 'unchecked' : checks.every((c) => c.ok) ? 'pass' : 'fail';
    return {
      status,
      quality: status === 'unchecked' ? null : status === 'pass' ? 1 : 0,
      checks,
      process: trace ? {
        verified_after_last_change: verifiedAfterLastChange(trace),
        tool_calls: trace.toolUses.length,
        model: trace.model,
        num_turns: trace.numTurns,
        usage: trace.usage,
      } : null,
      notes,
    };
  } finally {
    git?.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

// The harness's session id of a run, from its trace's init event.
function runId(traceText) {
  if (traceText === null) return null;
  const init = parseTrace(traceText).events.find((e) => e.type === 'system' && e.subtype === 'init');
  return typeof init?.session_id === 'string' && init.session_id ? init.session_id : null;
}

function exposure(traceText, hiddenRoot, caseName) {
  if (traceText === null) return null;
  const dir = join(hiddenRoot, caseName);
  const tests = isDir(dir) ? readdirSync(dir).filter((f) => /\.test\.mjs$/.test(f)) : [];
  const root = basename(hiddenRoot);
  return [`${root}/${caseName}`, `${root}${sep}${caseName}`, ...tests].some((needle) => traceText.includes(needle));
}

function loadResults(file) {
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (err) { throw new Invalid(`${file}: ${err.message}`); }
  if (!data || !Array.isArray(data.cases)) throw new Invalid(`${file}: not an eval result (no "cases" array)`);
  return data;
}

function runsOf(entry) {
  const arms = [['with', entry.runs ?? entry.arms?.with ?? []], ['without', entry.runs_without ?? entry.arms?.without ?? []]];
  return arms.flatMap(([arm, runs]) => (Array.isArray(runs) ? runs : []).map((run, i) => ({
    arm, run: i + 1, trace: run?.trace_path ?? run?.tracePath ?? '', score: run?.score ?? null,
  })));
}

function plan(opts, hidden) {
  if (opts.workspace) {
    if (!readCompletion(hidden, opts.caseName)) throw new Invalid(`no completion definition for case "${opts.caseName}" in ${hidden}`);
    if (!isDir(opts.workspace)) throw new Invalid(`workspace ${opts.workspace} is not a directory`);
    if (opts.trace && !existsSync(opts.trace)) throw new Invalid(`trace ${opts.trace} does not exist`);
    return { source: { workspace: opts.workspace }, items: [{ caseName: opts.caseName, arm: 'workspace', run: 1, workspace: opts.workspace }], without: [] };
  }
  if (!existsSync(opts.results)) throw new Invalid(`results file ${opts.results} does not exist`);
  const data = loadResults(opts.results);
  const entries = data.cases.filter((entry) => !opts.caseName || entry.name === opts.caseName);
  if (opts.caseName && entries.length === 0) throw new Invalid(`no case "${opts.caseName}" in ${opts.results}`);
  const items = [];
  const without = [];
  for (const entry of entries) {
    const name = String(entry.name);
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || !readCompletion(hidden, name)) { without.push(name); continue; }
    for (const r of runsOf(entry)) items.push({ caseName: name, ...r, kept: keptRun(r.trace) });
  }
  if (entries.length > 0 && without.length === entries.length) throw new Invalid(`no case of ${opts.results} has a completion definition in ${hidden} (pass --hidden)`);
  const resultsSha = createHash('sha256').update(readFileSync(opts.results)).digest('hex');
  return { source: { results: opts.results, results_sha256: resultsSha, partial: data.partial === true }, items, without };
}

function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  const evals = opts.evals ?? defaultEvals();
  const hidden = opts.hidden ?? defaultHidden();
  for (const [flag, dir] of [['--evals', evals], ['--hidden', hidden]]) if (!isDir(dir)) throw new Invalid(`${flag} directory ${dir} does not exist`);
  let conf;
  try {
    conf = decide(detect(), { allowUnconfined: opts.allowUnconfined });
  } catch (err) {
    if (err instanceof Refused) throw new Invalid(err.message);
    throw err;
  }
  const { source, items, without } = plan(opts, hidden);
  let lock;
  try {
    const state = lockState({ evals, hidden });
    lock = { sha256: state.sha256, current: state.current };
  } catch (err) {
    lock = { error: err.message };
  }
  const timeoutMs = opts.timeout * 1000;
  const runs = [];
  for (const item of items) {
    const base = { case: item.caseName, arm: item.arm, run: item.run, ...(item.score !== undefined && item.score !== null && { score: item.score }) };
    let result;
    let traceText = null;
    try {
      if (item.workspace) {
        traceText = opts.trace ? readFileSync(opts.trace, 'utf8') : null;
        const binding = { trace_path: null, run_id: runId(traceText), trace_sha256: traceHash(traceText), workspace_sha256: workspaceHash(item.workspace) };
        result = { ...evaluate({ caseName: item.caseName, workspace: item.workspace, traceText, evals, hidden, conf, timeoutMs }), binding };
      } else if (!item.kept || !existsSync(item.kept.root)) {
        result = { status: 'unchecked', quality: null, reason: 'no kept run directory (run the eval with --keep-temp)' };
      } else {
        result = withReadable(item.kept.root, () => {
          traceText = existsSync(item.kept.trace) ? readFileSync(item.kept.trace, 'utf8') : null;
          const ws = workspaceOf(item.kept.root);
          if (!ws) return { status: 'unchecked', quality: null, reason: `no workspace under ${item.kept.root}` };
          // The binding is taken before the checks: the run's final trace and workspace, as the harness left them.
          const binding = { trace_path: item.kept.trace, run_id: runId(traceText), trace_sha256: traceHash(traceText), workspace_sha256: workspaceHash(ws) };
          return { ...evaluate({ caseName: item.caseName, workspace: ws, traceText, evals, hidden, conf, timeoutMs }), binding };
        });
      }
    } catch (err) {
      result = { status: 'unchecked', quality: null, reason: `could not check: ${err.message}` };
    }
    runs.push({ ...base, ...result, hidden_exposed: exposure(traceText, hidden, item.caseName), ...(item.kept && { kept: item.kept.root }) });
  }
  const cases = {};
  for (const r of runs) {
    const arm = ((cases[r.case] ??= {})[r.arm] ??= { runs: 0, complete: 0, incomplete: 0, unchecked: 0 });
    arm.runs += 1;
    if (r.status === 'unchecked') arm.unchecked += 1;
    else arm[r.status === 'pass' ? 'complete' : 'incomplete'] += 1;
  }
  const report = {
    schema_version: 2,
    generated_at: new Date().toISOString(),
    node: process.version,
    confinement: conf,
    suite_lock: lock,
    source,
    ...(without.length > 0 && { cases_without_completion: without }),
    cases,
    runs,
  };
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (opts.out) writeFileSync(opts.out, text);
  else process.stdout.write(text);
  for (const [name, arms] of Object.entries(cases)) {
    const parts = Object.entries(arms).map(([arm, s]) => `${arm} ${s.complete}/${s.runs}${s.unchecked ? ` (${s.unchecked} unchecked)` : ''}`);
    process.stderr.write(`completion ${name}: ${parts.join(', ')}\n`);
  }
  if (without.length > 0) process.stderr.write(`no completion definition: ${without.join(', ')}\n`);
  return runs.some((r) => r.status === 'unchecked') ? 1 : 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  const known = err instanceof Invalid || err instanceof SuiteError;
  process.stderr.write(`eval-hidden: ${known ? err.message : err.stack}\n`);
  process.exitCode = known ? 2 : 70;
}
