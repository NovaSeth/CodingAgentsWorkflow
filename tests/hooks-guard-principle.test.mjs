// Bash guard: the principle "proof of harmlessness only from literal syntax" (generators). For every guarded token the
// generator builds the same forbidden operation through every indirect form (alias from -c, a variable set by assignment,
// printf -v, read, declare, export, mapfile, for, a stale value, command substitution, eval, an option abbreviation);
// every form MUST be blocked and MUST be valid bash. Also: one list of git config keys with the same verdict on every path
// that sets a key, and the argument invariant (every argument is classified; data stays data only where the program treats
// it as data). Commands are data: the hook gets them as JSON and never runs them; `bash -n` only parses them.
// This file holds no plugin name or path: both come from lib/name.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolateProcessEnv } from './helpers/isolated-env.mjs';

// No test here touches the real HOME: git runs with a throwaway HOME and an empty global git config
// (tests/helpers/isolated-env.mjs).
isolateProcessEnv({ identity: false });

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function locate() {
  const plugins = join(root, 'plugins');
  const hits = existsSync(plugins) ? readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json'))) : [];
  assert.equal(hits.length, 1, `expected exactly one plugins/*/lib/name.json, found ${hits.length}`);
  return { pluginDir: join(plugins, hits[0]), names: JSON.parse(readFileSync(join(plugins, hits[0], 'lib', 'name.json'), 'utf8')) };
}
const { pluginDir, names } = locate();
const lib = (rel) => import(pathToFileURL(join(pluginDir, 'lib', rel)).href);
const { runHook } = await lib('hooks/registry.mjs');
const q = (s) => `'${s.replace(/'/g, "'\\''")}'`;

// A repository on a task branch, solo mode injected: a block below is never the push-to-main rule by accident. It holds no
// plugin state: no state directory and no project rules (injected, so no call resolves the repository again).
const dir = mkdtempSync(join(tmpdir(), 'g-principle-'));
spawnSync('git', ['init', '-q', '-b', 'feat', dir]);
spawnSync('git', ['-C', dir, '-c', 'user.name=T', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'x']);
function verdict(command) {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: dir });
  const r = runHook('guard-bash', input, { deadline: Infinity, env: { ...process.env, CLAUDE_PROJECT_DIR: dir }, readProjectMode: () => 'solo', readGuardExtra: () => null, state: null, shadowLog: () => {} });
  if (!r?.stdout) return 'allow';
  return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}
const parses = (cmd) => spawnSync('bash', ['-n'], { input: cmd }).status === 0;

