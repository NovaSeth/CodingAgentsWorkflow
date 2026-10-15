// One output writer (S2; spec §8.1; security guide §3.7): everything the CLI prints goes through lib/cli/output.mjs.
// Human-readable text (stdout) and error lines (stderr) reach a terminal without escape sequences (CSI, OSC, C1),
// control, bidi or invisible characters, whatever data they carry: titles, facts, decisions, paths, argv, the output
// of other programs. The JSON envelope keeps the data exactly (JSON.parse gives it back) and is inert too: the
// characters JSON leaves raw (DEL, C1, bidi controls, ...) are \u escapes. Hook output is Claude Code protocol and
// passes unchanged.
//   part 1: every command row, its implementation replaced by one that returns hostile text, data, errors and usage
//   part 2: the real commands that print user or repository data, fed escape-injection fixtures
// tests/architecture.test.mjs keeps every write to stdout and stderr inside lib/cli/output.mjs.
// This file holds no plugin name or path: both come from lib/name.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedEnv, isolateProcessEnv } from './helpers/isolated-env.mjs';

// Every child of this file (and git run by the code under test) gets a throwaway HOME and environment (S1).
isolateProcessEnv();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = (() => {
  const plugins = join(root, 'plugins');
  const hits = readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json')));
  assert.equal(hits.length, 1, 'exactly one plugins/*/lib/name.json');
  return join(plugins, hits[0]);
})();
const names = JSON.parse(readFileSync(join(pluginDir, 'lib', 'name.json'), 'utf8'));
const lib = (rel) => import(pathToFileURL(join(pluginDir, 'lib', rel)).href);
const { main } = await lib('cli/main.mjs');
const { COMMANDS, EXIT } = await lib('cli/commands.mjs');
const AT = '2026-10-15T05:42:00.000Z';

// A window-title OSC, a screen clear, an 8-bit CSI (C1), a right-to-left override and an OSC 8 hyperlink.
const PAYLOAD = 'T\u001b]0;pwned\u0007itle\u001b[2J\u009b31m\u202eevil\u001b]8;;https://x.test\u001b\\link\u001b]8;;\u001b\\';
const VISIBLE = 'Titleevillink'; // what a person may see of it: the printable text outside the sequences
const DIR_NAME = 'repo-\u001b]0;pwned\u0007-\u001b[2J-\u202e'; // a directory name cannot hold a slash
const DIR_VISIBLE = 'repo---';
// Independent of lib/text: C0 but LF and TAB, DEL, C1, soft hyphen, Arabic letter mark, zero-width and bidi controls,
// line and paragraph separators, word joiner and invisible operators, BOM.
const UNSAFE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/u;
const HOSTILE = /[\u001b\u0007\u009b\u202e]/; // a string holding part of the payload

function assertInert(label, text) {
  const m = UNSAFE.exec(text);
  assert.equal(m, null, `${label}: U+${m?.[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} reaches the terminal in ${JSON.stringify(text)}`);
}
const strings = (v) => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);

async function run(argv, { commands = COMMANDS, env = process.env, cwd = process.cwd() } = {}) {
  const io = { stdout: '', stderr: '', stdinIsTTY: false, env, cwd, stdin: null };
  io.out = (s) => { io.stdout += s; };
  io.err = (s) => { io.stderr += s; };
  const code = await main(argv, { commands, io });
  return { code, stdout: io.stdout, stderr: io.stderr };
}

// Both modes of one command line: text inert on stdout and stderr; --json one inert envelope line, stderr empty.
// Returns the parsed envelope.
async function expectInert(label, argv, opts) {
  const text = await run(argv, opts);
  assertInert(`${label}: stdout`, text.stdout);
  assertInert(`${label}: stderr`, text.stderr);
  const json = await run([...argv, '--json'], opts);
  assert.ok(json.stdout.endsWith('\n') && !json.stdout.slice(0, -1).includes('\n'), `${label}: one envelope line\n${json.stdout}`);
  assertInert(`${label}: --json stdout`, json.stdout);
  assert.equal(json.stderr, '', `${label}: --json keeps stderr empty`);
  const env = JSON.parse(json.stdout);
  assert.equal(env.code, json.code);
  return { text, json, env };
}

// ---- part 1: every command row ----

