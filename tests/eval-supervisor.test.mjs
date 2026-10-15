// The trusted supervisor of the eval post-pass (scripts/eval-hidden.mjs, scripts/eval-lib/): candidate code runs in
// a confined child and answers calls over a JSON protocol; verdicts come only from trusted code. Tested here: the
// protocol, every way found in review for candidate code to forge a pass (each a negative test), confinement and
// its refusal, the hardened git reader, kept-run handling and the command line. A synthetic one-case suite keeps
// these tests independent of the real cases. This file holds no plugin name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isolateProcessEnv } from './helpers/isolated-env.mjs';
import { EVALS, POST, ROOT, git, keptRun, out, post, probeSuite, scaffold, solved, tempDir } from './helpers/eval-cases.mjs';
import { CandidateFailure, candidate } from '../scripts/eval-lib/candidate.mjs';
import { Refused, command, decide, detect, sandboxProfile } from '../scripts/eval-lib/confine.mjs';

isolateProcessEnv();

const LIB = join(ROOT, 'scripts', 'eval-lib');
const CLIENT = pathToFileURL(join(LIB, 'candidate.mjs')).href;
const CONF = decide(detect(), { allowUnconfined: true });
const CONFINED = !CONF.unconfined;

// A confined session over a workspace built from { 'src/m.mjs': source, ... }.
function session(files, { callTimeoutMs = 3000, observe } = {}) {
  const base = tempDir('client');
  const ws = join(base, 'ws');
  const scratch = join(base, 'scratch');
  mkdirSync(scratch, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(ws, rel, '..'), { recursive: true });
    writeFileSync(join(ws, rel), text);
  }
  const spec = command(CONF, { script: join(LIB, 'candidate-host.mjs'), args: [ws], read: [ws, LIB], write: [scratch], cwd: ws });
  return { c: candidate({ config: { root: ws, ...spec, callTimeoutMs }, observe }), ws };
}

test('protocol: exports, handles, callbacks, thrown errors and observed arguments cross as data', () => {
  const { c } = session({
    'src/m.mjs': [
      'export const add = (a, b) => a + b;',
      "export const boom = () => { throw new RangeError('bad'); };",
      'export const sortIt = (xs) => xs.sort();',
      'export function createStore() { const items = []; return { add(x) { items.push(x); return items.length; }, all() { return items.slice(); } }; }',
      "export const use = (store, x, when) => { store.add(x); return [store.all(), when.toISOString()]; };",
      "export const logger = (out) => ({ info: (m) => out.log('info:' + m) });",
      "export const table = () => new Map([[1, { id: 1 }]]);",
      'export const later = async (x) => x * 2;',
      "export const value = 'constant';",
      "console.log('loaded');",
    ].join('\n'),
  });
  const m = c.module('src/m.mjs');
  assert.equal(m.add(2, 3), 5);
  assert.equal(m.value, 'constant');
  assert.equal(m.later(4), 8);
  assert.throws(() => m.boom(), (err) => err instanceof RangeError && err.message === 'bad' && err.fromCandidate === true);
  const input = ['b', 'a'];
  const seen = c.observe(m.sortIt, input);
  assert.deepEqual([seen.value, seen.args[0], input], [['a', 'b'], ['a', 'b'], ['b', 'a']], 'the candidate sorts its own copy');
  const store = m.createStore();
  assert.deepEqual(m.use(store, 'x', new Date(Date.UTC(2026, 0, 2))), [['x'], '2026-01-02T00:00:00.000Z']);
  assert.deepEqual(store.all(), ['x'], 'a returned object keeps its identity when passed back');
  const lines = [];
  m.logger({ log: (s) => lines.push(s) }).info('hi');
  assert.deepEqual(lines, ['info:hi'], 'callbacks are recorded in the child and replayed here');
  assert.deepEqual(m.table().get(1), { id: 1 }, 'methods of non-plain values are invoked in the child');
  assert.equal(c.output().stdout, 'loaded\n');
  c.close();
});