// Token → the forbidden operation as a function of the word carrying the token (x), and its git alias form.
const TOKENS = [
  { id: 'stash', word: 'stash', op: (x) => `git ${x}`, alias: 'stash' },
  { id: 'push', word: 'push', op: (x) => `git ${x} --force origin main`, alias: 'push --force origin main' },
  { id: 'commit', word: 'commit', op: (x) => `git ${x} -n -m x`, alias: 'commit -n -m x' },
  { id: '--no-verify', word: '--no-verify', op: (x) => `git commit ${x} -m x`, alias: 'commit --no-verify -m x' },
  { id: 'hooksPath', word: 'core.hooksPath', op: (x) => `git config ${x} /dev/null`, alias: 'config core.hooksPath /dev/null' },
  { id: 'include.path', word: 'include.path', op: (x) => `git config ${x} /tmp/x.cfg`, alias: 'config include.path /tmp/x.cfg' },
  { id: 'check-secrets', word: '.workflow/bin/check-secrets.sh', op: (x) => `bash ${x} | tail -1`, alias: '!bash .workflow/bin/check-secrets.sh', tail: ' | tail -1' },
  { id: 'exec config key', word: 'core.pager', op: (x) => `git config ${x} less`, alias: 'config core.pager less' },
  { id: 'gate in a pipe', word: 'budget.sh', op: (x) => `bash .workflow/bin/${x} agent | tail -1`, alias: '!bash .workflow/bin/budget.sh agent', tail: ' | tail -1' },
];
// Indirect forms: (token) → command.
const FORMS = {
  'alias from -c': (t) => `git -c alias.k=${q(t.alias)} k${t.tail ?? ''}`,
  'alias from -c shadowing a builtin': (t) => (t.alias.startsWith('!') ? null : `git -c alias.${t.alias.split(' ')[0]}=status ${t.alias}`),
  variable: (t) => `v=${q(t.word)}; ${t.op('"$v"')}`,
  'unquoted variable': (t) => `v=${q(t.word)}; ${t.op('$v')}`,
  'printf -v': (t) => `printf -v v %s ${q(t.word)}; ${t.op('"$v"')}`,
  'stale value (printf -v)': (t) => `v=list; printf -v v %s ${q(t.word)}; ${t.op('"$v"')}`,
  read: (t) => `read -r v <<< ${q(t.word)}; ${t.op('"$v"')}`,
  declare: (t) => `declare v=${q(t.word)}; ${t.op('"$v"')}`,
  export: (t) => `export v=${q(t.word)}; ${t.op('"$v"')}`,
  mapfile: (t) => `mapfile -t a <<< ${q(t.word)}; ${t.op('"${a[0]}"')}`,
  'for loop': (t) => `for v in ${q(t.word)}; do ${t.op('"$v"')}; done`,
  'variable from the environment': (t) => t.op('"$V"'),
  'command substitution': (t) => t.op(`"$(printf %s ${q(t.word)})"`),
  'eval with text': (t) => `eval ${q(t.op(t.word))}`,
  'eval with an expansion': (t) => `c=${q(t.op(t.word))}; eval "$c"`,
};
// Long option abbreviations (git parse-options takes a unique prefix): for option tokens and the core section.
const ABBREV = [
  ['--no-verify', 'git commit --no-veri -m x'], ['--no-verify', 'git commit --no-v -m x'], ['--no-verify', 'git push --no-veri origin feat/x'],
  ['--no-verify', 'git merge --no-veri feat/x'], ['--no-verify', 'git rebase --no-ve main'],
  ['hooksPath', 'git config --remove-sect core'], ['hooksPath', 'git config --rem core'], ['hooksPath', 'git config --rename-s core x'],
  ['hooksPath', 'git config --unset-a core.hooksPath'], ['hooksPath', 'git config --unse core.hooksPath'], ['hooksPath', 'git config --repl core.hooksPath /dev/null'],
  ['push', 'git push --forc origin main'], ['push', 'git push --force-w origin main'], ['push', 'git push --dele origin main'],
  ['push', 'git push --de origin main'], ['push', 'git push --mirr origin'], ['push', 'git push --mi origin'],
  ['exec', "git clone --upload-p 'git stash' . x"], ['exec', "git fetch --upl 'git stash' origin"], ['exec', "git rebase --exe 'git stash' main"],
  ['exec', "git grep --open-files 'git stash' x"], ['exec', "git archive --exe 'git stash' HEAD"], ['template', 'git init --templ /tmp/hooks x'],
];

const rows = [];
for (const t of TOKENS) for (const [form, make] of Object.entries(FORMS)) { const cmd = make(t); if (cmd) rows.push([t.id, form, cmd]); }
for (const [id, cmd] of ABBREV) rows.push([id, 'option abbreviation', cmd]);

test('guard principle: every indirect form of every guarded token is blocked', (t) => {
  assert.ok(rows.length >= TOKENS.length * 10, `generator: ${rows.length} cases`);
  t.diagnostic(`indirect forms: ${rows.length}`);
  const passed = rows.filter(([, , cmd]) => verdict(cmd) !== 'deny').map(([id, form, cmd]) => `${id} / ${form}: ${cmd}`);
  assert.deepEqual(passed, [], 'an indirect form passed');
});

test('guard principle: generator cases are valid bash (bash -n)', () => {
  assert.deepEqual(rows.filter(([, , cmd]) => !parses(cmd)).map(([, , cmd]) => cmd), []);
});