const rows = COMMANDS.filter((r) => !r.failOpen);
const exitOf = (row) => (row.exits.includes('FAIL') ? 'FAIL' : row.exits.find((n) => n !== 'OK') ?? 'OK');
const withRow = (row, impl) => COMMANDS.map((x) => (x === row ? { ...row, load: async () => impl } : x));
const argvOf = (row) => [...row.name.split(' '), ...row.args.filter((a) => a.required).map(() => PAYLOAD), '--yes'];

test('every command: hostile text, data, errors, warnings and usage print inert; --json keeps the data exactly', async () => {
  assert.ok(rows.length >= 15, `the command rows: ${rows.map((r) => r.name)}`);
  for (const row of rows) {
    const code = EXIT[exitOf(row)];
    const impl = () => ({
      code,
      data: { title: PAYLOAD, facts: [{ evidence: PAYLOAD }] },
      errors: code ? [{ code: 'hostile', message: PAYLOAD, hint: PAYLOAD }] : [],
      text: `title: ${PAYLOAD}\n`,
      warnings: [PAYLOAD],
      usage: `usage: ${PAYLOAD}`,
    });
    const { text, env } = await expectInert(row.name, argvOf(row), { commands: withRow(row, impl) });
    assert.equal(text.code, code, `${row.name}: ${text.stderr}`);
    assert.ok(text.stdout.includes(`title: ${VISIBLE}`), `${row.name}: the printable text is kept: ${JSON.stringify(text.stdout)}`);
    assert.ok(text.stderr.includes(`warning: ${VISIBLE}`), `${row.name}: warnings on stderr: ${JSON.stringify(text.stderr)}`);
    if (code) assert.ok(text.stderr.includes(`: ${VISIBLE}\n  hint: ${VISIBLE}\n`) && text.stderr.includes(`usage: ${VISIBLE}`), `${row.name}: ${JSON.stringify(text.stderr)}`);
    assert.deepEqual(env.data, { title: PAYLOAD, facts: [{ evidence: PAYLOAD }] }, `${row.name}: JSON.parse gives the data back`);
    if (code) assert.deepEqual([env.errors[0].message, env.errors[0].hint], [PAYLOAD, PAYLOAD]);
  }
});

test('argv echoed in usage errors and the message of an internal error print inert', async () => {
  for (const [label, argv] of [['unknown command', [PAYLOAD]], ['unknown flag', ['task', 'list', `--x${PAYLOAD}`]], ['unexpected argument', ['task', 'list', PAYLOAD]],
    ['missing value', ['decisions', 'retire', 'D-AB-1', `--reason`]], ['unknown flag before the command', [`-${PAYLOAD}`]]]) {
    const { text, env } = await expectInert(label, argv);
    assert.equal(text.code, EXIT.USAGE, label);
    assert.equal(env.exit, 'USAGE');
  }
  const row = COMMANDS.find((r) => r.name === 'task list');
  const { text, env } = await expectInert('internal error', ['task', 'list'], { commands: withRow(row, () => { throw new Error(PAYLOAD); }) });
  assert.equal(text.code, EXIT.INTERNAL);
  assert.ok(text.stderr.includes(`internal error: ${VISIBLE}`), text.stderr);
  assert.equal(env.errors[0].message, `internal error: ${PAYLOAD}`);
});

test('hook output is Claude Code protocol: passed on unchanged, never cleaned as terminal text', async () => {
  const row = COMMANDS.find((r) => r.name === 'hook');
  const protocol = `${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'a\u2028b' } })}\n`;
  const r = await run(['hook', 'x'], { commands: withRow(row, () => ({ text: protocol, hookExit: 0 })) });
  assert.deepEqual([r.code, r.stdout], [0, protocol], 'byte for byte (cleaning would turn U+2028 into a line break inside a JSON string)');
});

// ---- part 2: the real commands, fed hostile data ----