test('protocol failures fail the trusted process: early exit, timeout, oversized answers', () => {
  const run = (src, call) => {
    const { c } = session({ 'src/m.mjs': src }, { callTimeoutMs: 1500 });
    const saved = process.exitCode;
    let failure;
    try { call(c.module('src/m.mjs')); } catch (err) { failure = err; }
    const code = process.exitCode;
    process.exitCode = saved;
    c.close();
    return { failure, code };
  };
  for (const [label, src, call] of [
    ['exit during a call', "export const f = () => { process.stdout.write('# pass 1\\n# fail 0\\n'); process.exit(0); };", (m) => m.f()],
    ['endless loop', 'export const f = () => { for (;;) {} };', (m) => m.f()],
  ]) {
    const { failure, code } = run(src, call);
    assert.ok(failure instanceof CandidateFailure, `${label}: ${failure}`);
    assert.equal(code, 1, `${label}: the trusted process exits non-zero`);
  }
  const { c } = session({ 'src/m.mjs': "export const f = () => 'x'.repeat(40 * 1024 * 1024);" });
  assert.throws(() => c.module('src/m.mjs').f(), /too large/, 'an oversized answer is an error, never a value');
  c.close();
});

test('output: every byte is scanned for watched values beyond the stored cap, and truncation is reported', () => {
  const { c } = session({
    'src/m.mjs': "export const f = (s) => { process.stdout.write('x'.repeat(3 * 1024 * 1024)); console.log('tail ' + s); process.stderr.write('e:' + s); };\nexport const g = () => 'quiet';",
  }, { callTimeoutMs: 10000 });
  c.watch('sekrit-value', 'never-written');
  c.module('src/m.mjs').f('sekrit-value');
  const o = c.output();
  assert.equal(o.truncated, true, 'more than the cap was written');
  assert.ok(o.stdout.length <= 1024 * 1024, 'stored output stays bounded');
  assert.deepEqual(o.hits, { 'sekrit-value': 2, 'never-written': 0 }, 'found on stdout past the cap and on stderr');
  c.close();
  const quiet = session({ 'src/m.mjs': "export const g = () => 'quiet';" }).c;
  quiet.watch('anything');
  quiet.module('src/m.mjs').g();
  assert.deepEqual([quiet.output().truncated, quiet.output().hits], [false, { anything: 0 }]);
  quiet.close();
});

test('the output scanner finds a value split across chunks', async () => {
  const { scanner } = await import('../scripts/eval-lib/scan.mjs');
  const scan = scanner(['abcdef', 'zz']);
  for (const chunk of ['xxab', 'c', 'def', 'xx', 'abcd', 'efz', 'z']) scan.push(chunk);
  assert.deepEqual(scan.hits(), { abcdef: 2, zz: 1 });
});

function probe(source, suite = probeSuite(), extra = []) {
  const ws = tempDir('probe-ws');
  mkdirSync(join(ws, 'src'));
  writeFileSync(join(ws, 'package.json'), '{"type": "module"}\n');
  writeFileSync(join(ws, 'src', 'm.mjs'), source);
  const r = post(['--workspace', ws, '--case', 'probe', '--evals', suite.evals, '--hidden', suite.hidden, ...extra]);
  assert.ok([0, 1].includes(r.status), out(r));
  return { ...JSON.parse(r.stdout).runs[0], report: JSON.parse(r.stdout), ws };
}

