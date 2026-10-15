// Test environment isolation (S1). A child process a test starts (npm, npx, claude, codex, git, or a script that
// runs them) gets a throwaway HOME, every per-user location inside a throwaway directory, and none of the
// calling session's variables, so no test reads or writes the real HOME. tests/isolation-guard.test.mjs fails
// on a spawn of those tools whose env is not built here.
//
//   isolatedEnv(options)       -> { env, base, home, cleanup }: an env object for spawn(…, { env })
//   isolateProcessEnv(options) -> the same, with process.env itself replaced until cleanup (module level, so every
//                                 child of the test file and the file's own code see the isolated values)
//
// Options: identity (default true) sets GIT_AUTHOR_*/GIT_COMMITTER_*; gitConfig (default '') is the content of
// the global git config file; prefix names the temporary directory. cleanup() removes the directory (also at exit).
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Inherited variables that would point a child at the real user's state, credentials or the calling agent session:
// CLAUDE*, ANTHROPIC*, CODEX*, OPENAI*, every XDG_*, GIT_*, npm_* (npm reads NPM_CONFIG_* too) and HOMEBREW_*,
// NODE_OPTIONS and NODE_PATH (preloads and module paths of the user), SSH_AUTH_SOCK, GH_TOKEN and GITHUB_TOKEN.
// TMPDIR stays: the throwaway directories live there.
export const STRIPPED = /^(?:CLAUDE|ANTHROPIC|CODEX|OPENAI|XDG_|GIT_|npm_|HOMEBREW_)|^(?:NODE_OPTIONS|NODE_PATH|SSH_AUTH_SOCK|GH_TOKEN|GITHUB_TOKEN)$/i;
export const IDENTITY = { name: 'Test User', email: 'test@example.com' };

const pending = new Set();
let exitHook = false;

export function isolatedEnv({ identity = true, gitConfig = '', prefix = 'isolated-env-' } = {}) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const home = join(base, 'home');
  const xdg = { XDG_CONFIG_HOME: join(home, '.config'), XDG_CACHE_HOME: join(home, '.cache'), XDG_DATA_HOME: join(home, '.local', 'share'), XDG_STATE_HOME: join(home, '.local', 'state') };
  for (const dir of [home, ...Object.values(xdg), join(base, 'npm-global')]) mkdirSync(dir, { recursive: true });
  const gitconfig = join(home, '.gitconfig');
  const npmrc = join(home, '.npmrc');
  const globalNpmrc = join(base, 'npm-global', 'npmrc');
  writeFileSync(gitconfig, gitConfig);
  writeFileSync(npmrc, '');
  writeFileSync(globalNpmrc, '');

  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !STRIPPED.test(k)));
  Object.assign(env, {
    HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, '.claude'), ...xdg,
    npm_config_cache: join(base, 'npm-cache'), npm_config_logs_dir: join(base, 'npm-logs'),
    npm_config_userconfig: npmrc, npm_config_globalconfig: globalNpmrc,
    npm_config_update_notifier: 'false', npm_config_fund: 'false', npm_config_audit: 'false',
    GIT_CONFIG_GLOBAL: gitconfig, GIT_CONFIG_NOSYSTEM: '1',
  });
  if (identity) {
    Object.assign(env, { GIT_AUTHOR_NAME: IDENTITY.name, GIT_AUTHOR_EMAIL: IDENTITY.email, GIT_COMMITTER_NAME: IDENTITY.name, GIT_COMMITTER_EMAIL: IDENTITY.email });
  }

  const cleanup = () => {
    if (!pending.delete(cleanup)) return;
    rmSync(base, { recursive: true, force: true });
  };
  pending.add(cleanup);
  if (!exitHook) {
    exitHook = true;
    process.once('exit', () => { for (const f of [...pending]) f(); });
  }
  return { env, base, home, cleanup };
}

const replaceEnv = (values) => {
  for (const k of Object.keys(process.env)) if (!(k in values)) delete process.env[k];
  Object.assign(process.env, values);
};

export function isolateProcessEnv(options) {
  const iso = isolatedEnv(options);
  const saved = { ...process.env };
  replaceEnv(iso.env);
  let restored = false;
  const cleanup = () => {
    if (!restored) { restored = true; replaceEnv(saved); }
    iso.cleanup();
  };
  return { env: process.env, base: iso.base, home: iso.home, cleanup };
}
