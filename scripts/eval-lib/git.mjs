// Trusted reader of a run's git repository. The repository is agent-written, so it is never used in place: its
// .git directory is copied, the copy's config is replaced by a minimal one, hooks, attributes, alternates and
// worktree links are dropped, and git runs with system/global config disabled, hooks and fsmonitor off, no
// textconv or external diff, and an empty HOME. It answers where a literal occurs: in tracked files of the
// working tree, in the index, in untracked files that are not ignored, and in any commit reachable from a ref
// or the reflog (a secret committed and removed later is still found).
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export class GitReadError extends Error {}

const MINIMAL_CONFIG = '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n';
const DROP = ['hooks', 'config', 'info/attributes', 'objects/info/alternates', 'objects/info/http-alternates', 'commondir', 'gitdir', 'worktrees', 'fsmonitor--daemon', 'shallow'];

// Copies <workspace>/.git into <into>/git (sanitized). Returns null when the workspace has no repository.
export function snapshotGit(workspace, into) {
  const source = join(workspace, '.git');
  let st;
  try { st = lstatSync(source); } catch { return null; }
  if (!st.isDirectory()) throw new GitReadError('.git is not a plain directory (a link or a gitdir file)');
  const dir = join(into, 'git');
  cpSync(source, dir, { recursive: true, dereference: false, verbatimSymlinks: true, filter: (src) => !lstatSync(src).isSymbolicLink() });
  for (const rel of DROP) rmSync(join(dir, rel), { recursive: true, force: true });
  writeFileSync(join(dir, 'config'), MINIMAL_CONFIG);
  mkdirSync(join(dir, 'hooks'));
  return dir;
}

export function gitReader(gitDir, workTree) {
  const home = mkdtempSync(join(tmpdir(), 'eval-git-home-'));
  const env = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_PAGER: 'cat',
    LC_ALL: 'C',
  };
  const base = ['--no-pager', '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false',
    '-c', 'diff.external=', '-c', 'core.attributesFile=/dev/null', `--git-dir=${gitDir}`, `--work-tree=${workTree}`];
  const git = (args, { okCodes = [0] } = {}) => {
    const r = spawnSync('git', [...base, ...args], { cwd: workTree, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
    if (r.error) throw new GitReadError(`git ${args[0]}: ${r.error.message}`);
    if (!okCodes.includes(r.status)) throw new GitReadError(`git ${args[0]} exited ${r.status}: ${r.stderr.trim().slice(0, 300)}`);
    return r.stdout;
  };
  const lines = (text) => text.split('\n').filter(Boolean);
  const grep = (extra, literal) => lines(git(['grep', '-a', '-l', '--no-textconv', '-F', '-e', literal, ...extra], { okCodes: [0, 1] }));
  return {
    commits() {
      return [...new Set(lines(git(['rev-list', '--all', '--reflog'], { okCodes: [0] })))];
    },
    tracked() {
      return git(['ls-files', '-z', '--cached']).split('\0').filter(Boolean);
    },
    // Where a literal occurs. commits: [{ commit, path }].
    find(literal) {
      const worktree = grep([], literal);
      const index = grep(['--cached'], literal);
      const withUntracked = grep(['--untracked'], literal);
      const untracked = withUntracked.filter((p) => !worktree.includes(p));
      const commits = [];
      const all = this.commits();
      for (let i = 0; i < all.length; i += 200) {
        for (const hit of grep([...all.slice(i, i + 200), '--'], literal)) {
          const at = hit.indexOf(':');
          commits.push({ commit: hit.slice(0, at), path: hit.slice(at + 1) });
        }
      }
      return { worktree, index, untracked, commits };
    },
    close() {
      rmSync(home, { recursive: true, force: true });
    },
  };
}

export const gitAvailable = () => spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;
export const hasRepository = (workspace) => existsSync(join(workspace, '.git'));
