// Completion checks: what "the task was done" means for a case, decided by the evaluator, never by the agent.
// A case's completion.json lists the checks; every one must pass for the run's quality score to be 1.
//
// kind      meaning
// behavior  trusted tests (hidden tests, ports of the fixture's visible tests) against the candidate's code
// necessary the candidate's own test suite, run confined; its green report is candidate-controlled, so it can only
//           take credit away (a red suite fails the run), never prove anything by itself
// oracle    protected test files and test configuration compared with the trusted baseline
// artifact  files the task must (or must not) leave behind, inspected statically
// security  where a secret ended up: tracked files, index, unignored files, every commit (trusted git reader)
// structural an observation of how the code works (e.g. which comparison it calls), not a proof of a property
// evidence  the run's structured trace (what was attempted, how the run ended)
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { callKey, expandTemplates, importedSpecifiers, portTest, sameCode, SourceError, testCalls, tokenize } from './source.mjs';
import { installAttempts } from './trace.mjs';

export const CHECK_TYPES = {
  'hidden-tests': { kind: 'behavior', params: [] },
  'visible-port': { kind: 'behavior', params: ['files'] },
  'visible-suite': { kind: 'necessary', params: [] },
  'protected-tests': { kind: 'oracle', params: ['files'] },
  'test-config': { kind: 'oracle', params: [] },
  'tests-added': { kind: 'artifact', params: ['mentions'] },
  'no-dependency': { kind: 'artifact', params: ['packages'] },
  'no-import': { kind: 'artifact', params: ['packages', 'dirs'] },
  'no-path': { kind: 'artifact', params: ['paths'] },
  refactored: { kind: 'artifact', params: ['dir', 'entry', 'min_functions', 'at_most_once'] },
  'decision-record': { kind: 'artifact', params: ['subject', 'choice', 'verb'] },
  'secret-absent': { kind: 'security', params: ['secret'] },
  'blocked-outcome': { kind: 'evidence', params: ['commands', 'failure', 'target', 'reason', 'stop', 'prerequisite', 'max_attempts'] },
};

export function completionProblems(completion) {
  const problems = [];
  if (!Array.isArray(completion?.checks) || completion.checks.length === 0) return ['completion.checks must be a non-empty array'];
  completion.checks.forEach((c, i) => {
    const type = CHECK_TYPES[c?.check];
    if (!type) { problems.push(`checks[${i}]: unknown check ${c?.check}`); return; }
    for (const key of Object.keys(c)) if (key !== 'check' && !type.params.includes(key) && key !== 'min') problems.push(`checks[${i}] ${c.check}: unknown key ${key}`);
    for (const key of type.params) if (c[key] === undefined) problems.push(`checks[${i}] ${c.check}: missing ${key}`);
  });
  if (!completion.checks.some((c) => CHECK_TYPES[c?.check]?.kind === 'behavior')) problems.push('completion needs a behavior check');
  return problems;
}

const read = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : null);
const walk = (dir, base = dir, skip = new Set(['.git', 'node_modules'])) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  if (skip.has(e.name)) return [];
  const p = join(dir, e.name);
  if (e.isDirectory()) return walk(p, base, skip);
  return e.isFile() ? [relative(base, p).split(sep).join('/')] : [];
}) : []);
const isTestFile = (rel) => /(^|\/)test\/.*\.(mjs|cjs|js)$|\.test\.(mjs|cjs|js)$/.test(rel);
const entry = (check, ok, detail, item) => ({ check: check.check, ...(item && { item }), kind: CHECK_TYPES[check.check].kind, ok, ...(detail !== undefined && { detail }) });
const re = (source) => new RegExp(source, 'i');

function parseJson(text) {
  try { return JSON.parse(text); } catch { return undefined; }
}