test('candidate code cannot forge a pass: printed TAP, exit 0, forged protocol answers or a patched assert', () => {
  const forgeries = {
    'TAP summary and exit 0 at import': "export const add = (a, b) => a - b;\nprocess.stdout.write('TAP version 13\\nok 1 - adds\\n1..1\\n# tests 1\\n# pass 1\\n# fail 0\\n');\nprocess.exit(0);\n",
    'TAP summary and exit 0 during the call': "export const add = () => { process.stdout.write('# pass 1\\n# fail 0\\n'); process.exit(0); };\n",
    'forged protocol answers on the answer pipe': [
      "import { writeSync } from 'node:fs';",
      "for (let id = 1; id < 50; id++) writeSync(3, JSON.stringify({ id, ok: true, value: ['o', [['add', ['n', 5]]]] }) + '\\n');",
      'export const add = (a, b) => a - b;',
      '',
    ].join('\n'),
    'assert patched inside the candidate': "import assert from 'node:assert';\nimport strict from 'node:assert/strict';\nassert.equal = () => {}; strict.equal = () => {};\nexport const add = (a, b) => a - b;\n",
    'reporter output forged on stderr': "process.stderr.write('{\"type\":\"pass\",\"name\":\"adds\",\"nesting\":0}\\n');\nexport const add = (a, b) => a * b;\n",
  };
  for (const [label, source] of Object.entries(forgeries)) {
    const run = probe(source);
    assert.equal(run.status, 'fail', `${label}\n${JSON.stringify(run.checks, null, 2)}`);
    assert.equal(run.quality, 0, label);
  }
  assert.equal(probe('export const add = (a, b) => a + b;\n').status, 'pass', 'control: an honest correct candidate passes');
});

test('hidden tests are outside the candidate view: not in its workspace, unreadable by path, no credentials in its env', () => {
  const suite = probeSuite({
    hiddenSource: [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { fileURLToPath } from 'node:url';",
      `import { candidate } from ${JSON.stringify(CLIENT)};`,
      "const m = candidate().module('src/m.mjs');",
      "test('no hidden file in the workspace', () => assert.deepEqual(m.listing().filter((f) => /hidden/.test(f)), []));",
      `test('reading this file by path', () => assert.equal(m.peek(fileURLToPath(import.meta.url)), ${CONFINED ? "'ERR_ACCESS_DENIED'" : "'read'"}));`,
      "// macOS itself adds __CF_USER_TEXT_ENCODING to every process; nothing else may come through.",
      "test('environment', () => assert.deepEqual(m.envKeys().filter((k) => !k.startsWith('__CF_')), ['PATH', 'TZ']));",
      `test('writing into the workspace or a temp dir', () => { for (const code of m.writes()) assert.notEqual(code, ${CONFINED ? "'ok'" : "'never'"}); });`,
      '',
    ].join('\n'),
  });
  const source = [
    "import { readFileSync, readdirSync, writeFileSync } from 'node:fs';",
    "import { tmpdir } from 'node:os';",
    "import { join } from 'node:path';",
    'const root = process.cwd();',
    "export const listing = () => readdirSync(root, { recursive: true }).map(String);",
    "export const peek = (p) => { try { readFileSync(p); return 'read'; } catch (e) { return e.code; } };",
    'export const envKeys = () => Object.keys(process.env).sort();',
    `export const writes = () => [join(root, 'planted.txt')${CONFINED ? ", join(tmpdir(), 'planted-by-candidate.txt'), '/tmp/planted-by-candidate.txt'" : ''}].map((p) => { try { writeFileSync(p, 'x'); return 'ok'; } catch (e) { return e.code ?? 'error'; } });`,
    'export const add = (a, b) => a + b;',
    '',
  ].join('\n');
  const run = probe(source, suite);
  assert.equal(run.status, 'pass', JSON.stringify(run.checks, null, 2));
  assert.ok(!existsSync(join(run.ws, 'planted.txt')), 'the source workspace is never written');
});

