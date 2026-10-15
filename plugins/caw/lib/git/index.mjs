// Git boundary (spec §4.2, §4.3): the only module that spawns git. Argument arrays only, never a shell.
// Result shape matches lib/proc: { status, signal, stdout, stderr, error }.
import { spawnSync } from 'node:child_process';

const MAX_BUFFER = 16 * 1024 * 1024;

export function git(args, { cwd, env, timeoutMs = 30000 } = {}) {
  const r = spawnSync('git', args, {
    cwd, env, encoding: 'utf8', timeout: timeoutMs, maxBuffer: MAX_BUFFER, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let error = null;
  if (r.error) error = r.error.code === 'ENOENT' ? 'missing' : r.error.code === 'ETIMEDOUT' ? 'timeout' : 'failed';
  return { status: r.status, signal: r.signal, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error };
}

// Root of the working tree containing cwd, or null outside a repository.
export function topLevel(cwd, opts = {}) {
  const r = git(['rev-parse', '--show-toplevel'], { ...opts, cwd });
  return r.status === 0 ? r.stdout.trim() : null;
}
