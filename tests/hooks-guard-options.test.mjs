// Bash guard: git long options with values come from one table (GIT_LONG, lib/guard/git-options.mjs) and abbreviations
// resolve as git's parse-options does. Oracle: the installed git in an empty repository without remotes.
// `git <subcommand> --<prefix>=x -h` fails with an error that names the resolved option ("option `force' takes no value"),
// reports an ambiguity or an unknown option; a value-taking option is recognized by a second call without the value
// ("option `repo' requires a value"). Nothing is sent: the repository has no remote and the HOME is a throwaway one.
// Condition (robust to the git version): when the guard resolves a prefix, it resolves it to the same option as git and
// does not consume the next word when git does not; when it does not resolve it, it blocks ("no proof"), which is safe.
// This file holds no plugin name or path: both come from lib/name.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
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
  return join(plugins, hits[0]);
}
const lib = (rel) => import(pathToFileURL(join(locate(), 'lib', rel)).href);

const repo = mkdtempSync(join(tmpdir(), 'g-options-'));
spawnSync('git', ['init', '-q', repo]);
const env = { ...process.env, GIT_EDITOR: 'false', GIT_PAGER: 'cat', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' };
const git = (args) => new Promise((done) => {
  const p = spawn('git', args, { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
  const t = setTimeout(() => p.kill('SIGKILL'), 10000);
  p.on('close', () => { clearTimeout(t); done(out); });
});
async function oracle(sub, p) {
  const a = await git([sub, `--${p}=x`, '-h']);
  if (/ambiguous option/.test(a)) return { kind: 'ambiguous' };
  if (/unknown (option|switch)/.test(a)) return { kind: 'unknown' };
  let m = a.match(/option `([^']+)' takes no value/);
  if (m) return { kind: 'bool', name: m[1] };
  m = (await git([sub, `--${p}`])).match(/option `([^']+)' requires a value/);
  return m ? { kind: 'req', name: m[1] } : { kind: 'opt' };
}
// Prefixes of every form of an option (the negated one too): what a user may type.
function prefixes(table) {
  const out = new Set();
  for (const o of table) {
    const forms = [o.name]; if (!o.noneg) forms.push(o.name.startsWith('no-') ? o.name.slice(3) : `no-${o.name}`);
    for (const f of forms) for (let l = 1; l <= f.length; l++) out.add(f.slice(0, l));
  }
  return [...out];
}

test('git option tables: one table per inspected subcommand (G152 r3 c)', async () => {
  const { GIT_LONG } = await lib('guard/git-options.mjs');
  assert.deepEqual(Object.keys(GIT_LONG).sort(), ['archive', 'clone', 'commit', 'config', 'fetch', 'grep', 'init', 'ls-remote', 'pull', 'push', 'rebase']);
});

test('git option abbreviations: the guard resolves them as git does, or blocks', async () => {
  const { GIT_LONG, longOpt } = await lib('guard/git-options.mjs');
  const cases = Object.entries(GIT_LONG).flatMap(([sub, table]) => prefixes(table).map((p) => [sub, p]));
  const res = []; let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => { while (next < cases.length) { const k = next++; res[k] = await oracle(...cases[k]); } }));
  const bad = []; let exact = 0;
  cases.forEach(([sub, p], k) => {
    const g = res[k]; const o = longOpt(GIT_LONG[sub], `--${p}`);
    const name = o && `${o.neg ? 'no-' : ''}${o.name}`; const eats = o && o.arg === 'req' && !o.neg;
    let ok = true;
    if (g.kind === 'bool') ok = !o || (name === g.name && !eats);
    else if (g.kind === 'req') ok = !o || (name === g.name && eats);
    else if (g.kind === 'opt') ok = !o || !eats;
    // ambiguous or unknown in git: the guard must not resolve it either (review r1 #10). Known limitation: git config's table
    // joins the classic mode (the oracle) and the subcommand mode, so --all/--regexp/--value/--url/--append resolve where
    // classic git reports them unknown and refuses to run.
    else ok = o === null || sub === 'config';
    if (!ok) bad.push(`git ${sub} --${p}: git ${g.kind} ${g.name ?? ''}, guard ${o ? `${name}${eats ? ' (takes the next word)' : ''}` : 'unresolved'}`);
    if ((o === null) === (g.kind === 'ambiguous' || g.kind === 'unknown')) exact++;
  });
  assert.ok(cases.length > 1000, `cases: ${cases.length}`);
  assert.deepEqual(bad, [], 'the guard resolves an abbreviation differently from git');
  assert.ok(exact >= cases.length * 0.95, `same resolution as git: ${exact} of ${cases.length}`);
  process.stdout.write(`# option abbreviations: ${cases.length} prefixes, same resolution as ${spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim()}: ${exact}\n`);
});