test('network from candidate code is refused where the platform can refuse it', () => {
  const suite = probeSuite({
    hiddenSource: [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      `import { candidate } from ${JSON.stringify(CLIENT)};`,
      "const m = candidate().module('src/m.mjs');",
      "test('connect to a closed local port', () => { const code = m.connect(); process.stdout.write(`# connect ${code}\\n`); if (process.env.EXPECT_DENIED === '1') assert.notEqual(code, 'ECONNREFUSED'); });",
      '',
    ].join('\n'),
  });
  const source = [
    "import net from 'node:net';",
    "export const connect = () => new Promise((resolve) => { const s = net.connect(9, '127.0.0.1'); s.on('connect', () => { s.destroy(); resolve('connected'); }); s.on('error', (e) => resolve(e.code ?? 'error')); });",
    'export const add = (a, b) => a + b;',
    '',
  ].join('\n');
  const denies = CONF.os_sandbox !== null || process.allowedNodeEnvironmentFlags.has('--allow-net');
  writeFileSync(join(suite.hidden, 'probe', 'probe.hidden.test.mjs'), readFileSync(join(suite.hidden, 'probe', 'probe.hidden.test.mjs'), 'utf8').replace("process.env.EXPECT_DENIED === '1'", String(denies)));
  assert.equal(probe(source, suite).status, 'pass');
});

test('without the permission model the post-pass refuses, unless --allow-unconfined is given and recorded', () => {
  const preload = join(tempDir('preload'), 'no-permission.mjs');
  writeFileSync(preload, [
    "const flags = new Set([...process.allowedNodeEnvironmentFlags].filter((f) => f !== '--permission'));",
    "Object.defineProperty(process, 'allowedNodeEnvironmentFlags', { value: flags, configurable: true });",
    '',
  ].join('\n'));
  const suite = probeSuite();
  const ws = tempDir('unconfined-ws');
  mkdirSync(join(ws, 'src'));
  writeFileSync(join(ws, 'src', 'm.mjs'), 'export const add = (a, b) => a + b;\n');
  const args = ['--import', preload, POST, '--workspace', ws, '--case', 'probe', '--evals', suite.evals, '--hidden', suite.hidden];
  const refused = spawnSync(process.execPath, args, { encoding: 'utf8', env: process.env });
  assert.equal(refused.status, 2, out(refused));
  assert.match(refused.stderr, /permission model.*--allow-unconfined/s);
  const allowed = spawnSync(process.execPath, [...args, '--allow-unconfined'], { encoding: 'utf8', env: process.env });
  assert.equal(allowed.status, 0, out(allowed));
  const report = JSON.parse(allowed.stdout);
  assert.equal(report.confinement.unconfined, true);
  assert.equal(report.confinement.unconfined_allowed, true);
  assert.equal(report.runs[0].status, 'pass');
});

test('confinement: detection, refusal, the OS sandbox profile and command lines, and an env of PATH and TZ only', () => {
  assert.throws(() => decide(detect({ flags: new Set(), platform: 'linux', which: () => false })), Refused);
  assert.deepEqual(decide(detect({ flags: new Set(), platform: 'linux', which: () => false }), { allowUnconfined: true }), {
    node_permission: false, test_isolation: null, os_sandbox: null, unconfined: true, unconfined_allowed: true,
  });
  const mac = decide(detect({ flags: new Set(['--permission', '--test-isolation']), platform: 'darwin', exists: () => true }));
  assert.equal(mac.os_sandbox, 'sandbox-exec');
  const profile = sandboxProfile(['/w/scratch']);
  for (const line of ['(deny network*)', '(deny file-write*)', '(allow file-write* (subpath "/w/scratch"))']) assert.ok(profile.includes(line), line);
  const macCmd = command(mac, { node: '/n', script: '/h.mjs', args: ['/w/ws'], read: ['/w/ws', '/lib'], write: ['/w/scratch'], cwd: '/w/ws' });
  assert.equal(macCmd.command, '/usr/bin/sandbox-exec');
  assert.ok(macCmd.args.includes('--permission') && macCmd.args.includes('--allow-fs-read=/w/ws') && macCmd.args.includes('--allow-fs-write=/w/scratch'));
  assert.deepEqual(Object.keys(macCmd.env).sort(), ['PATH', 'TZ']);
  const linux = decide(detect({ flags: new Set(['--permission']), platform: 'linux', which: (name) => name === 'bwrap' }));
  const linuxCmd = command(linux, { node: '/n', script: '/h.mjs', read: ['/tmp/ws'], write: ['/tmp/scratch'], cwd: '/tmp/ws' });
  assert.equal(linuxCmd.command, 'bwrap');
  const a = linuxCmd.args.join(' ');
  for (const part of ['--unshare-all', '--ro-bind / /', '--tmpfs /tmp', '--ro-bind /tmp/ws /tmp/ws', '--bind /tmp/scratch /tmp/scratch', '--die-with-parent']) assert.ok(a.includes(part), part);
  assert.ok(a.indexOf('--tmpfs /tmp') < a.indexOf('--ro-bind /tmp/ws'), 'workspace binds come after the tmpfs that would hide them');
  const bare = command(decide(detect({ flags: new Set(), platform: 'linux', which: () => false }), { allowUnconfined: true }), { node: '/n', script: '/h.mjs' });
  assert.deepEqual([bare.command, bare.args.includes('--permission')], ['/n', false]);
});