// Parity of the config paths (G152 R3-4, r3 a): every key of the one list CONFIG_DENY (an example with a subsection) gets
// the same verdict — blocked — on every path: git -c, --config-env, clone / fetch / pull -c / --config (cluster and glued
// value too), submodule, git config (classic write, set, --add, -f). Each path with a value carrying a guarded word and
// with a token-free value (x.sh): the session never sets such a key, whatever the value. A new key joins the list and
// every path at once.
const CONFIG_PATHS = {
  'git -c': (k, v) => `git -c ${q(`${k}=${v}`)} status`,
  'git --config-env': (k) => `git --config-env=${q(`${k}=GIT_X`)} status`,
  'clone -c': (k, v) => `git clone -c ${q(`${k}=${v}`)} . x`, 'clone -qc': (k, v) => `git clone -qc ${q(`${k}=${v}`)} . x`,
  'clone -c<value>': (k, v) => `git clone -c${q(`${k}=${v}`)} . x`, 'clone --config': (k, v) => `git clone --config ${q(`${k}=${v}`)} . x`,
  'clone --config=': (k, v) => `git clone --config=${q(`${k}=${v}`)} . x`, 'fetch --config=': (k, v) => `git fetch --config=${q(`${k}=${v}`)} origin`,
  'pull -c': (k, v) => `git pull -c ${q(`${k}=${v}`)} origin feat/x`, submodule: (k, v) => `git submodule add -c ${q(`${k}=${v}`)} ../r x`,
  config: (k, v) => `git config ${q(k)} ${q(v)}`, 'config set': (k, v) => `git config set ${q(k)} ${q(v)}`,
  'config --add': (k, v) => `git config --add ${q(k)} ${q(v)}`, 'config -f': (k, v) => `git config -f .git/config ${q(k)} ${q(v)}`,
  'git-config': (k, v) => `git-config ${q(k)} ${q(v)}`, 'config --replace-all': (k, v) => `git config --replace-all ${q(k)} ${q(v)}`,
};
const parityRows = async () => {
  const { CONFIG_DENY } = await lib('guard/config-keys.mjs');
  return Object.entries(CONFIG_PATHS).flatMap(([path, make]) => CONFIG_DENY.flatMap((e) => [
    [path, e.example, make(e.example, e.hooks ? '/dev/null' : 'git stash')],
    [path, `${e.example} (token-free value)`, make(e.example, 'x.sh')]]))
    .concat(['git clone --template=/tmp/t . x', 'git clone --templ /tmp/t . x', 'git init --template=/tmp/t x', 'git init --template /tmp/t x',
      'git clone --co core.fsmonitor=x.sh . x', 'git config --rename-section x diff', 'git config --rename-section x alias'].map((cmd) => ['prefix', '-', cmd]));
};

test('config path parity: every CONFIG_DENY key on every path is blocked', async (t) => {
  const { CONFIG_DENY, configKey } = await lib('guard/config-keys.mjs');
  for (const e of CONFIG_DENY) assert.ok(e.re.test(e.example) && configKey(e.example) !== null, `example ${e.example} matches its entry`);
  const all = await parityRows();
  assert.ok(all.length > 500, `parity rows: ${all.length}`);
  t.diagnostic(`config path parity rows: ${all.length}`);
  assert.deepEqual(all.filter(([, , cmd]) => !parses(cmd)), [], 'bash syntax');
  assert.deepEqual(all.filter(([, , cmd]) => verdict(cmd) !== 'deny').map(([p, key, cmd]) => `${p} / ${key}: ${cmd}`), [], 'a path with another verdict');
});

