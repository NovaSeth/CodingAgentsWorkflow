// Install channel (SC1, SC2, REV-55): the plugin installs from the repo path with the README command,
// non-interactively, in a throwaway HOME and CLAUDE_CONFIG_DIR (never the real ~/.claude). Claude Code
// writes only its own records (enabledPlugins, extraKnownMarketplaces, CLI state) and ~/.claude/plugins/**;
// nothing lands in the project, and running the plugin's entry points writes nothing outside
// ~/.claude/plugins/**. Run: node --test tests/e2e/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolatedEnv, isolateProcessEnv } from '../helpers/isolated-env.mjs';

// No child of this file sees the real HOME or the calling session (tests/helpers/isolated-env.mjs).
isolateProcessEnv();

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000, ...opts });
const out = (r) => `exit ${r.status}${r.error ? ` (${r.error.message})` : ''}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`;
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// The plugin directory is found through name.json itself, so this test holds no plugin path or codename.
function locate() {
  const plugins = join(root, 'plugins');
  const hits = existsSync(plugins) ? readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json'))) : [];
  assert.equal(hits.length, 1, `expected exactly one plugins/*/lib/name.json, found ${hits.length}`);
  const dir = join(plugins, hits[0]);
  return { dir, names: readJson(join(dir, 'lib', 'name.json')), manifest: readJson(join(dir, '.claude-plugin', 'plugin.json')) };
}

// Child environment from the helper: no variable of the calling Claude Code session leaks in, and every per-user
// location (config, XDG dirs, git config) points into a throwaway HOME of this test, so the snapshot sees any write.
function claudeEnv(t) {
  const iso = isolatedEnv({ gitConfig: '[init]\n\tdefaultBranch = main\n' });
  t.after(iso.cleanup);
  return { home: iso.home, env: { ...iso.env, DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' } };
}

// path -> content hash (files), link target (symlinks) or 'dir'.
function snapshot(base) {
  const snap = new Map();
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const rel = relative(base, p).split('\\').join('/');
      const st = lstatSync(p);
      if (st.isSymbolicLink()) snap.set(rel, `link:${readlinkSync(p)}`);
      else if (st.isDirectory()) { snap.set(rel, 'dir'); walk(p); }
      else snap.set(rel, createHash('sha256').update(readFileSync(p)).digest('hex'));
    }
  };
  walk(base);
  return snap;
}
const changed = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();

const PLUGINS = /^\.claude\/plugins(\/|$)/;
// Claude Code's own records: settings.json (checked key by key below), CLI state and its backups.
const PLATFORM = /^\.claude$|^\.claude\/settings\.json$|^\.claude\/\.claude\.json$|^\.claude\/backups(\/|$)/;

function claudeMissing(t, names, env) {
  if (run('claude', ['--version'], { env }).status === 0) return false;
  if (process.env[`${names.envPrefix}REQUIRE_TOOLS`]) assert.fail(`claude not on PATH (${names.envPrefix}REQUIRE_TOOLS)`);
  t.skip('claude not on PATH');
  return true;
}