test('the git reader never runs repository configuration, hooks or attribute drivers', () => {
  const suite = probeSuite({ completion: [{ check: 'hidden-tests' }, { check: 'secret-absent', secret: 'probe-key' }] });
  const marker = join(tempDir('marker'), 'ran.txt');
  const script = join(tempDir('evil'), 'evil.sh');
  writeFileSync(script, `#!/bin/sh\necho ran >> ${marker}\ncat\n`);
  chmodSync(script, 0o755);
  const ws = tempDir('evil-ws');
  mkdirSync(join(ws, 'src'));
  writeFileSync(join(ws, 'src', 'm.mjs'), 'export const add = (a, b) => a + b;\n');
  git(ws, ['init', '-q']);
  git(ws, ['add', '-A']);
  git(ws, ['commit', '-q', '-m', 'base']);
  writeFileSync(join(ws, '.gitattributes'), '* filter=evil diff=evil\n');
  const cfg = readFileSync(join(ws, '.git', 'config'), 'utf8');
  writeFileSync(join(ws, '.git', 'config'), `${cfg}[core]\n\tfsmonitor = ${script}\n\thooksPath = ${join(ws, 'hooks')}\n[filter "evil"]\n\tclean = ${script}\n\tsmudge = ${script}\n[diff "evil"]\n\ttextconv = ${script}\n\tcommand = ${script}\n`);
  mkdirSync(join(ws, '.git', 'hooks'), { recursive: true });
  for (const hook of ['pre-commit', 'post-checkout', 'reference-transaction']) {
    writeFileSync(join(ws, '.git', 'hooks', hook), `#!/bin/sh\necho ran >> ${marker}\n`);
    chmodSync(join(ws, '.git', 'hooks', hook), 0o755);
  }
  writeFileSync(join(ws, 'notes.txt'), 'nothing secret\n');
  const r = post(['--workspace', ws, '--case', 'probe', '--evals', suite.evals, '--hidden', suite.hidden]);
  assert.equal(r.status, 0, out(r));
  const run = JSON.parse(r.stdout).runs[0];
  assert.equal(run.checks.find((x) => x.check === 'secret-absent').ok, true, JSON.stringify(run.checks, null, 2));
  assert.ok(!existsSync(marker), 'repository configuration ran');
});

// --- kept runs and the command line ------------------------------------------------------------------

const modeOf = (p) => statSync(p).mode & 0o777;

