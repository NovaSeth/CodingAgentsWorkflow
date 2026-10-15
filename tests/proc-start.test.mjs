// proc.start (ruling for I9.1, spec §4.2, §4.3, §7.8a): the asynchronous counterpart of proc.run for long runs
// under a lease. Same owner checks as run (git only from lib/git, gh from mirror, codex and gemini from providers,
// an explicit calling unit); the child leads its own process group by default (so a limit or the orphan reaper
// ends the whole group), and its output is streamed while it runs, not collected at exit.
// This file holds no plugin name or path: the plugin is found through lib/name.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = (() => {
  const plugins = join(root, 'plugins');
  const hits = readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json')));
  assert.equal(hits.length, 1, 'exactly one plugins/*/lib/name.json');
  return join(plugins, hits[0]);
})();
const { start } = await import(pathToFileURL(join(pluginDir, 'lib', 'proc', 'index.mjs')).href);

const pgidOf = (pid) => Number(spawnSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim());
const exited = (child) => new Promise((resolve) => { child.once('exit', (status, signal) => resolve({ status, signal })); });
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function gone(pid, ms = 5000) {
  for (const until = Date.now() + ms; Date.now() < until;) {
    if (!alive(pid)) return true;
    await new Promise((r) => { setTimeout(r, 25); });
  }
  return !alive(pid);
}

test('proc.start refuses like proc.run: no calling unit, git outside lib/git, owned programs outside their owner', () => {
  assert.throws(() => start(process.execPath, ['-e', '0']), /unit/);
  for (const cmd of ['git', '/usr/bin/git', 'git.exe']) assert.throws(() => start(cmd, ['--version'], { unit: 'sched' }), /lib\/git/);
  const missingDir = join(tmpdir(), 'no-such-dir-zz9');
  for (const [program, owner] of [['gh', 'mirror'], ['codex', 'providers'], ['gemini', 'providers']]) {
    assert.throws(() => start(join(missingDir, program), [], { unit: 'sched' }), new RegExp(`lib/${owner}`), `${program} from sched`);
  }
});

test('proc.start: the child leads its own process group (detached by default); a group signal ends its children too', { timeout: 20000 }, async (t) => {
  const child = start(process.execPath, ['-e', `
    const { spawn } = require('node:child_process');
    const g = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    process.stdout.write(String(g.pid) + '\\n');
    setInterval(() => {}, 1000);
  `], { unit: 'sched', stdin: 'ignore' });
  t.after(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } });
  const grandchild = await new Promise((resolve) => { child.stdout.once('data', (d) => resolve(Number(String(d).trim()))); });
  assert.equal(pgidOf(child.pid), child.pid, 'group leader');
  assert.equal(pgidOf(grandchild), child.pid, 'its child is in its group');
  assert.notEqual(pgidOf(child.pid), pgidOf(process.pid), 'not in the caller group');
  const end = exited(child);
  process.kill(-child.pid, 'SIGTERM');
  assert.equal((await end).signal, 'SIGTERM');
  assert.equal(await gone(grandchild), true, 'the group signal reached the grandchild');
  const attached = start(process.execPath, ['-e', '0'], { unit: 'sched', detached: false, stdin: 'ignore' });
  assert.equal(pgidOf(attached.pid) || pgidOf(process.pid), pgidOf(process.pid), 'detached: false stays in the caller group');
  await exited(attached);
});

test('proc.start streams output while the child runs; exit status and a missing program are reported', { timeout: 20000 }, async () => {
  const child = start(process.execPath, ['-e', 'process.stdout.write("first"); setTimeout(() => { process.stderr.write("late"); process.exit(4); }, 700)'], { unit: 'sched', stdin: 'ignore' });
  const begun = Date.now();
  let firstAt = null;
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => { firstAt ??= Date.now(); out += d; });
  child.stderr.on('data', (d) => { err += d; });
  const end = await exited(child);
  const endedAt = Date.now();
  assert.equal(end.status, 4);
  assert.equal(out, 'first');
  await new Promise((r) => { setTimeout(r, 50); });
  assert.equal(err, 'late');
  assert.ok(firstAt !== null && endedAt - firstAt >= 400, `output arrived while running (first after ${firstAt - begun} ms, exit after ${endedAt - begun} ms)`);
  const missing = start('no-such-program-zz9', [], { unit: 'sched', stdin: 'ignore' });
  const error = await new Promise((resolve) => { missing.once('error', resolve); });
  assert.equal(error.code, 'ENOENT');
});