test('plugin installs from the repo path non-interactively and writes nothing outside ~/.claude/plugins/** (SC1, SC2)', { timeout: 300000 }, (t) => {
  const { dir, names, manifest } = locate();
  const id = `${names.plugin}@${names.marketplace}`;
  const { home, env } = claudeEnv(t);
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'install-project-')));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  if (claudeMissing(t, names, env)) return;
  const inProject = { cwd: project, env };
  for (const args of [['init', '-q'], ['commit', '-q', '--allow-empty', '-m', 'base']]) assert.equal(run('git', args, inProject).status, 0);
  const repoStatus = () => run('git', ['status', '--porcelain', '--ignored'], { cwd: root }).stdout;
  const repoBefore = repoStatus();

  for (const target of [dir, root]) {
    const r = run('claude', ['plugin', 'validate', '--strict', target], inProject);
    assert.equal(r.status, 0, `validate --strict ${relative(root, target) || '.'}\n${out(r)}`);
  }

  const before = snapshot(home);
  const install = run('claude', ['plugin', 'install', names.plugin, '--marketplace', root, '--json'], inProject);
  assert.equal(install.status, 0, out(install));
  const result = JSON.parse(install.stdout.trim());
  assert.equal(result.outcome, 'ok', out(install));
  assert.equal(result.pluginId, id);
  assert.equal(result.scope, 'user');

  const list = run('claude', ['plugin', 'list', '--json'], inProject);
  assert.equal(list.status, 0, out(list));
  const entry = JSON.parse(list.stdout).find((p) => p.id === id);
  assert.ok(entry, `${id} missing from plugin list\n${list.stdout}`);
  assert.equal(entry.enabled, true);
  assert.equal(entry.version, manifest.version);
  assert.match(relative(home, entry.installPath).split('\\').join('/'), PLUGINS, 'installed under ~/.claude/plugins');

  const afterInstall = snapshot(home);
  const outside = changed(before, afterInstall).filter((p) => !PLUGINS.test(p) && !PLATFORM.test(p));
  assert.deepEqual(outside, [], 'install wrote outside ~/.claude/plugins/** and the platform records');
  assert.ok(!existsSync(join(home, '.claude', 'CLAUDE.md')), 'no global CLAUDE.md');
  const settings = readJson(join(home, '.claude', 'settings.json'));
  assert.deepEqual(Object.keys(settings).sort(), ['enabledPlugins', 'extraKnownMarketplaces']);
  assert.deepEqual(settings.enabledPlugins, { [id]: true });
  assert.deepEqual(Object.keys(settings.extraKnownMarketplaces), [names.marketplace]);
  assert.equal(realpathSync(settings.extraKnownMarketplaces[names.marketplace].source.path), realpathSync(root));

  // The installed copy is complete and parses (REV-56).
  assert.deepEqual(readJson(join(entry.installPath, 'lib', 'name.json')), names);
  assert.equal(readJson(join(entry.installPath, '.claude-plugin', 'plugin.json')).name, names.plugin);
  assert.equal(typeof readJson(join(entry.installPath, 'settings.json')), 'object');

  // Entry points run 3x in the project, the way the Bash tool sees bin/ on PATH.
  const onPath = { ...inProject, env: { ...env, PATH: `${join(entry.installPath, 'bin')}${delimiter}${env.PATH}` } };
  for (let i = 0; i < 3; i++) {
    const r = run(names.bin, ['--version'], onPath);
    assert.equal(r.status, 0, out(r));
    assert.equal(r.stdout, `${names.bin} ${manifest.version}\n`);
  }
  const unknown = run(names.bin, ['no-such-command'], onPath);
  assert.equal(unknown.status, 2, out(unknown));
  assert.equal(unknown.stdout, '');
  const help = run(names.bin, ['--help'], onPath);
  assert.equal(help.status, 0, out(help));
  assert.match(help.stdout, /^ {2}doctor {2,}\S/m);
  const afterRuns = changed(afterInstall, snapshot(home)).filter((p) => !PLUGINS.test(p));
  assert.deepEqual(afterRuns, [], 'entry points wrote outside ~/.claude/plugins/**');

  // doctor v0 from the installed bin/: Claude Code at or above the floor, the plugin enabled, every hook event
  // of the registry registered. It only runs `claude`, which updates its own CLI state.
  const doctor = run(names.bin, ['doctor', '--json'], onPath);
  assert.equal(doctor.status, 0, out(doctor));
  assert.equal(doctor.stdout.split('\n').length, 2, 'one envelope line');
  const report = JSON.parse(doctor.stdout);
  assert.deepEqual([report.command, report.ok, report.exit, report.errors], ['doctor', true, 'OK', []]);
  assert.deepEqual(report.data.checks.map((c) => [c.id, c.ok]), [['claude-code', true], ['plugin', true], ['hooks', true]]);
  assert.deepEqual(report.data.plugin, { id, enabled: true, version: manifest.version });
  const hooksJson = readJson(join(entry.installPath, 'hooks', 'hooks.json'));
  assert.deepEqual([...report.data.hooks.registered].sort(), Object.keys(hooksJson.hooks).sort());
  const afterDoctor = changed(afterInstall, snapshot(home)).filter((p) => !PLUGINS.test(p) && !PLATFORM.test(p));
  assert.deepEqual(afterDoctor, [], 'doctor wrote outside ~/.claude/plugins/** and the platform records');
  assert.deepEqual(Object.keys(readJson(join(home, '.claude', 'settings.json'))).sort(), ['enabledPlugins', 'extraKnownMarketplaces'], 'doctor left user settings alone');

  assert.equal(run('git', ['status', '--porcelain', '--ignored'], inProject).stdout, '', 'project untouched');
  assert.ok(!existsSync(join(project, names.stateDir)), `no ${names.stateDir}/ before activation`);
  assert.equal(repoStatus(), repoBefore, 'marketplace source repo untouched');
});

// bin/ is extensionless, so Node loads it as CommonJS or as an ES module depending on the nearest
// package.json above it. The plugin ships a CommonJS one; without it (a copy that lost it) the launcher must
// still work under both.
for (const type of ['commonjs', 'module']) {
  test(`launcher prints the version when loaded as ${type}`, (t) => {
    const { dir, names, manifest } = locate();
    const base = realpathSync(mkdtempSync(join(tmpdir(), 'launcher-')));
    t.after(() => rmSync(base, { recursive: true, force: true }));
    cpSync(dir, base, { recursive: true });
    writeFileSync(join(base, 'package.json'), JSON.stringify({ type }));
    const launcher = join(base, 'bin', names.bin);
    assert.ok(statSync(join(dir, 'bin', names.bin)).mode & 0o111, 'launcher is executable');
    const r = run(process.execPath, [launcher, '--version'], { cwd: base });
    assert.equal(r.status, 0, out(r));
    assert.equal(r.stdout, `${names.bin} ${manifest.version}\n`);
    const bad = run(process.execPath, [launcher, '--frobnicate'], { cwd: base });
    assert.equal(bad.status, 2, out(bad));
    assert.match(bad.stderr, /usage/i);
  });
}