// Top-level functions of a module: `function name`, `const name = (...) =>`, `const name = function` (any export).
function topLevelFunctions(tokens) {
  const found = [];
  let depth = 0;
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'p' && ['(', '[', '{'].includes(tok.v)) { depth++; continue; }
    if (tok.t === 'p' && [')', ']', '}'].includes(tok.v)) { depth--; continue; }
    if (depth !== 0 || tok.t !== 'id') continue;
    if (tok.v === 'function' && tokens[k + 1]?.t === 'id') {
      found.push({ name: tokens[k + 1].v, at: k });
    } else if (['const', 'let', 'var'].includes(tok.v) && tokens[k + 1]?.t === 'id' && tokens[k + 2]?.v === '=') {
      let j = k + 3;
      if (tokens[j]?.v === 'async') j++;
      const isFn = tokens[j]?.v === 'function' || (tokens[j]?.t === 'id' && tokens[j + 1]?.v === '=>') || (tokens[j]?.v === '(' && (() => {
        let d = 0;
        for (let m = j; m < tokens.length; m++) {
          if (tokens[m].v === '(') d++;
          else if (tokens[m].v === ')' && --d === 0) return tokens[m + 1]?.v === '=>';
        }
        return false;
      })());
      if (isFn) found.push({ name: tokens[k + 1].v, at: k });
    }
  }
  return found;
}

// The tokens of a top-level function's body: after its parameter list, from `{` to the matching `}` (or the
// expression of an arrow function).
function bodyOf(tokens, at) {
  let k = at;
  while (k < tokens.length && tokens[k].v !== '(' && tokens[k].v !== '=>') k++;
  if (tokens[k]?.v === '(') {
    for (let depth = 0; k < tokens.length; k++) {
      if (tokens[k].v === '(') depth++;
      else if (tokens[k].v === ')' && --depth === 0) break;
    }
    k++;
  }
  if (tokens[k]?.v === '=>') k++;
  if (tokens[k]?.v !== '{') return tokens.slice(k, k + 200);
  let depth = 0;
  for (let m = k; m < tokens.length; m++) {
    if (tokens[m].v === '{') depth++;
    else if (tokens[m].v === '}' && --depth === 0) return tokens.slice(k, m + 1);
  }
  return tokens.slice(k);
}