const identity = '[user]\n\tname = Test User\n\temail = test@example.com\n';
function git(cwd, env, args) {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
}
// A repository whose own path is hostile (a directory name with escapes), with a git identity.
function hostileRepo(t) {
  const iso = isolatedEnv({ gitConfig: identity, prefix: 'output-' });
  t.after(iso.cleanup);
  const dir = join(iso.base, DIR_NAME);
  mkdirSync(dir);
  git(dir, iso.env, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  return { base: iso.base, dir, env: iso.env, state: join(dir, names.stateDir), cwd: dir };
}
const put = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };
const record = (id) => `---\nschema: 1\nid: ${id}\ntitle: ${JSON.stringify(PAYLOAD)}\nstatus: active\nkind: general\ndate: 2026-10-15\nauthor: TU\nsupersedes: []\nsupersededBy: null\nscope: []\nallowsTestRemoval: []\n---\n\n## What\n\n${PAYLOAD}\n\n## Why\n\nBecause ${PAYLOAD}.\n\n## Cost if wrong\n\nlow, ${PAYLOAD}\n`;
// A lock of another host, older than its TTL (stale), whose host name is hostile. The token is a lock token shape. SYNTH
const staleLock = (r) => put(join(r.state, 'local', 'lock', 'owner.json'), JSON.stringify({ pid: 1, token: '1.0123456789abcdef', host: `host${PAYLOAD}`, startedAt: '2000-01-01T00:00:00.000Z', procStart: '2000-01-01T00:00:00.000Z' })); // SYNTH

// [label, argv, { setup, after, carries }]: setup runs before each mode; carries: the hostile data reached the output
// (the envelope holds it, or the text shows the cleaned repository name), so the case is not vacuous.
const STEPS = [
  ['init: the repository path', ['init', '--yes'], { carries: true }],
  ['task new: a hostile title', ['task', 'new', PAYLOAD, '--yes']],
  ['task new', ['task', 'new', 'plain title', '--yes']],
  ['task list', ['task', 'list']],
  ['task show: a hostile ID', ['task', 'show', PAYLOAD], { carries: true }],
  ['task set: a hostile reason', ['task', 'set', 'T-TU-1', 'blocked', '--reason', PAYLOAD, '--yes']],
  ['task show', ['task', 'show', 'T-TU-1']],
  ['profile set: a hostile fact', ['profile', 'set', 'goal', PAYLOAD, '--source', 'said', '--evidence', PAYLOAD, '--yes'], { carries: true }],
  ['profile observe: a hostile file name', ['profile', 'observe', '--yes'], { setup: (r) => put(join(r.dir, 'src', `x${DIR_NAME}.tsx`), 'x\n'), carries: true }],
  ['profile show', ['profile', 'show'], { carries: true }],
  ['route: a hostile path', ['route', '--probe', '--paths', PAYLOAD, '--loc', '1'], { carries: true }],
  ['route: a hostile LOC', ['route', '--probe', '--paths', 'a.js', '--loc', PAYLOAD], { carries: true }],
  ['route: a hostile class', ['route', 'T-TU-1', '--override', PAYLOAD, '--by', 'user', '--quote', 'q', '--yes'], { carries: true }],
  ['rule: a hostile ID', ['rule', PAYLOAD], { carries: true }],
  ['gen plan: a hostile target', ['gen', 'plan', PAYLOAD], { carries: true }],
  ['gen apply --dry-run', ['gen', 'apply', 'ci', '--dry-run']],
  ['decide: a hostile title', ['decide', '--title', PAYLOAD, '--why', 'w', '--cost', 'c', '--yes']],
  ['decisions show: a hostile record', ['decisions', 'show', 'D-TU-1'], { setup: (r) => put(join(r.state, 'decisions', 'D-TU-1.md'), record('D-TU-1')), carries: true }],
  ['decisions find: a hostile record (invalid, so not listed)', ['decisions', 'find']],
  ['decisions find: hostile words', ['decisions', 'find', PAYLOAD]],
  ['decisions check: a hostile record', ['decisions', 'check']],
  ['decisions show: a hostile ID', ['decisions', 'show', PAYLOAD], { carries: true }],
  ['decisions retire: a hostile ID', ['decisions', 'retire', PAYLOAD, '--yes'], { carries: true }],
  ['decisions supersede: a hostile ID', ['decisions', 'supersede', PAYLOAD, '--title', 't', '--why', 'w', '--cost', 'c', '--yes'], { carries: true }],
  ['task list: a hostile title in a committed task file', ['task', 'list'], {
    setup: (r) => put(join(r.state, 'tasks', 'T-TU-9', 'task.json'), `${JSON.stringify({ schema: 1, id: 'T-TU-9', kind: 'task', title: PAYLOAD, lane: null, owner: 'TU', class: null, classHistory: [], status: 'new', round: 0, events: [], base: null, branch: null })}\n`),
    after: (r) => rmSync(join(r.state, 'tasks', 'T-TU-9'), { recursive: true, force: true }),
    carries: true,
  }],
  ['profile show: a hostile fact in a committed profile', ['profile', 'show'], {
    setup: (r) => put(join(r.state, 'profile.json'), `${JSON.stringify({ schema: 1, facts: { goal: { value: PAYLOAD, source: 'said', evidence: PAYLOAD, confidence: 1, at: AT } }, gates: [], riskPaths: [], lastScan: null })}\n`),
    after: (r) => rmSync(join(r.state, 'profile.json'), { force: true }),
    carries: true,
  }],
  ['a write blocked by a lock with a hostile host', ['task', 'new', 'locked', '--yes'], { setup: staleLock, carries: true }],
  ['state unlock: a lock with a hostile host', ['state', 'unlock', '--stale', '--yes'], { setup: staleLock, carries: true }],
  ['decline: an active repository', ['decline', '--yes'], { carries: true }],
  ['deactivate', ['deactivate', '--yes'], { carries: true }],
];
// In a repository never activated: the commands that name it.
const INACTIVE_STEPS = [
  ['task list', ['task', 'list'], { carries: true }],
  ['profile show', ['profile', 'show'], { carries: true }],
  ['profile observe (read-only)', ['profile', 'observe', '--yes'], { carries: true }],
  ['route --probe', ['route', '--probe', '--paths', 'a.js', '--loc', '1']],
  ['gen plan', ['gen', 'plan'], { carries: true }],
  ['decisions check', ['decisions', 'check']],
  ['decline', ['decline', '--yes'], { carries: true }],
];

