// Workspaces and runs for the eval-suite tests: scaffold a case the way the harness does, lay a reference solution
// (tests/fixtures/eval-reference/<case>/) over it, edit files, write synthetic traces, and run the trusted
// post-pass (scripts/eval-hidden.mjs) or the publisher. Every child process gets its env from isolatedEnv().
// The plugin directory is found through lib/name.json, so this file holds no plugin name.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedEnv } from '../helpers/isolated-env.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const POST = join(ROOT, 'scripts', 'eval-hidden.mjs');
export const PUBLISH = join(ROOT, 'scripts', 'eval-publish.mjs');
export const REFERENCE = join(ROOT, 'tests', 'fixtures', 'eval-reference');
export const HIDDEN = join(ROOT, 'evals-hidden');

function locate() {
  const plugins = join(ROOT, 'plugins');
  const hits = existsSync(plugins) ? readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json'))) : [];
  assert.equal(hits.length, 1, `expected exactly one plugins/*/lib/name.json, found ${hits.length}`);
  const dir = join(plugins, hits[0]);
  return { pluginDir: dir, names: JSON.parse(readFileSync(join(dir, 'lib', 'name.json'), 'utf8')) };
}
export const { pluginDir, names } = locate();
export const EVALS = join(pluginDir, 'evals');

const ISO = isolatedEnv({ prefix: 'eval-cases-' });
// A child started from inside a test file must not inherit the runner's context (it would report to the parent).
delete ISO.env.NODE_TEST_CONTEXT;
export const SCRATCH = ISO.base;
let counter = 0;
export function tempDir(label) {
  const dir = join(SCRATCH, `${label}-${++counter}`);
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

export const out = (r) => `exit ${r.status}${r.error ? ` (${r.error.message})` : ''}\nstdout: ${String(r.stdout).slice(0, 4000)}\nstderr: ${String(r.stderr).slice(0, 4000)}`;

export const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = join(dir, e.name);
  if (e.name === '.git') return [];
  return e.isDirectory() ? walk(p, base) : [relative(base, p).split(sep).join('/')];
});

// Runs the case's scaffold as the harness does: bash <script> in an empty workspace.
export function scaffold(name, evals = EVALS) {
  const cwd = join(tempDir(`ws-${name}`), 'cwd');
  mkdirSync(cwd);
  const r = spawnSync('bash', [join(evals, name, 'scaffold.sh')], { cwd, encoding: 'utf8', env: ISO.env, timeout: 60000 });
  assert.equal(r.status, 0, `${name}: scaffold\n${out(r)}`);
  return cwd;
}

export function overlay(name, ws) {
  const ref = join(REFERENCE, name);
  if (existsSync(ref)) cpSync(ref, ws, { recursive: true });
  return ws;
}
export const solved = (name) => overlay(name, scaffold(name));
export const edit = (ws, file, fn) => writeFileSync(join(ws, file), fn(existsSync(join(ws, file)) ? readFileSync(join(ws, file), 'utf8') : ''));

export function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: ISO.env });
  assert.equal(r.status, 0, `git ${args.join(' ')}\n${out(r)}`);
  return r.stdout;
}

export const commitAll = (ws, message) => {
  git(ws, ['add', '-A', '-f']);
  git(ws, ['commit', '-q', '-m', message]);
};

// A stream-json trace like the harness keeps: tools [{ name, input, output, isError }], final text, result subtype.
export function trace({ tools = [], final = '', subtype = 'success', turns = 6, usage = { input_tokens: 1000, output_tokens: 200 } } = {}) {
  const events = [{ type: 'system', subtype: 'init', model: 'test-model', tools: ['Bash', 'Edit', 'Write', 'Read'] }];
  tools.forEach((tool, i) => {
    const id = `toolu_${i}`;
    events.push({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name: tool.name, input: tool.input ?? {} }] } });
    events.push({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content: tool.output ?? '', is_error: Boolean(tool.isError) }] } });
  });
  events.push({ type: 'assistant', message: { content: [{ type: 'text', text: final }] } });
  events.push({ type: 'result', subtype, is_error: subtype !== 'success', num_turns: turns, result: final, usage });
  const file = join(tempDir('trace'), 'trace.jsonl');
  writeFileSync(file, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
  return file;
}