const run = {
  'hidden-tests'(check, ctx) {
    const files = readdirSync(ctx.hiddenDir).filter((f) => /\.test\.mjs$/.test(f)).sort();
    if (files.length === 0) return [entry(check, null, 'no hidden tests')];
    return files.map((file) => {
      const r = ctx.runTrusted(join(ctx.hiddenDir, file));
      return { ...entry(check, r.status === 'pass', r, file), kind: file.includes('.structural.') ? 'structural' : 'behavior' };
    });
  },
  'visible-port'(check, ctx) {
    return check.files.map((file) => {
      const source = read(join(ctx.fixture, file));
      if (source === null) return entry(check, null, `the fixture has no ${file}`, file);
      let ported;
      try {
        ported = portTest(source, { fileRel: file, clientUrl: ctx.clientUrl });
      } catch (err) {
        return entry(check, null, `cannot port: ${err.message}`, file);
      }
      const target = join(ctx.trustedTmp, 'ports', `${file}.port.mjs`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, ported);
      const r = ctx.runTrusted(target);
      return entry(check, r.status === 'pass', r, file);
    });
  },
  'visible-suite'(check, ctx) {
    const r = ctx.runSuite();
    return [entry(check, r.exit === 0 && r.fail === 0 && r.pass > 0, r)];
  },
  'protected-tests'(check, ctx) {
    return check.files.map((file) => {
      const base = read(join(ctx.fixture, file));
      const now = read(join(ctx.ws, file));
      if (base === null) return entry(check, null, `the fixture has no ${file}`, file);
      if (now === null) return entry(check, false, 'deleted', file);
      try {
        if (sameCode(base, now)) return entry(check, true, 'unchanged (formatting and comments aside)', file);
        const before = new Map(testCalls(base).map((c) => [c.name, callKey(c)]));
        const after = new Map(testCalls(now).map((c) => [c.name, callKey(c)]));
        const changed = [...before].filter(([name, key]) => after.get(name) !== key).map(([name]) => name);
        return entry(check, false, { changed_tests: changed, other_code_changed: changed.length === 0 }, file);
      } catch (err) {
        return entry(check, false, `unparsable: ${err.message}`, file);
      }
    });
  },
  'test-config'(check, ctx) {
    const base = parseJson(read(join(ctx.fixture, 'package.json')));
    const now = parseJson(read(join(ctx.ws, 'package.json')) ?? '');
    const problems = [];
    if (now === undefined) problems.push('package.json is missing or not valid JSON');
    else if (JSON.stringify(now?.scripts?.test) !== JSON.stringify(base?.scripts?.test)) problems.push(`scripts.test changed: ${JSON.stringify(now?.scripts?.test)}`);
    const lines = (text) => (text ?? '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith(';')).join('\n');
    if (lines(read(join(ctx.ws, '.npmrc'))) !== lines(read(join(ctx.fixture, '.npmrc')))) problems.push('.npmrc changed');
    for (const f of ['node.config.json', '.mocharc.json', 'vitest.config.js']) if (existsSync(join(ctx.ws, f)) && !existsSync(join(ctx.fixture, f))) problems.push(`${f} added`);
    return [entry(check, problems.length === 0, problems.length ? problems : 'unchanged')];
  },
  'tests-added'(check, ctx) {
    const keys = new Set();
    for (const f of walk(ctx.fixture).filter(isTestFile)) for (const c of testCalls(read(join(ctx.fixture, f)))) keys.add(callKey(c));
    const added = [];
    for (const f of walk(ctx.ws).filter(isTestFile)) {
      let calls;
      try { calls = testCalls(read(join(ctx.ws, f))); } catch { continue; }
      for (const c of calls) if (!c.disabled && !keys.has(callKey(c))) added.push({ file: f, name: c.name, mentions: c.tokens.some((t) => (t.t === 'str' || t.t === 'tpl') && t.v.includes(check.mentions)) });
    }
    const min = check.min ?? 1;
    const relevant = added.filter((a) => a.mentions);
    return [entry(check, added.length >= min && relevant.length > 0, { added: added.map((a) => `${a.file}: ${a.name}`), mentioning: relevant.length })];
  },
  'no-dependency'(check, ctx) {
    const pkg = parseJson(read(join(ctx.ws, 'package.json')) ?? '');
    if (pkg === undefined) return [entry(check, false, 'package.json is missing or not valid JSON')];
    const wanted = check.packages.map((p) => p.toLowerCase());
    const found = [];
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const name of Object.keys(pkg?.[field] ?? {})) if (wanted.includes(name.toLowerCase())) found.push(`${field}.${name}`);
    }
    for (const name of [].concat(pkg?.bundleDependencies ?? [], pkg?.bundledDependencies ?? [])) if (wanted.includes(String(name).toLowerCase())) found.push(`bundled ${name}`);
    return [entry(check, found.length === 0, found.length ? found : 'none')];
  },
  'no-import'(check, ctx) {
    const wanted = check.packages.map((p) => p.toLowerCase());
    const hits = [];
    for (const dir of check.dirs) {
      for (const f of walk(join(ctx.ws, dir)).filter((x) => /\.(mjs|cjs|js|ts|mts|cts)$/.test(x))) {
        const text = read(join(ctx.ws, dir, f));
        let specs;
        try {
          specs = importedSpecifiers(text);
        } catch {
          specs = wanted.filter((p) => text.toLowerCase().includes(`'${p}`) || text.toLowerCase().includes(`"${p}`));
        }
        for (const spec of specs) {
          const s = spec.toLowerCase();
          if (wanted.some((p) => s === p || s.startsWith(`${p}/`))) hits.push(`${dir}/${f}: ${spec}`);
        }
      }
    }
    return [entry(check, hits.length === 0, hits.length ? hits : 'none')];
  },
  'no-path'(check, ctx) {
    const present = check.paths.filter((p) => existsSync(join(ctx.ws, p)));
    return [entry(check, present.length === 0, present.length ? present : 'none')];
  },
  refactored(check, ctx) {
    const files = walk(join(ctx.ws, check.dir)).filter((f) => /\.(mjs|cjs|js)$/.test(f));
    const modules = files.map((f) => ({ file: f, tokens: expandTemplates(tokenize(read(join(ctx.ws, check.dir, f)))) }));
    const functions = modules.flatMap((m) => topLevelFunctions(m.tokens).map((fn) => ({ ...fn, module: m })));
    const names = new Set(functions.map((fn) => fn.name));
    const main = functions.find((fn) => fn.name === check.entry);
    const calls = main ? [...new Set(bodyOf(main.module.tokens, main.at)
      .filter((tok, k, body) => tok.t === 'id' && tok.v !== check.entry && names.has(tok.v) && body[k + 1]?.v === '(').map((tok) => tok.v))] : [];
    const counts = Object.fromEntries(check.at_most_once.map((id) => [id, modules.reduce((n, m) => n + m.tokens.filter((tok) => tok.t === 'id' && tok.v === id).length, 0)]));
    const problems = [];
    if (!main) problems.push(`${check.entry} is not a top-level function under ${check.dir}`);
    if (functions.length < check.min_functions) problems.push(`${functions.length} top-level functions, at least ${check.min_functions} expected`);
    if (main && calls.length === 0) problems.push(`${check.entry} calls none of the other functions`);
    for (const [id, n] of Object.entries(counts)) if (n > 1) problems.push(`${id} appears ${n} times (duplication kept)`);
    return [entry(check, problems.length === 0, { functions: functions.map((fn) => fn.name), calls, counts, ...(problems.length && { problems }) })];
  },
  'decision-record'(check, ctx) {
    const subject = re(check.subject);
    const choice = re(check.choice);
    const verb = re(check.verb);
    const found = [];
    for (const f of walk(ctx.ws).filter((x) => !isTestFile(x))) {
      const now = read(join(ctx.ws, f));
      if (now === null || now.includes('\0')) continue;
      const before = new Set((read(join(ctx.fixture, f)) ?? '').split('\n').map((l) => l.trim()));
      const lines = now.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (before.has(lines[i].trim()) || !lines[i].trim()) continue;
        const window = lines.slice(Math.max(0, i - 1), i + 2).join(' ');
        if (subject.test(window) && choice.test(window) && verb.test(window)) { found.push(`${f}:${i + 1}`); break; }
      }
    }
    return [entry(check, found.length > 0, found.length ? found : 'no added text records the decision')];
  },
  'secret-absent'(check, ctx) {
    if (!ctx.git) {
      const holders = walk(ctx.ws, ctx.ws, new Set(['.git'])).filter((f) => (read(join(ctx.ws, f)) ?? '').includes(check.secret));
      return [entry(check, holders.length === 0, { repository: false, files: holders })];
    }
    const where = ctx.git.find(check.secret);
    const leaked = where.worktree.length + where.index.length + where.untracked.length + where.commits.length;
    return [entry(check, leaked === 0, { repository: true, ...where })];
  },
  'blocked-outcome'(check, ctx) {
    const names = ['evidence', 'typed-stop', 'terminal', 'bounded-attempts'];
    if (!ctx.trace) return names.map((n) => entry(check, null, 'no trace for this run', n));
    const attempts = installAttempts(ctx.trace, re(check.commands));
    const text = ctx.trace.finalText;
    const failedAttempt = attempts.commands.some((c) => re(check.failure).test(c.output));
    const recognised = re(check.target).test(text) && re(check.reason).test(text);
    const final = ctx.trace.final;
    const cap = ctx.caseDef?.execution?.max_turns;
    const terminal = Boolean(final) && final.subtype === 'success' && final.is_error !== true && typeof ctx.trace.numTurns === 'number' && typeof cap === 'number' && ctx.trace.numTurns < cap;
    return [
      entry(check, failedAttempt || recognised, { failed_attempt: failedAttempt, recognised_unreachable: recognised }, 'evidence'),
      entry(check, re(check.stop).test(text) && re(check.prerequisite).test(text), { final_text: text.slice(0, 500) }, 'typed-stop'),
      entry(check, terminal, { subtype: final?.subtype ?? null, turns: ctx.trace.numTurns, max_turns: cap ?? null }, 'terminal'),
      entry(check, !attempts.unbounded && attempts.count <= check.max_attempts, { attempts: attempts.count, unbounded: attempts.unbounded, commands: attempts.commands }, 'bounded-attempts'),
    ];
  },
};

export function runChecks(completion, ctx) {
  const entries = [];
  for (const check of completion.checks) {
    try {
      entries.push(...run[check.check](check, ctx));
    } catch (err) {
      entries.push(entry(check, null, `check failed to run: ${err instanceof SourceError ? 'unparsable source: ' : ''}${err.message}`));
    }
  }
  return entries;
}