// Argument invariant (G152 R3): every argument of a simple command is (a) the command word, (b) the value of a known option
// or (c) an analyzed argument; no option, wrapper or assignment makes the analysis skip one. The generator inserts a
// guarded operation at every argument boundary of a form (an option with its value is one unit, so the insertion never
// becomes its value) and requires a block.
const SH = ['stash', 'STASH=1', "'git stash'"]; // a word with a guarded token outside a path
const INVARIANT = [
  ...['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish'].map((s) => ({ units: [s, 'x.sh', 'a'], fixed: 1, gs: SH })),
  { units: ['bash', '.workflow/bin/check-secrets.sh'], fixed: 1, upto: 1, gs: SH },
  { units: ['source', 'x.sh', 'a'], fixed: 1, gs: SH }, { units: ['.', 'x.sh'], fixed: 1, gs: SH },
  ...[['env', 'FOO=1', 'bash', 'x.sh'], ['env', 'bash', 'x.sh'], ['timeout', '60', 'bash', 'x.sh'], ['nice', 'bash', 'x.sh'],
    ['command', 'bash', 'x.sh'], ['nohup', 'sh', 'x.sh'], ['exec', 'zsh', 'x.sh'], ['env', 'FOO=1', 'cat', 'x'], ['timeout', '60', 'cat', 'x'],
    ['env', 'FOO=1', 'source', 'x.sh'], ['nice', 'env', 'FOO=1', 'bash', 'x.sh']]
    .map((units) => ({ units, fixed: 1, gs: [...SH, 'GIT_CONFIG_KEY_0=core.hooksPath'] })),
  // a variable a shell, git or the loader runs, in the assignment positions of env (G152 r3 b)
  ...[[['env', 'FOO=1', 'bash', 'x.sh'], 1, 2], [['nice', 'env', 'FOO=1', 'bash', 'x.sh'], 2, 3], [['env', 'FOO=1', 'cat', 'x'], 1, 2], [['env', 'git', 'log'], 1, 1]]
    .map(([units, fixed, upto]) => ({ units, fixed, upto, gs: ['EDITOR=x.sh', 'LD_PRELOAD=/tmp/x.so', 'BASH_ENV=x.sh', 'GIT_SSH_COMMAND=x.sh', 'PAGER=x.sh', 'DYLD_INSERT_LIBRARIES=x'] })),
  { units: ['env', 'FOO=1', '.workflow/bin/check-secrets.sh'], fixed: 1, upto: 2, gs: SH },
  { units: ['git', 'grep', '-n', '-e pat', '-f p.txt', '--max-depth 2', '--', 'src'], fixed: 2, upto: 6, gs: ["-O'git stash'", "--open-files-in-pager='git stash'"] },
  { units: ['git', 'rebase', '-X ours', '-s ort', '-C 2', '--onto main', 'main'], fixed: 2, gs: ["-x'git stash'", "--exec='git stash'", '--no-verify'] },
  { units: ['git', 'clone', '-b feat', '-o up', '-j 2', '--depth 1', '--reference ../r', '.', 'x'], fixed: 2,
    gs: ["-u'git stash'", "--upload-pack='git stash'", '-c core.hooksPath=/dev/null', '--config=core.fsmonitor=x.sh', '--template=/tmp/hooks'] },
  { units: ['git', 'clone', '-b feat/push', '.', 'x'], fixed: 2, gs: ['-c core.fsmonitor=x.sh', '--template=/tmp/hooks', '-qc alias.p=log'] },
  { units: ['git', 'fetch', '--depth 1', '-j 2', 'origin'], fixed: 2, gs: ["--upload-pack='git stash'", '--config=core.hooksPath=/dev/null'] },
  { units: ['git', 'init', '-b feat/push', '-q', 'x'], fixed: 2, gs: ['--template=/tmp/hooks', '--templ /tmp/hooks'] },
  { units: ['git', 'ls-remote', '-o x', '--sort refname', 'origin'], fixed: 2, gs: ["-u'git stash'", "--upload-pack='git stash'"] },
  { units: ['git', 'archive', '--format tar', '--prefix p/', 'HEAD'], fixed: 2, gs: ["--exec='git stash'", "--remote='ext::sh x'"] },
  { units: ['git', 'config', '-f x.cfg', '-t path', 'core.hooksPath', '.githooks'], fixed: 2, gs: ['--unset', '--unset-all'] },
  { units: ['git', 'config', 'set', '-f x.cfg', 'core.hooksPath', '.githooks'], fixed: 3, gs: ['--unset'] },
  { units: ['git', 'push', '-o ci.skip', '--push-option x', 'origin', 'feat/x'], fixed: 2, gs: ['--no-verify'] },
  { units: ['git', 'commit', '-m msg', '-F f.txt', '-C HEAD', '--author A'], fixed: 2, gs: ['--no-verify', '-n'] },
];
const invariantRows = INVARIANT.flatMap(({ units, fixed, upto = units.length, gs }) => gs.flatMap((g) =>
  Array.from({ length: upto - fixed + 1 }, (_, i) => [...units.slice(0, fixed + i), g, ...units.slice(fixed + i)].join(' '))));

