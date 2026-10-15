// The suite lock (plugins/<plugin>/evals/suite.lock.json): what a published comparison is computed from, frozen
// before any publication run. It holds the publication rules (primary outcome, statistic, bootstrap, intervals,
// exclusions, thresholds), and per case the class, completion checks, process indicators (the harness graders,
// with weights and arms) and content hashes of the case and of its hidden tests. A change to any of them changes
// the lock, and eval-publish refuses results produced under another lock.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { completionProblems } from './checks.mjs';
import { CLASSES, SuiteError, caseNames, readCase, readCompletion, sha256, treeHash } from './suite.mjs';

export const LOCK_VERSION = 1;

export const PUBLICATION = {
  primary_outcome: 'quality: 1 for a run whose every completion check passes, else 0',
  statistic: 'mean over cases of (mean quality with the plugin - mean quality without it)',
  bootstrap: { replicates: 10000, seed: 1729, interval: 0.8, sensitivity: 0.95, resample: 'runs within each case x arm' },
  pass_rate_interval: 'wilson',
  runs_per_arm: 5,
  label: 'pilot: 5 runs per arm, indicative only',
  exclusions: [
    'the suite is refused if the lock is stale or differs from the one the hidden report was produced under',
    'the suite is refused if it is partial, a case or run is missing, or an arm has a different number of runs',
    'the suite is refused if any hidden check is unchecked, a run skipped paid graders, or a run ended on an infrastructure error',
    'the suite is refused if candidate code ran unconfined',
    'task failures (wrong code, max turns, timeouts) are kept as failures',
  ],
  process_indicators: 'harness grader scores and trace indicators, published separately from quality',
  small_task_overhead: { classes: ['trivial'], tokens_ratio_max: 1.15, wall_time_ratio_max: 1.25, statistic: 'median with / median without, per case' },
  quality_and_cost: { delta_ci_lower_min: 0, delta_min_exclusive: 0, cost_delta_max: 0.3 },
};

export const lockPath = (evals) => join(evals, 'suite.lock.json');

export function buildLock({ evals, hidden }) {
  const cases = {};
  for (const name of caseNames(evals)) {
    const def = readCase(evals, name);
    const completion = readCompletion(hidden, name);
    if (!completion) throw new SuiteError(`case ${name} has no completion.json`);
    const problems = completionProblems(completion);
    if (problems.length) throw new SuiteError(`case ${name}: ${problems.join('; ')}`);
    const klass = (def.tags ?? []).filter((t) => CLASSES.includes(t));
    if (klass.length !== 1) throw new SuiteError(`case ${name}: exactly one class tag of ${CLASSES.join(', ')}`);
    cases[name] = {
      class: klass[0],
      runs: def.runs,
      max_turns: def.execution?.max_turns ?? null,
      completion: completion.checks,
      process: (def.graders ?? []).map((g) => ({ name: g.name, type: g.type, weight: g.weight ?? 1, arm: g.arm ?? 'both' })),
      sha256: { case: treeHash(join(evals, name)), hidden: treeHash(join(hidden, name)) },
    };
  }
  const body = { version: LOCK_VERSION, publication: PUBLICATION, cases };
  return { ...body, suite_sha256: sha256(JSON.stringify(body)) };
}

export const renderLock = (lock) => `${JSON.stringify(lock, null, 2)}\n`;

export function lockState({ evals, hidden }) {
  const path = lockPath(evals);
  const built = buildLock({ evals, hidden });
  const current = existsSync(path) && readFileSync(path, 'utf8') === renderLock(built);
  return { path, sha256: built.suite_sha256, current, lock: built };
}

export function writeLock({ evals, hidden }) {
  const built = buildLock({ evals, hidden });
  writeFileSync(lockPath(evals), renderLock(built));
  return built;
}
