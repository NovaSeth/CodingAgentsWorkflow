// State directory resolution (spec §5.3, §7.2, SD-7, SD-36, REV-58): the repository is the git top level of the
// target directory (real path); its state directory is <repo>/<stateDir of name.json>, or the external
// directory linked for that real path in machine data projects.json (`init --state-dir`, for repositories that
// must stay clean). Context comes only from the arguments: the target cwd and the env passed in.
// Resolution reads and never writes: no state directory, no machine data directory (GC2, zero footprint).
// updateProject is the only writer of projects.json: read-modify-write under its lock (projects.lock, lib/fsx)
// with every check inside; an older projects.json is read through the migration chain and written back at the
// current schema. A refusal leaves nothing (the lock and a machine data directory it created are removed).
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, sep } from 'node:path';
import { unlockStale as fsxUnlockStale, withLock, writeAtomic } from '../fsx/index.mjs';
import { git } from '../git/index.mjs';
import { checkWrite, parseDoc, requireArg } from './document.mjs';
import { StateError } from './errors.mjs';
import { MACHINE_KINDS } from './kinds.mjs';
import { MIGRATIONS } from './migrations/index.mjs';
import { format } from './schema.mjs';
import { busyFailure, lockFailure } from './store.mjs';
import { upgradeDoc } from './upgrade.mjs';

const PROJECTS = MACHINE_KINDS.projects;
const absolute = (v) => (typeof v === 'string' && isAbsolute(v) ? v : null);

// Spec §5.3: $CLAUDE_PLUGIN_DATA → $CLAUDE_CODE_PLUGIN_CACHE_DIR/data/<id> → ${CLAUDE_CONFIG_DIR:-$HOME/.claude}
// /plugins/data/<id>, <id> = <plugin>-<marketplace>. Relative values are ignored; null when nothing is set.
export function machineDataDir(names, env) {
  requireArg(names, 'names', 'machineDataDir');
  requireArg(env, 'env', 'machineDataDir');
  const id = `${names.plugin}-${names.marketplace}`;
  if (absolute(env.CLAUDE_PLUGIN_DATA)) return env.CLAUDE_PLUGIN_DATA;
  if (absolute(env.CLAUDE_CODE_PLUGIN_CACHE_DIR)) return join(env.CLAUDE_CODE_PLUGIN_CACHE_DIR, 'data', id);
  const config = absolute(env.CLAUDE_CONFIG_DIR) ?? (absolute(env.HOME) ? join(env.HOME, '.claude') : null);
  return config ? join(config, 'plugins', 'data', id) : null;
}

// The name of the in-repo state directory (one path segment), for the fail-closed checks of the hooks when the state
// cannot be resolved and no directory is known (findings-r2 A-I1): lib/state stays the one place that knows it.
export function stateDirName(names) {
  requireArg(names, 'names', 'stateDirName');
  return names.stateDir;
}

export function readProjects(dataDir, names, { write = false } = {}) {
  const file = join(dataDir, PROJECTS.path());
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return { schema: PROJECTS.version, projects: {} };
    throw err;
  }
  return parseDoc(PROJECTS, text, { where: file, names, write, upgrade: (k, d, w) => upgradeDoc(k, d, MIGRATIONS, w) });
}

// A .git entry in dir or above it (real path); an entry that cannot be checked counts.
function gitEntryAbove(dir) {
  let d;
  try { d = realpathSync.native(dir); } catch { return true; }
  for (;;) {
    try { lstatSync(join(d, '.git')); return true; } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') return true; }
    const up = dirname(d);
    if (up === d) return false;
    d = up;
  }
}