// Data slots (G152 r3 d): option values, words after `--` and kit or plugin script arguments. A guarded word in a data
// slot passes — proof that the guard reads the slot as git or the script does — and the same word placed right after a
// filled option value is blocked, so a value consumes exactly one word (strict: a word blocked even as a value).
// Expected: [command, 'allow' | 'deny'].
const VALUE_SLOTS = [
  { form: 'git commit -m @ -a', v: 'msg', gs: ['--no-verify', '-n'] }, { form: 'git commit --message @ -a', v: 'msg', gs: ['--no-verify', '-n'] },
  { form: 'git commit -F @ -a', v: 'f.txt', gs: ['--no-verify'] }, { form: 'git commit --author @ -m x', v: 'A', gs: ['--no-verify', '-n'] },
  { form: 'git push -o @ origin feat/x', v: 'ci.skip', gs: ['--no-verify'] }, { form: 'git push --push-option @ origin feat/x', v: 'x', gs: ['--no-verify'] },
  { form: 'git rebase -X @ main', v: 'ours', gs: ["--exec='git stash'"], strict: ['--no-verify'] },
  { form: 'git rebase --onto @ main', v: 'main', gs: ["--exec='git stash'"], strict: ['--no-verify', '--no-ve'] },
  { form: 'git rebase -s @ main', v: 'ort', gs: ["-x'git stash'"] }, { form: 'git rebase --strategy @ main', v: 'ort', gs: ["-x'git stash'"] },
  ...['-b', '--branch', '-o', '--origin', '--depth', '--reference'].map((o) => ({ form: `git clone ${o} @ . x`, v: 'v1',
    gs: ["--upload-pack='git stash'", '--template=/tmp/hooks', '--config=core.hooksPath=/dev/null', "-u'git stash'"] })),
  { form: 'git fetch --depth @ origin', v: '1', gs: ["--upload-pack='git stash'", '--config=core.hooksPath=/dev/null'] },
  { form: 'git grep -e @ src', v: 'pat', gs: ["-O'git stash'", "--open-files-in-pager='git stash'"] },
  { form: 'git grep --max-count @ x', v: '1', gs: ["-O'git stash'"] }, { form: 'git grep -f @ src', v: 'p.txt', gs: ["-O'git stash'"] },
  { form: 'git init -b @ x', v: 'main', gs: ['--template=/tmp/hooks'] }, { form: 'git init --initial-branch @ x', v: 'main', gs: ['--template=/tmp/hooks'] },
  { form: 'git config -f @ core.hooksPath .githooks', v: 'x.cfg', gs: ['--unset'] }, { form: 'git config --comment @ core.hooksPath .githooks', v: 'x', gs: ['--unset'] },
  { form: 'git ls-remote --sort @ origin', v: 'refname', gs: ["--upload-pack='git stash'"] }, { form: 'git archive --prefix @ HEAD', v: 'p/', gs: ["--exec='git stash'"] },
];
const AFTER_DASHES = [
  { form: 'git grep -n x -- @', gs: ["-O'git stash'", "--open-files-in-pager='git stash'"], before: true },
  { form: 'git commit -m x -- @', gs: ['--no-verify', '-n'], before: true },
  { form: 'git clone -b feat -- @ x', gs: ["--upload-pack='git stash'", '--template=/tmp/hooks'], before: true },
  { form: 'git log --oneline -- @', gs: ['stash', 'push'] }, { form: 'git diff -- @', gs: ['stash', 'commit'] },
  { form: 'git rm -- @', gs: ['--no-verify', 'stash'] }, { form: 'git checkout -- @', gs: ['stash'] },
];
// [units, index of the first argument after the script (or after the plugin's own command)]
const SCRIPT_ARGS = [
  [['bash', '.workflow/bin/task.sh', 'P1', 'complete', 'msg'], 2], [['.workflow/bin/task.sh', 'P1', 'complete'], 1],
  [['sh', '.workflow/bin/task.sh', 'P1', 'note'], 2], [['node', '.workflow/bin/tick.mjs', '--plan', 'docs/plans/a.md'], 2],
  [['@BIN@', 'rule', 'SEC-3'], 1], [['@BIN@', 'task', 'event', 'T-AB-1', 'note', '--data', 'x=1'], 1],
];
const SCRIPT_GS = ['stash', "'git stash'", '--no-verify', "'git push --force origin main'", 'core.hooksPath=/dev/null', "'npm test | tail -1'"];
function dataSlotRows() {
  const out = [];
  for (const { form, v, gs, strict = [] } of VALUE_SLOTS) {
    for (const g of gs) out.push([form.replace('@', g), 'allow'], [form.replace('@', `${v} ${g}`), 'deny']);
    // a --no-verify prefix anywhere before "--" of a merge-like command is blocked, also as a value (fail closed, as 1.5.2)
    for (const g of strict) out.push([form.replace('@', g), 'deny']);
  }
  for (const { form, gs, before } of AFTER_DASHES) for (const g of gs) {
    out.push([form.replace('@', g), 'allow']);
    if (before) out.push([form.replace(' -- @', ` ${g} -- y`), 'deny']);
  }
  for (const [units, first] of SCRIPT_ARGS) {
    for (const g of SCRIPT_GS) {
      for (let k = first; k <= units.length; k++) out.push([[...units.slice(0, k), g, ...units.slice(k)].join(' '), 'allow']);
      for (let k = first; k < units.length; k++) out.push([[...units.slice(0, k), g, ...units.slice(k + 1)].join(' '), 'allow']);
    }
  }
  return out.map(([c, want]) => [c.split('@BIN@').join(names.bin), want]);
}

