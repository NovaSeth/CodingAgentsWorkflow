// Kept runs of `claude plugin eval --keep-temp`: <root>/out/trace.jsonl is a run's trace path and the workspace is
// <root>/sealed/home/cwd (or <root>/home/cwd when unsealed). The harness seals the directory read-only; reading
// adds owner read+search to <root> and <root>/sealed for the duration and restores the modes. A run is bound to
// its hidden result by the hash of its trace and of its final workspace (every file, .git included).
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const isDir = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };

export function keptRun(tracePath) {
  if (typeof tracePath !== 'string' || !tracePath) return null;
  const out = dirname(tracePath);
  if (basename(out) !== 'out') return null;
  return { root: dirname(out), trace: tracePath };
}

export function withReadable(root, fn) {
  const restore = [];
  try {
    for (const dir of [root, join(root, 'sealed')]) {
      let st;
      try { st = lstatSync(dir); } catch { continue; }
      if (!st.isDirectory()) continue;
      const mode = st.mode & 0o7777;
      if ((mode & 0o500) !== 0o500) {
        chmodSync(dir, mode | 0o500);
        restore.unshift([dir, mode]);
      }
    }
    return fn();
  } finally {
    for (const [dir, mode] of restore) {
      try { chmodSync(dir, mode); } catch { /* the caller's result stands */ }
    }
  }
}

export function workspaceOf(root) {
  for (const candidate of [join(root, 'sealed', 'home', 'cwd'), join(root, 'home', 'cwd')]) {
    if (isDir(candidate)) return candidate;
  }
  return null;
}

// Content hash of a workspace as the run left it: sorted relative paths with the hash of each file or link target.
export function workspaceHash(dir) {
  const entries = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const rel = relative(dir, p).split(sep).join('/');
      if (e.isSymbolicLink()) entries.push(`${rel}\0link\0${readlinkSync(p)}`);
      else if (e.isDirectory()) walk(p);
      else if (e.isFile()) entries.push(`${rel}\0${sha256(readFileSync(p))}`);
    }
  };
  walk(dir);
  return sha256(entries.sort().join('\n'));
}

export const traceHash = (text) => (text === null || text === undefined ? null : sha256(text));

// Re-reads a kept run and compares it with the binding a hidden result recorded. Returns null or the reason.
export function verifyKept(tracePath, binding) {
  const kept = keptRun(tracePath);
  if (!kept || !existsSync(kept.root)) return 'the kept run directory is gone, so the hidden result cannot be re-verified';
  return withReadable(kept.root, () => {
    const trace = existsSync(kept.trace) ? readFileSync(kept.trace, 'utf8') : null;
    if (traceHash(trace) !== binding.trace_sha256) return 'trace changed or replaced since the post-pass';
    const ws = workspaceOf(kept.root);
    if (!ws) return 'the kept workspace is gone';
    if (workspaceHash(ws) !== binding.workspace_sha256) return 'workspace changed since the post-pass';
    return null;
  });
}