test('kept runs: sealed workspaces are checked per arm from either result shape and left sealed and untouched', () => {
  const name = 'typo-fix';
  const exposed = `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Bash","input":{"command":"ls ../../evals-hidden/${name}/"}}]}}\n`;
  const withRun = keptRun(solved(name));
  const withoutRun = keptRun(scaffold(name), { trace: exposed });
  const lost = join(tempDir('lost'), 'never-kept', 'out', 'trace.jsonl');
  const aggregate = join(tempDir('results'), 'aggregate-result.json');
  writeFileSync(aggregate, JSON.stringify({
    schemaVersion: 1,
    partial: false,
    suite: { root: join(EVALS, '..'), ablation: 'with-without' },
    cases: [
      { name, dir: `evals/${name}`, arms: { with: [{ score: 1, tracePath: withRun.trace }], without: [{ score: 1, tracePath: withoutRun.trace }, { score: 0, tracePath: lost }] } },
      { name: 'ghost', dir: 'evals/ghost', arms: { with: [{ score: 1, tracePath: lost }] } },
    ],
  }));
  try {
    const r = post(['--results', aggregate]);
    assert.equal(r.status, 1, `one run was not kept\n${out(r)}`);
    const report = JSON.parse(r.stdout);
    const at = (arm, run) => report.runs.find((x) => x.arm === arm && x.run === run);
    assert.deepEqual([at('with', 1).status, at('with', 1).quality, at('with', 1).score, at('with', 1).hidden_exposed], ['pass', 1, 1, false]);
    assert.deepEqual([at('without', 1).status, at('without', 1).quality, at('without', 1).hidden_exposed], ['fail', 0, true]);
    assert.equal(at('without', 2).status, 'unchecked');
    assert.match(at('without', 2).reason, /--keep-temp/);
    assert.deepEqual(report.cases[name], { with: { runs: 1, complete: 1, incomplete: 0, unchecked: 0 }, without: { runs: 2, complete: 0, incomplete: 1, unchecked: 1 } });
    assert.deepEqual(report.cases_without_completion, ['ghost']);
    assert.deepEqual(Object.keys(report.suite_lock).sort(), ['current', 'sha256']);
    for (const run of [withRun, withoutRun]) {
      assert.equal(modeOf(run.root), 0o500, 'kept root mode restored');
      assert.equal(modeOf(join(run.root, 'sealed')), 0o000, 'sealed mode restored');
    }
    chmodSync(join(withRun.root, 'sealed'), 0o500);
    assert.ok(!existsSync(join(withRun.root, 'sealed', 'home', 'cwd', '__hidden__')), 'nothing is written into a kept workspace');

    const snake = join(tempDir('results'), 'snake.json');
    writeFileSync(snake, JSON.stringify({ cases: [{ name, dir: name, runs: [{ score: 1, trace_path: withRun.trace }] }] }));
    const outFile = join(tempDir('report'), 'hidden.json');
    const j = post(['--results', snake, '--case', name, '--out', outFile]);
    assert.equal(j.status, 0, out(j));
    assert.equal(j.stdout, '');
    assert.deepEqual(JSON.parse(readFileSync(outFile, 'utf8')).runs.map((x) => [x.case, x.arm, x.run, x.status]), [[name, 'with', 1, 'pass']]);
  } finally {
    for (const run of [withRun, withoutRun]) { chmodSync(run.root, 0o700); chmodSync(join(run.root, 'sealed'), 0o700); }
  }
});

test('command line: usage and input errors exit 2', () => {
  const bad = join(tempDir('bad'), 'not-a-result.json');
  writeFileSync(bad, '{"hello":1}');
  const none = join(tempDir('bad'), 'none.json');
  writeFileSync(none, JSON.stringify({ cases: [{ name: 'ghost', arms: { with: [{ tracePath: '' }] } }] }));
  const ws = tempDir('cli-ws');
  for (const args of [[], ['--frobnicate'], ['--workspace', ws], ['--results', '/nonexistent/x.json'], ['--results', bad],
    ['--results', bad, '--workspace', ws, '--case', 'typo-fix'], ['--workspace', ws, '--case', 'no-such-case'],
    ['--workspace', ws, '--case', 'typo-fix', '--timeout', '0'], ['--results'], ['--results', none],
    ['--workspace', ws, '--case', '../typo-fix'], ['--results', bad, '--trace', bad], ['--workspace', ws, '--case', 'typo-fix', '--hidden', join(ws, 'none')]]) {
    const r = post(args);
    assert.equal(r.status, 2, `${args.join(' ')}\n${out(r)}`);
  }
  assert.equal(post(['--help']).status, 0);
});