// { repo, dir, local, linked, declined, active, dataDir } for the repository containing cwd. timeoutMs bounds the git
// call (hooks pass what is left of their time budget). "Not a repository" only from git's own answer for it (exit 128,
// "not a git repository", messages in the C locale) with no .git entry in cwd or above; any other failure (no answer in
// time, dubious ownership, a permission error, a crash, that answer where a .git exists) is git-failed (findings-r2 B2).
const NOT_A_REPO = /^fatal: not a git repository\b/m;
export function resolve({ cwd, env, names, timeoutMs } = {}) {
  requireArg(env, 'env', 'resolve');
  requireArg(names, 'names', 'resolve');
  if (typeof cwd !== 'string' || !existsSync(cwd)) throw new StateError('not-a-repo', 'ENV', `${cwd} does not exist`, { hint: 'run it inside a git repository' });
  const top = git(['rev-parse', '--show-toplevel'], { cwd, env: { ...env, LC_ALL: 'C' }, ...(timeoutMs > 0 ? { timeoutMs } : {}) });
  if (top.error === 'missing') throw new StateError('git-missing', 'ENV', 'git is not on PATH', { hint: 'install git and put it on PATH' });
  if (top.error) throw new StateError('git-failed', 'ENV', `git did not answer (${top.error})`, { hint: 'check that git runs in this directory' });
  if (top.status !== 0 || !top.stdout.trim()) {
    if (top.status === 128 && NOT_A_REPO.test(top.stderr) && !gitEntryAbove(cwd)) {
      throw new StateError('not-a-repo', 'ENV', `${cwd} is not inside a git repository`, { hint: 'run it inside a git repository' });
    }
    const said = top.stderr.trim().split('\n')[0].slice(0, 160);
    throw new StateError('git-failed', 'ENV', `git failed in ${cwd} (${top.signal ?? `exit ${top.status}`}${said ? `: ${said}` : ''})`, { hint: 'check that git runs in this directory' });
  }
  const repo = realpathSync.native(top.stdout.trim()); // the name on disk, also on case-insensitive volumes
  const dataDir = machineDataDir(names, env);
  const entry = dataDir ? readProjects(dataDir, names).projects[repo] : undefined;
  const dir = entry?.stateDir ?? join(repo, names.stateDir);
  return { repo, dir, local: join(dir, 'local'), linked: Boolean(entry?.stateDir), declined: Boolean(entry?.declinedAt), active: existsSync(join(dir, 'state.json')), dataDir };
}

// An active-looking marker for a directory whose repository git could not resolve (findings-r2 B2): a state directory
// entry in cwd or above it (as given and as the real path), or a projects.json entry for the repository or the linked
// state directory holding cwd. Machine data that cannot be read, or an entry that cannot be checked, counts as one.
// Without a marker nothing of the plugin's is there (the hooks stay out, R73).
export function stateMarker({ cwd, env, names } = {}) {
  requireArg(env, 'env', 'stateMarker');
  requireArg(names, 'names', 'stateMarker');
  if (typeof cwd !== 'string') return false;
  let real = cwd;
  try { real = realpathSync.native(cwd); } catch { /* the path as given */ }
  for (const start of new Set([cwd, real])) {
    for (let d = start; ; d = dirname(d)) {
      try { lstatSync(join(d, names.stateDir)); return true; } catch (e) { if (e.code !== 'ENOENT' && e.code !== 'ENOTDIR') return true; }
      if (dirname(d) === d) break;
    }
  }
  const dataDir = machineDataDir(names, env);
  if (!dataDir) return false;
  let projects;
  try { projects = readProjects(dataDir, names).projects ?? {}; } catch { return true; }
  const holds = (p) => typeof p === 'string' && (real === p || real.startsWith(p.endsWith(sep) ? p : `${p}${sep}`));
  return Object.entries(projects).some(([repo, entry]) => holds(repo) || holds(entry?.stateDir));
}

// Merges `patch` into the entry of `repo` (a real path); null removes a field, an empty entry is removed.
// Returns the new entry or null.
export function updateProject({ repo, dataDir, names, patch = {} } = {}) {
  requireArg(names, 'names', 'updateProject');
  if (!dataDir) throw new StateError('no-machine-data', 'ENV', 'the machine data directory is unknown', { hint: 'set CLAUDE_PLUGIN_DATA or HOME' });
  const file = join(dataDir, PROJECTS.path());
  const apply = (doc) => {
    const projects = { ...doc.projects };
    const entry = { ...(projects[repo] ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete entry[k];
      else entry[k] = v;
    }
    if (Object.keys(entry).length) projects[repo] = entry;
    else delete projects[repo];
    const next = { schema: PROJECTS.version, projects };
    checkWrite(PROJECTS, next, { where: file });
    return { next, entry: projects[repo] ?? null };
  };
  try {
    return withLock(join(dataDir, 'projects.lock'), () => {
      const { next, entry } = apply(readProjects(dataDir, names, { write: true }));
      writeAtomic(file, format(PROJECTS.spec, next));
      return entry;
    });
  } catch (err) {
    throw lockFailure(err, names);
  }
}

// Removes the machine data lock of a process that is gone (as store.unlockStale); { removed, owner }.
export function unlockStaleMachine(dataDir, names, { quietMs } = {}) {
  try {
    return fsxUnlockStale(join(dataDir, 'projects.lock'), { quietMs });
  } catch (err) {
    throw busyFailure(err, names);
  }
}
