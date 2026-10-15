// GC8 on a loaded machine (S3): a hook's time limit applies to its own CPU time (user + system, read with
// process.cpuUsage() in the hook process at exit), which load does not stretch; wall time is only a ceiling
// (WALL_CEILING_MS) that still catches a hang. The hook runs as `node --import <reporter> ...`: the reporter
// writes the CPU time to the file named by HOOK_CPU_OUT and leaves stdout and stderr alone. The spawn stays in
// the test file, whose module-level isolateProcessEnv() covers it (tests/isolation-guard.test.mjs).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const HOOK_CPU_LIMIT_MS = 1000;
export const WALL_CEILING_MS = 10000;
const REPORTER = `data:text/javascript,${encodeURIComponent("import { writeFileSync } from 'node:fs'; process.on('exit', () => { const u = process.cpuUsage(); writeFileSync(process.env.HOOK_CPU_OUT, String(Math.round((u.user + u.system) / 1000))); });")}`;

// For one node process: the arguments to put before its script, the env entry, and how to read its CPU time
// after it exited (NaN when it died before exit).
export function cpuProbe() {
  const dir = mkdtempSync(join(tmpdir(), 'hook-cpu-'));
  const file = join(dir, 'cpu');
  return {
    nodeArgs: ['--import', REPORTER],
    env: { HOOK_CPU_OUT: file },
    read: () => {
      let ms = Number.NaN;
      try { ms = Number(readFileSync(file, 'utf8')); } catch { /* no report */ }
      rmSync(dir, { recursive: true, force: true });
      return ms;
    },
  };
}

// run(probe) spawns node synchronously with probe.nodeArgs and probe.env; returns its result with ms (wall) and
// cpuMs.
export function measured(run) {
  const probe = cpuProbe();
  const started = performance.now();
  const r = run(probe);
  return { ...r, ms: Math.round(performance.now() - started), cpuMs: probe.read() };
}

// The GC8 check: CPU time under the limit, wall time under the ceiling.
export function assertFast(assert, r, what) {
  assert.ok(r.cpuMs < HOOK_CPU_LIMIT_MS, `${what}: ${r.cpuMs} ms of CPU`);
  assert.ok(r.ms < WALL_CEILING_MS, `${what}: ${r.ms} ms`);
}