async function runSteps(steps, r) {
  for (const [label, argv, { setup, after, carries = false } = {}] of steps) {
    const opts = { env: r.env, cwd: r.cwd };
    setup?.(r);
    const text = await run(argv, opts);
    assertInert(`${label}: stdout`, text.stdout);
    assertInert(`${label}: stderr`, text.stderr);
    setup?.(r);
    const json = await run([...argv, '--json'], opts);
    after?.(r);
    assert.ok(json.stdout.endsWith('\n') && !json.stdout.slice(0, -1).includes('\n'), `${label}: one envelope line\n${json.stdout}`);
    assertInert(`${label}: --json stdout`, json.stdout);
    assert.equal(json.stderr, '', `${label}: --json keeps stderr empty`);
    const env = JSON.parse(json.stdout);
    const shown = `${text.stdout}${text.stderr}`;
    const reached = strings(env).some((s) => HOSTILE.test(s)) || shown.includes(DIR_VISIBLE) || HOSTILE.test(shown);
    if (carries) assert.ok(reached, `${label}: the hostile data reaches the output (not vacuous): ${json.stdout}`);
  }
}

test('real commands fed escape injection (a hostile title, fact, decision, path, argv, lock) print it inert in both modes', async (t) => {
  await runSteps(STEPS, hostileRepo(t));
  await runSteps(INACTIVE_STEPS, hostileRepo(t));
});

test('doctor: hostile output of claude prints inert', async (t) => {
  const iso = isolatedEnv({ prefix: 'output-doctor-' });
  t.after(iso.cleanup);
  const bin = join(iso.base, 'bin');
  mkdirSync(bin);
  // Every call: a version line with escapes and no x.y.z on stdout, the same on stderr.
  const line = String.raw`printf 'Claude\033]0;pwned\007 Code\033[2J\302\23331m\342\200\256 vX\n'`;
  writeFileSync(join(bin, 'claude'), `#!/bin/sh\n${line}\n${line} >&2\nexit 0\n`);
  chmodSync(join(bin, 'claude'), 0o755);
  const env = { ...iso.env, PATH: [bin, '/usr/bin', '/bin'].join(delimiter) };
  const { text, env: envelope } = await expectInert('doctor', ['doctor'], { env, cwd: iso.base });
  assert.equal(text.code, EXIT.FAIL, text.stderr);
  assert.ok(strings(envelope).some((s) => HOSTILE.test(s)), `the envelope carries claude's output: ${JSON.stringify(envelope)}`);
  assert.match(text.stderr, /Claude Code vX/, 'the printable part is kept');
});