// On a Node without the permission model (older than 22.13) the post-pass refuses by default; these tests run only
// their own fixtures and planted forgeries, so they opt in there (the refusal itself is tested separately).
const UNCONFINED_OK = process.allowedNodeEnvironmentFlags.has('--permission') ? [] : ['--allow-unconfined'];

export function post(args, { env = ISO.env, timeout = 600000 } = {}) {
  const extra = args.includes('--help') ? [] : UNCONFINED_OK;
  return spawnSync(process.execPath, [POST, ...args, ...extra], { encoding: 'utf8', env, timeout, maxBuffer: 64 * 1024 * 1024 });
}

// The post-pass verdict for one workspace: { status, quality, checks, process, failing }.
export function check(name, ws, { traceFile, extra = [] } = {}) {
  const r = post(['--workspace', ws, '--case', name, ...(traceFile ? ['--trace', traceFile] : []), ...extra]);
  assert.ok(r.status === 0 || r.status === 1, `${name}: post-pass\n${out(r)}`);
  const report = JSON.parse(r.stdout);
  assert.equal(report.runs.length, 1, name);
  const run = report.runs[0];
  return { ...run, report, failing: (run.checks ?? []).filter((c) => c.ok !== true).map((c) => (c.item ? `${c.check}:${c.item}` : c.check)).sort() };
}

export function publish(args) {
  return spawnSync(process.execPath, [PUBLISH, ...args], { encoding: 'utf8', env: ISO.env, timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
}

export const isoEnv = ISO.env;

export const CLIENT_URL = pathToFileURL(join(ROOT, 'scripts', 'eval-lib', 'candidate.mjs')).href;

// A synthetic one-case suite ('probe', class trivial, five runs): a module m.mjs whose hidden test asserts
// add(2, 3) === 5, unless hiddenSource replaces it. Keeps evaluator tests independent of the real cases.
export function probeSuite({ hiddenSource, completion = [{ check: 'hidden-tests' }] } = {}) {
  const base = tempDir('probe-suite');
  const evals = join(base, 'evals');
  const hidden = join(base, 'hidden');
  mkdirSync(join(evals, 'probe', 'fixture', 'src'), { recursive: true });
  writeFileSync(join(evals, 'probe', 'case.yaml'), `# probe\n${JSON.stringify({
    schema_version: '1.0', name: 'probe', tags: ['trivial'], runs: 5, execution: { max_turns: 10 },
    graders: [{ type: 'tool_used', name: 'shell-calls', tool: 'Bash', min: 0 }],
  })}\n`);
  writeFileSync(join(evals, 'probe', 'fixture', 'src', 'm.mjs'), 'export const add = (a, b) => a + b;\n');
  writeFileSync(join(evals, 'probe', 'fixture', 'package.json'), '{"type": "module"}\n');
  mkdirSync(join(hidden, 'probe'), { recursive: true });
  writeFileSync(join(hidden, 'probe', 'completion.json'), JSON.stringify({ checks: completion }));
  writeFileSync(join(hidden, 'probe', 'probe.hidden.test.mjs'), hiddenSource ?? [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    `import { candidate } from ${JSON.stringify(CLIENT_URL)};`,
    "const { add } = candidate().module('src/m.mjs');",
    "test('adds', () => assert.equal(add(2, 3), 5));",
    '',
  ].join('\n'));
  return { evals, hidden };
}

// A kept run as the harness leaves it: <root>/out/trace.jsonl and <root>/sealed/home/cwd, sealed read-only.
export function keptRun(workspace, { trace = '' } = {}) {
  const root = tempDir('kept');
  mkdirSync(join(root, 'out'));
  writeFileSync(join(root, 'out', 'trace.jsonl'), trace);
  mkdirSync(join(root, 'sealed', 'home'), { recursive: true });
  cpSync(workspace, join(root, 'sealed', 'home', 'cwd'), { recursive: true });
  chmodSync(join(root, 'sealed'), 0o000);
  chmodSync(root, 0o500);
  return { root, trace: join(root, 'out', 'trace.jsonl') };
}

export function unseal(run) {
  chmodSync(run.root, 0o700);
  chmodSync(join(run.root, 'sealed'), 0o700);
}