test('argument invariant: a guarded operation at every argument position of shell, wrapper and git forms is blocked', (t) => {
  assert.ok(invariantRows.length > 200, `insertions: ${invariantRows.length}`);
  t.diagnostic(`argument insertions: ${invariantRows.length}`);
  assert.deepEqual(invariantRows.filter((cmd) => !parses(cmd)), [], 'an insertion without valid bash syntax');
  assert.deepEqual(invariantRows.filter((cmd) => verdict(cmd) !== 'deny'), [], 'an argument skipped by the analysis (guarded operation allowed)');
});

test('argument invariant, data slots: option values, words after -- and script arguments stay data; a value takes one word', (t) => {
  const all = dataSlotRows();
  t.diagnostic(`data-slot rows: ${all.length} (${all.filter(([, w]) => w === 'deny').length} deny)`);
  assert.ok(all.length > 250, `data-slot rows: ${all.length}`);
  assert.ok(all.some(([, w]) => w === 'deny') && all.some(([, w]) => w === 'allow'));
  assert.deepEqual(all.filter(([cmd]) => !parses(cmd)).map(([c]) => c), [], 'bash syntax');
  assert.deepEqual(all.filter(([cmd, want]) => verdict(cmd) !== want).map(([cmd, want]) => `expected ${want}: ${cmd}`), []);
});
