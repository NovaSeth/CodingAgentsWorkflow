// Test isolation guard (S1): no test may run npm, npx, claude, codex or git, or a repository script that runs one of
// the first four, with the real HOME. Every such spawn in tests/**/*.mjs takes its env from
// tests/helpers/isolated-env.mjs: isolatedEnv() per spawn, or isolateProcessEnv() called once at module level. The
// scan is static and reports file:line. It is fail-safe, like the command guard: a program, shell line or node -e
// code it cannot resolve (a computed value, a loop variable, a template expression in command position), and
// child_process loaded at run time, need the same isolation. The helper contract is tested here too.
//
// Static limits that remain (a module-level isolateProcessEnv() covers every one of them):
// - Scripts are not opened. A test that runs a script which runs git is checked only through its own git spawns;
//   the entry point is the launcher (self-checked below).
// - Calls into imported modules (lib/proc, lib/git, other helpers) are not followed.
// - An env value that is not an object literal passes when any name in it reaches the helper, and a name is
//   resolved to its declaration, so a reassignment (`env = process.env`) is not seen.
// - Only the first parameter of a local wrapper is followed to the wrapper's calls; eval, new Function and code
//   run by other interpreters (python -c, perl -e) are not read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lex } from './helpers/lex.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const HELPER_FILE = join(root, 'tests/helpers/isolated-env.mjs');
// Loaded per test, so the scan below runs even while the helper is missing or broken.
const loadHelper = () => import(pathToFileURL(HELPER_FILE).href);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The plugin directory and its names come from name.json, so this file holds no plugin path or codename.
function locate() {
  const plugins = join(root, 'plugins');
  const hits = existsSync(plugins) ? readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json'))) : [];
  assert.equal(hits.length, 1, `expected exactly one plugins/*/lib/name.json, found ${hits.length}`);
  return { pluginRel: `plugins/${hits[0]}`, names: readJson(join(plugins, hits[0], 'lib', 'name.json')) };
}
const { pluginRel, names } = locate();

// Programs a test may run only with a helper env: they read or write per-user state under HOME (git: the global
// config, which carries identity and hooks). Entry points are the repository scripts that run the first four; a
// script that only runs git is not one (nearly every kit script does), its tests spawn git themselves.
const ENTRY_TOOLS = ['npm', 'npx', 'claude', 'codex'];
const TOOLS = new Set([...ENTRY_TOOLS, 'git']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash']);
const SPAWN_FUNCS = new Set(['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']);
const HELPER_NAMES = ['isolatedEnv', 'isolateProcessEnv'];
const HELPER_SPECIFIER = /(^|\/)helpers\/isolated-env\.mjs$/;
// A tool in command position of a shell command line (after an operator, `$(`, assignments or a prefix command).
const commandOf = (tools) => new RegExp(`(?:^|[;&|(\`]|\\$\\()\\s*(?:[A-Za-z_]\\w*=\\S*\\s+)*(?:(?:exec|env|nice|time|command)\\s+)*(?:\\S*\\/)?(${[...tools].join('|')})(?=$|[\\s;&|)])`, 'm');
const ENTRY_TOOL_CMD = commandOf(ENTRY_TOOLS);
// The word in each command position of a shell line (after an operator, `$(`, assignments or a prefix command).
const COMMAND_WORDS = /(?:^|[;&|(`]|\$\()\s*(?:[A-Za-z_]\w*=\S*\s+)*(?:(?:exec|env|nice|time|command)\s+)*([^\s;&|()`]+)/gm;
// A tool named anywhere in `node -e` code.
const CODE_TOOL = new RegExp(`\\b(${[...TOOLS].join('|')})\\b`);
// Stands for the parts of a string the scan cannot know (template expressions, concatenated values).
const UNKNOWN = '\u0001';
const CHILD_PROCESS = ['child_process', 'node:child_process'];
const programOf = (word) => basename(word).replace(/\.(exe|cmd)$/i, '').toLowerCase();

// Repository scripts that run a tool, and how a test names them. `covers` lists the product files whose tool
// spawns run through that entry point (the self-check below fails on a tool spawn no entry point covers).
const ENTRY_POINTS = [
  {
    id: `${pluginRel}/bin/${names.bin}`,
    marker: new RegExp(`\\bnames\\.bin\\b|\\bbin[\\\\/]${escape(names.bin)}\\b`),
    covers: (f) => f === `${pluginRel}/bin/${names.bin}` || f.startsWith(`${pluginRel}/lib/`),
  },
];

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'delete', 'void', 'in', 'of',
  'instanceof', 'await', 'yield', 'async', 'const', 'let', 'var', 'do', 'else', 'try', 'finally', 'throw', 'case', 'default', 'break',
  'continue', 'class', 'extends', 'super', 'this', 'import', 'export', 'null', 'true', 'false', 'undefined']);

// Scope-aware call-site analysis of one test file. A site is a spawn (child_process call, or a call of a local
// function that spawns) that runs a tool as its program, in a shell line (exec strings, `sh -c`, shell: true) or in
// node -e code, judged from the static text of literals and template parts; a repository entry point (its marker,
// or a variable initialised from one); a call of a local function that contains a site; or, fail-safe, a program,
// line or code the scan cannot resolve. Its env must come from the helper: an `env` option whose value reaches
// isolatedEnv()/isolateProcessEnv() through local declarations (an object literal needs a spread of such a value),
// or, with no `env` option, a wrapper that supplies one; isolateProcessEnv() at module level makes process.env
// itself isolated.
function analyze(src, entryPoints = ENTRY_POINTS) {
  const { code, literals, parts } = lex(src);
  const n = code.length;
  const match = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  {
    const stack = [];
    for (let i = 0; i < n; i++) {
      const c = code[i];
      parent[i] = stack.length ? stack[stack.length - 1] : -1;
      if (c === '(' || c === '[' || c === '{') stack.push(i);
      else if (c === ')' || c === ']' || c === '}') { const o = stack.pop(); if (o !== undefined) { match[o] = i; match[i] = o; } }
    }
  }
  const lineAt = (pos) => { let l = 1; for (let i = 0; i < pos; i++) if (code[i] === '\n') l++; return l; };
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const trim = (s, e) => { while (s < e && isSpace(code[s])) s++; while (e > s && isSpace(code[e - 1])) e--; return [s, e]; };
  const closeOf = (o) => (match[o] < 0 ? n : match[o]);
  const prevChar = (pos) => { let j = pos - 1; while (j >= 0 && isSpace(code[j])) j--; return j < 0 ? '' : code[j]; };
  // Ranges of [s, e) split at top-level commas (brackets are skipped as a whole).
  function splitTop(s, e) {
    const parts = [];
    let from = s;
    for (let i = s; i < e; i++) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') { i = closeOf(i); continue; }
      if (c === ',') { parts.push([from, i]); from = i + 1; }
    }
    parts.push([from, e]);
    return parts.map(([a, z]) => trim(a, z)).filter(([a, z]) => a < z);
  }
  // First top-level position in [s, e) of one of the characters (assignment `=` only, not `==`, `=>`, `<=`).
  function findTop(s, e, chars) {
    for (let i = s; i < e; i++) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') { i = closeOf(i); continue; }
      if (!chars.includes(c)) continue;
      if (c === '=' && ('=>'.includes(code[i + 1]) || '=!<>'.includes(code[i - 1]))) continue;
      return i;
    }
    return -1;
  }
  const STATEMENT = /\s*(?:const|let|var|function|test|for|if|return|import|export|while|try|class|assert)\b/y;
  // End of the expression starting at s: a top-level `;` or `,`, the closer of the enclosing bracket, or a new
  // statement on the next line (ASI).
  function exprEnd(s) {
    for (let i = s; i < n; i++) {
      const c = code[i];
      if (c === '(' || c === '[' || c === '{') { i = closeOf(i); continue; }
      if (c === ')' || c === ']' || c === '}' || c === ';' || c === ',') return i;
      if (c === '\n') {
        STATEMENT.lastIndex = i + 1;
        if (STATEMENT.test(code) && !/[=+\-*/%&|^!?:,.([{<>]/.test(prevChar(i))) return i;
      }
    }
    return n;
  }
  const blockOf = (pos) => {
    let j = parent[pos];
    while (j >= 0 && code[j] !== '{') j = parent[j];
    return j < 0 ? [0, n] : [j, closeOf(j) + 1];
  };
  function isFunctionAt(s) {
    let i = s;
    const asyncKw = /^async\s+/.exec(code.slice(i, i + 12));
    if (asyncKw) i += asyncKw[0].length;
    if (/^function\b/.test(code.slice(i, i + 9))) return true;
    if (code[i] === '(') return /^\s*=>/.test(code.slice(closeOf(i) + 1, closeOf(i) + 6));
    return /^[A-Za-z_$][\w$]*\s*=>/.test(code.slice(i, i + 80));
  }
  const firstParamIn = (open) => {
    const parts = splitTop(open + 1, closeOf(open));
    const id = parts.length ? /^[A-Za-z_$][\w$]*$/.exec(code.slice(parts[0][0], parts[0][1]).split('=')[0].trim()) : null;
    return id ? id[0] : null;
  };
  // Name of the first parameter of the function expression at s (null for a pattern or no parameter).
  function firstParamAt(s) {
    let i = s;
    const asyncKw = /^async\s+/.exec(code.slice(i, i + 12));
    if (asyncKw) i += asyncKw[0].length;
    if (/^function\b/.test(code.slice(i, i + 9))) return firstParamIn(code.indexOf('(', i));
    if (code[i] === '(') return firstParamIn(i);
    const id = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, i + 80));
    return id ? id[0] : null;
  }

  // Declarations: const/let/var (with patterns), function declarations, and parameters (default = initializer).
  const decls = [];
  function bindingNames(s, e, out) {
    [s, e] = trim(s, e);
    if (code.startsWith('...', s)) s += 3;
    const first = findTop(s, e, ':=?');
    if (first >= 0 && code[first] === ':' && code[s] !== '{' && code[s] !== '[') return bindingNames(first + 1, e, out);
    const eq = findTop(s, e, '=');
    const [ts, te] = trim(s, eq >= 0 ? eq : e);
    const def = eq >= 0 ? trim(eq + 1, e) : null;
    if (code[ts] === '{' || code[ts] === '[') { for (const [a, z] of splitTop(ts + 1, closeOf(ts))) bindingNames(a, z, out); return; }
    const id = /^[A-Za-z_$][\w$]*$/.exec(code.slice(ts, te));
    if (id) out.push({ name: id[0], pos: ts, def });
  }
  for (const m of code.matchAll(/(?<![\w$.])(?:const|let|var)\s+/g)) {
    let i = m.index + m[0].length;
    const scope = blockOf(m.index);
    for (;;) {
      const names = [];
      let end;
      if (code[i] === '{' || code[i] === '[') { bindingNames(i, closeOf(i) + 1, names); end = closeOf(i) + 1; } else {
        const id = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, i + 200));
        if (!id) break;
        names.push({ name: id[0], pos: i });
        end = i + id[0].length;
      }
      const eq = /^\s*=(?![=>])\s*/.exec(code.slice(end, end + 40));
      if (!eq) { for (const b of names) decls.push({ name: b.name, pos: b.pos, init: null, scope, fn: false }); break; }
      const s = end + eq[0].length;
      const e = exprEnd(s);
      const fn = isFunctionAt(s);
      for (const b of names) decls.push({ name: b.name, pos: b.pos, init: [s, e], scope, fn, param: fn ? firstParamAt(s) : null });
      if (code[e] !== ',') break;
      i = e + 1;
      while (i < n && isSpace(code[i])) i++;
    }
  }
  // Parameters: a default is the initializer; a plain parameter keeps its position, so its value can be checked
  // at every call of its function (fnStart is where that function's expression starts).
  const addParams = (open, fnRange, fnStart) => {
    splitTop(open + 1, closeOf(open)).forEach(([a, z], index) => {
      const out = [];
      bindingNames(a, z, out);
      const plain = out.length === 1 && /^[A-Za-z_$][\w$]*\s*(=|$)/.test(code.slice(a, z));
      for (const b of out) decls.push({ name: b.name, pos: b.pos, init: b.def, scope: fnRange, fn: b.def ? isFunctionAt(b.def[0]) : false, index: plain ? index : undefined, fnStart });
    });
  };
  for (const m of code.matchAll(/(?<![\w$.])function\b\s*\*?\s*([A-Za-z_$][\w$]*)?\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    let body = closeOf(open) + 1;
    while (body < n && isSpace(code[body])) body++;
    const end = code[body] === '{' ? closeOf(body) + 1 : body;
    if (m[1]) decls.push({ name: m[1], pos: m.index, init: [m.index, end], scope: blockOf(m.index), fn: true, param: firstParamIn(open) });
    addParams(open, [open, end], m.index);
  }
  for (const m of code.matchAll(/=>/g)) {
    let j = m.index - 1;
    while (j >= 0 && isSpace(code[j])) j--;
    let bs = m.index + 2;
    while (bs < n && isSpace(code[bs])) bs++;
    const be = code[bs] === '{' ? closeOf(bs) + 1 : exprEnd(bs);
    if (code[j] === ')') addParams(match[j], [match[j], be], match[j]);
    else {
      const id = /[A-Za-z_$][\w$]*$/.exec(code.slice(Math.max(0, j - 80), j + 1));
      const at = j + 1 - (id ? id[0].length : 0);
      if (id) decls.push({ name: id[0], pos: at, init: null, scope: [at, be], fn: false, index: 0, fnStart: at });
    }
  }
  const byName = new Map();
  for (const d of decls) { if (!byName.has(d.name)) byName.set(d.name, []); byName.get(d.name).push(d); }
  // Innermost declaration in scope; in one scope the last one before the use, else the first after (hoisting).
  function resolve(name, pos) {
    let best = null;
    for (const d of byName.get(name) ?? []) {
      if (pos < d.scope[0] || pos >= d.scope[1]) continue;
      const size = d.scope[1] - d.scope[0];
      if (!best || size < best.size) { best = { d, size }; continue; }
      if (size === best.size && d.pos <= pos && (best.d.pos > pos || d.pos > best.d.pos)) best = { d, size };
    }
    return best ? best.d : null;
  }
  // `.name` (a member), but not `...name` (a spread).
  const isMemberName = (pos) => {
    let j = pos - 1;
    while (j >= 0 && isSpace(code[j])) j--;
    return code[j] === '.' && code.slice(j - 2, j + 1) !== '...';
  };
  // Identifier references in [s, e): no keywords, member names or object keys.
  function refs(s, e) {
    const out = [];
    const re = /(?<![\w$§])[A-Za-z_$][\w$]*/g;
    re.lastIndex = s;
    for (let m; (m = re.exec(code)) && m.index < e;) {
      if (KEYWORDS.has(m[0]) || isMemberName(m.index)) continue;
      if (/^\s*:(?!:)/.test(code.slice(m.index + m[0].length, m.index + m[0].length + 4)) && '{,'.includes(prevChar(m.index))) continue;
      out.push({ name: m[0], pos: m.index });
    }
    return out;
  }
  const rawText = (s, e) => code.slice(s, e).replace(/§(\d+)§/g, (_, k) => (typeof literals[k] === 'string' ? `'${literals[k]}'` : '/re/'));

  const usesHelper = literals.some((v) => typeof v === 'string' && HELPER_SPECIFIER.test(v));
  const helperNames = new Set(usesHelper ? HELPER_NAMES : []);
  // child_process bindings: named imports (aliases kept) and namespace/default imports. A file that imports none
  // (require, dynamic import, a fixture) is read with the bare function names.
  const spawnNames = new Map(); // local name -> child_process function
  const cpObjects = new Set();
  for (const m of code.matchAll(/\bimport\s+([^;()§]*?)\s*\bfrom\s*§(\d+)§/g)) {
    if (!CHILD_PROCESS.includes(literals[m[2]])) continue;
    const clause = m[1].trim();
    const ns = /\*\s+as\s+([\w$]+)/.exec(clause);
    if (ns) cpObjects.add(ns[1]);
    const def = /^([\w$]+)\s*(?:,|$)/.exec(clause);
    if (def) cpObjects.add(def[1]);
    const named = /\{([^}]*)\}/.exec(clause);
    for (const part of named ? named[1].split(',') : []) {
      const [orig, local = orig] = part.trim().split(/\s+as\s+/);
      if (SPAWN_FUNCS.has(orig)) spawnNames.set(local, orig);
    }
  }
  if (spawnNames.size === 0 && cpObjects.size === 0) for (const f of SPAWN_FUNCS) spawnNames.set(f, f);
  // child_process loaded at run time (import(), require(), createRequire(…)()): its spawns are invisible here.
  const dynamicLoads = [...code.matchAll(/(?:(?<![\w$.])(?:import|require)|\))\s*\(\s*§(\d+)§\s*\)/g)].filter((m) => CHILD_PROCESS.includes(literals[m[1]])).map((m) => m.index);
  // Calls, in source order.
  const calls = [];
  for (const m of code.matchAll(/(?<![\w$§])([A-Za-z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    if (KEYWORDS.has(name) || /function\s*\*?\s*$/.test(code.slice(Math.max(0, m.index - 12), m.index))) continue;
    const member = isMemberName(m.index);
    const object = member ? (/([A-Za-z_$][\w$]*)\s*\.\s*$/.exec(code.slice(Math.max(0, m.index - 80), m.index)) ?? [])[1] : null;
    const open = m.index + m[0].length - 1;
    // spawn: the child_process function called (null for any other call).
    const spawn = member ? (cpObjects.has(object) && SPAWN_FUNCS.has(name) ? name : null) : (spawnNames.get(name) ?? null);
    calls.push({ name, at: m.index, open, close: closeOf(open), member, spawn });
  }
  const isolated = calls.some((c) => c.name === 'isolateProcessEnv' && helperNames.has(c.name) && parent[c.at] === -1);
  const memo = new Map();
  const remember = (kind, key, f) => {
    const k = `${kind}:${key}`;
    if (memo.has(k)) return memo.get(k);
    memo.set(k, false); // cycle guard
    const v = f();
    memo.set(k, v);
    return v;
  };
  const calleeOf = (c) => {
    if (c.member) return null;
    const d = resolve(c.name, c.at);
    return d && d.fn ? d : null;
  };
  const callsIn = ([s, e]) => calls.filter((c) => c.at >= s && c.at < e);
  const declKey = (d) => `${d.name}@${d.pos}`;

  // Helper-derived values.
  function refIsHelper(r, self) {
    if (helperNames.has(r.name)) return true;
    if (isolated && r.name === 'process' && /^\s*\.\s*env\b/.test(code.slice(r.pos + 7, r.pos + 20))) return true;
    const d = resolve(r.name, r.pos);
    return !!d && d !== self && declIsHelper(d);
  }
  const rangeIsHelper = (s, e, self) => refs(s, e).some((r) => refIsHelper(r, self));
  function exprIsHelper(s, e, self = null) {
    [s, e] = trim(s, e);
    if (code[s] === '{' && match[s] === e - 1) {
      return splitTop(s + 1, e - 1).some(([a, z]) => code.startsWith('...', a) && exprIsHelper(a + 3, z, self));
    }
    return rangeIsHelper(s, e, self);
  }
  const declIsHelper = (d) => remember('helper', declKey(d), () => {
    if (d.init) return d.fn ? rangeIsHelper(d.init[0], d.init[1], d) : exprIsHelper(d.init[0], d.init[1], d);
    return d.index !== undefined && paramIsHelper(d);
  });
  // A plain parameter is helper-derived when its function is called, and every call passes a helper-derived value.
  function paramIsHelper(p) {
    const owner = decls.find((o) => o.fn && o.init && (o.init[0] === p.fnStart || /^async\s*$/.test(code.slice(o.init[0], p.fnStart))));
    if (!owner) return false;
    const uses = calls.filter((c) => !c.member && c.name === owner.name && resolve(c.name, c.at) === owner);
    return uses.length > 0 && uses.every((c) => {
      const arg = argsOf(c)[p.index];
      return !!arg && exprIsHelper(arg[0], arg[1]);
    });
  }

  // Entry-point markers carried by non-function declarations.
  const declEntry = (d) => remember('entry', declKey(d), () => {
    if (!d.init || d.fn) return null;
    const text = rawText(d.init[0], d.init[1]);
    const hit = entryPoints.find((ep) => ep.marker.test(text));
    if (hit) return hit.id;
    for (const r of refs(d.init[0], d.init[1])) {
      const t = resolve(r.name, r.pos);
      const id = t && t !== d ? declEntry(t) : null;
      if (id) return id;
    }
    return null;
  });

  // The `env` option of a call: the last `env` key (or spread carrying one) of an object argument, following
  // identifiers to their object-literal initialisers.
  function envIn(s, e, depth) {
    [s, e] = trim(s, e);
    if (depth > 4 || s >= e) return null;
    if (code[s] === '{' && match[s] === e - 1) {
      let found = null;
      for (const [a, z] of splitTop(s + 1, e - 1)) {
        if (code.startsWith('...', a)) { const inner = envIn(a + 3, z, depth + 1); if (inner) found = inner; continue; }
        const key = /^env\b\s*(:)?/.exec(code.slice(a, z));
        if (key && key[1]) found = trim(a + key[0].length, z);
        else if (key && a + 3 === z) found = [a, z];
      }
      return found;
    }
    const id = /^[A-Za-z_$][\w$]*$/.exec(code.slice(s, e));
    if (id) {
      const d = resolve(id[0], s);
      if (d && d.init && !d.fn) return envIn(d.init[0], d.init[1], depth + 1);
    }
    return null;
  }
  const argsOf = (c) => splitTop(c.open + 1, c.close);
  const envOf = (c) => argsOf(c).reduce((found, [a, z]) => envIn(a, z, 0) ?? found, null);

  const isWrapper = (d) => remember('wrapper', declKey(d), () => d.fn && callsIn(d.init).some((c) => spawns(c, d)));
  function spawns(c, self = null) {
    if (c.spawn) return true;
    const d = calleeOf(c);
    return !!d && d !== self && isWrapper(d);
  }
  // The text of an expression as far as the scan can know it: literals and template parts, constants followed to
  // their initialisers, process.execPath as `node`; UNKNOWN for everything else.
  function staticText(s, e, depth = 0) {
    [s, e] = trim(s, e);
    if (s >= e || depth > 4) return UNKNOWN;
    const text = code.slice(s, e);
    if (/^process\s*\.\s*execPath$/.test(text)) return 'node';
    const lit = /^§(\d+)§/.exec(text);
    if (lit && typeof literals[lit[1]] === 'string') {
      const template = parts[lit[1]];
      const value = template ? template.join(UNKNOWN) : literals[lit[1]];
      // A template is followed by its own expressions; anything else after a literal (`+ x`, `.trim()`) is unknown.
      const rest = s + lit[0].length;
      return value + ((template ? findTop(rest, e, '+') >= 0 : code.slice(rest, e).trim() !== '') ? UNKNOWN : '');
    }
    const id = /^[A-Za-z_$][\w$]*$/.exec(text);
    if (id) {
      const d = resolve(id[0], s);
      if (d && d.init && !d.fn) return staticText(d.init[0], d.init[1], depth + 1);
    }
    return UNKNOWN;
  }
  // The tool among the command words of a shell line, or UNKNOWN when a command word cannot be resolved.
  function lineTool(text) {
    let unknown = false;
    for (const [, word] of text.matchAll(COMMAND_WORDS)) {
      const base = word.slice(word.lastIndexOf('/') + 1);
      if (base.includes(UNKNOWN)) { unknown = true; continue; }
      if (TOOLS.has(programOf(base))) return programOf(base);
    }
    return unknown ? UNKNOWN : null;
  }
  const ownerOf = (p) => decls.find((o) => o.fn && o.init && (o.init[0] === p.fnStart || /^async\s*$/.test(code.slice(o.init[0], p.fnStart))));
  // The first parameter of the enclosing named function, when that function passes it on to a spawn: its calls
  // carry the value and are checked there.
  function deferred([a, z]) {
    const id = /^[A-Za-z_$][\w$]*$/.exec(code.slice(a, z));
    const d = id ? resolve(id[0], a) : null;
    if (!d || d.init || d.index !== 0) return false;
    const owner = ownerOf(d);
    return !!owner && owner.param === d.name && wrapperUse(owner) !== null;
  }
  const SHELL_COMMAND = /^-[a-z]*c$/;
  const NODE_CODE = /^(?:-e|--eval|-p|--print|-pe)$/;
  // The operand of a shell (`-c line`) or of node (`-e code`) in an argument array: { range } for the operand,
  // { unknown: true } when a spread hides the options, null when the array runs a script or nothing.
  function operandOf(arrayRange, prog) {
    if (!arrayRange) return null;
    const [a, z] = trim(...arrayRange);
    if (code[a] !== '[' || match[a] !== z - 1) return { unknown: true };
    const elements = splitTop(a + 1, z - 1);
    const flag = SHELLS.has(prog) ? SHELL_COMMAND : NODE_CODE;
    for (let i = 0; i < elements.length; i++) {
      if (code.startsWith('...', elements[i][0])) return { unknown: true };
      const text = staticText(...elements[i]);
      if (flag.test(text)) return elements[i + 1] ? { range: elements[i + 1] } : null;
      if (!text.startsWith('-')) return null; // a script path (static or computed): its arguments follow
    }
    return null;
  }
  // How a call's first argument is used: 'program' (spawn(program, …)), 'shell' (exec(line), shell: true) or null.
  // A wrapper inherits the use its first parameter has inside it ('shell' and 'code' for a -c line or -e code).
  const firstArgUse = (c, self = null) => {
    if (c.spawn === 'exec' || c.spawn === 'execSync') return 'shell';
    if (c.spawn === 'fork') return null;
    if (c.spawn) return /\bshell\s*:\s*(?!false\b)/.test(code.slice(c.open + 1, c.close)) ? 'shell' : 'program';
    const d = calleeOf(c);
    return d && d !== self ? wrapperUse(d) : null;
  };
  const wrapperUse = (d) => remember('use', declKey(d), () => {
    if (!d.fn || !d.param) return null;
    for (const c of callsIn(d.init)) {
      if (!spawns(c, d)) continue;
      const args = argsOf(c);
      if (!args.length) continue;
      if (code.slice(args[0][0], args[0][1]) === d.param) { const use = firstArgUse(c, d); if (use) return use; }
      if (firstArgUse(c, d) !== 'program') continue;
      const prog = programOf(staticText(...args[0]).trim().split(/\s+/)[0] ?? '');
      if (!SHELLS.has(prog) && prog !== 'node') continue;
      const operand = operandOf(args[1], prog);
      if (operand?.range && code.slice(...operand.range) === d.param) return SHELLS.has(prog) ? 'shell' : 'code';
    }
    return null;
  });
  const isolates = (d) => remember('isolates', declKey(d), () => {
    const inner = callsIn(d.init).filter((c) => spawns(c, d));
    return inner.length > 0 && inner.every((c) => {
      const env = envOf(c);
      if (env) return exprIsHelper(env[0], env[1]);
      const callee = calleeOf(c);
      return !!callee && callee !== d && isolates(callee);
    });
  });
  // The tool a wrapper runs whatever its arguments (null when only its callers decide).
  const wrapperTool = (d) => remember('tool', declKey(d), () => {
    for (const c of callsIn(d.init)) {
      const site = spawns(c, d) ? siteOf(c, d) : null;
      if (site && !site.unresolved) return site.what;
    }
    return null;
  });
  const unresolvedSite = (what) => ({ what, unresolved: true });
  // A shell line or node code: its tool, or a fail-safe site when part of it cannot be resolved.
  function operandSite(range, kind) {
    if (deferred(range)) return null;
    const text = staticText(...range);
    if (kind === 'shell') {
      const tool = lineTool(text);
      if (tool === UNKNOWN) return unresolvedSite('a command line the scan cannot resolve');
      return tool ? { what: tool } : null;
    }
    const m = CODE_TOOL.exec(text.split(UNKNOWN).join(' '));
    if (m) return { what: `${m[1]} (in node -e code)` };
    return text.includes(UNKNOWN) ? unresolvedSite('node -e code the scan cannot resolve') : null;
  }
  // What a spawn runs, if the guard must check its env: a tool (npm, npx, claude, codex, git) as a program, in a
  // shell line or in node -e code; an entry point; a local function that runs one; or (fail-safe) a program, line
  // or code the scan cannot resolve.
  function siteOf(c, self = null) {
    const args = argsOf(c);
    const use = args.length ? firstArgUse(c, self) : null;
    if (use === 'shell') {
      const site = operandSite(args[0], 'shell');
      if (site) return site;
    } else if (use === 'code') {
      const site = operandSite(args[0], 'code');
      if (site) return site;
    } else if (use === 'program' && !deferred(args[0])) {
      const word = staticText(...args[0]).trim().split(/\s+/)[0] ?? '';
      const base = word.slice(word.lastIndexOf('/') + 1);
      if (!base || base.includes(UNKNOWN)) return unresolvedSite('a program the scan cannot resolve');
      const prog = programOf(base);
      if (TOOLS.has(prog)) return { what: prog };
      if (SHELLS.has(prog) || prog === 'node') {
        const operand = operandOf(args[1], prog);
        if (operand?.unknown) return unresolvedSite(`${prog} with arguments the scan cannot resolve`);
        const site = operand ? operandSite(operand.range, SHELLS.has(prog) ? 'shell' : 'code') : null;
        if (site) return site;
      }
    }
    const text = rawText(c.open + 1, c.close);
    const hit = entryPoints.find((ep) => ep.marker.test(text));
    if (hit) return { what: hit.id };
    for (const r of refs(c.open + 1, c.close)) {
      const d = resolve(r.name, r.pos);
      const id = d ? declEntry(d) : null;
      if (id) return { what: id };
    }
    const callee = calleeOf(c);
    const inner = callee && callee !== self ? wrapperTool(callee) : null;
    return inner ? { what: inner } : null;
  }

  const violations = [];
  for (const c of calls) {
    if (!spawns(c)) continue;
    const site = siteOf(c);
    if (!site) continue;
    const env = envOf(c);
    const callee = calleeOf(c);
    let problem = null;
    if (env) {
      if (!exprIsHelper(env[0], env[1])) problem = 'its env is not built by tests/helpers/isolated-env.mjs';
    } else if (!isolated && !(callee && (isolates(callee) || wrapperTool(callee)))) {
      problem = 'it has no env, so it inherits the real HOME (use tests/helpers/isolated-env.mjs)';
    }
    if (problem) violations.push({ line: lineAt(c.at), message: `${c.name}() runs ${site.what}: ${problem}` });
  }
  if (!isolated) {
    for (const at of dynamicLoads) {
      violations.push({ line: lineAt(at), message: 'loads child_process dynamically, so the scan cannot see its spawns: call isolateProcessEnv() at module level' });
    }
  }
  violations.sort((x, y) => x.line - y.line);
  return violations;
}

const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
const relPath = (base, p) => relative(base, p).split(sep).join('/');
function scanTests(dir) {
  const found = [];
  for (const file of walk(dir).filter((f) => /\.(mjs|js|cjs)$/.test(f)).sort()) {
    for (const v of analyze(readFileSync(file, 'utf8'))) found.push(`${relPath(dir, file)}:${v.line}: ${v.message}`);
  }
  return found;
}

test('every spawn of npm, npx, claude, codex, git or a script that runs them takes its env from the helper', () => {
  assert.deepEqual(scanTests(join(root, 'tests')), []);
});

// Planted violations, one per way a test reaches the real HOME, next to the isolated forms of the same spawns.
const PLANTED = {
  'direct.test.mjs': [
    "import { spawnSync } from 'node:child_process';",
    "const r = spawnSync('npm', ['pack', '--dry-run'], { cwd: '/x', encoding: 'utf8' });",
  ],
  'wrapper.test.mjs': [
    "import { spawnSync } from 'node:child_process';",
    'const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: \'utf8\', ...opts });',
    "const env = { ...process.env, HOME: '/tmp/h' };",
    "run('claude', ['--version'], { env });",
  ],
  'git.test.mjs': [
    "import { execFileSync } from 'node:child_process';",
    "const out = execFileSync('git', ['-C', '/repo', 'commit', '-qm', 'x'], { encoding: 'utf8', env: process.env });",
  ],
  'template.test.mjs': [
    "import { execSync } from 'node:child_process';",
    "const v = '1.0.0';",
    'execSync(`npx --yes pkg@${v}`, { env: process.env });',
  ],
  'computed.test.mjs': [
    "import { spawnSync } from 'node:child_process';",
    "const tool = 'np' + 'm';",
    "spawnSync(tool, ['ci']);",
  ],
  'node-eval.test.mjs': [
    "import { spawnSync } from 'node:child_process';",
    'spawnSync(process.execPath, [\'-e\', "require(\'child_process\').execSync(\'npm ci\')"]);',
  ],
  'dynamic.test.mjs': [
    "const cp = await import('node:child_process');",
    "cp.execSync('npm ci');",
  ],
};
// File-sorted, with what each report must say.
const PLANTED_FOUND = [
  ['computed.test.mjs:3', /spawnSync\(\) runs a program the scan cannot resolve: it has no env/],
  ['direct.test.mjs:2', /spawnSync\(\) runs npm: it has no env/],
  ['dynamic.test.mjs:1', /loads child_process dynamically/],
  ['git.test.mjs:2', /execFileSync\(\) runs git: its env is not built by/],
  ['node-eval.test.mjs:2', /spawnSync\(\) runs npm \(in node -e code\): it has no env/],
  ['template.test.mjs:3', /execSync\(\) runs npx: its env is not built by/],
  ['wrapper.test.mjs:4', /run\(\) runs claude: its env is not built by/],
];
const ISOLATED = {
  'helper-env.test.mjs': [
    "import { spawnSync } from 'node:child_process';",
    "import { isolatedEnv } from './helpers/isolated-env.mjs';",
    'const iso = isolatedEnv();',
    'const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: \'utf8\', ...opts });',
    "run('npm', ['pack'], { env: iso.env });",
    "run('claude', ['--version'], { cwd: '/x', env: { ...iso.env, PATH: '/bin' } });",
    "spawnSync('git', ['status'], { env: iso.env });",
    "const tool = 'np' + 'm';",
    "spawnSync(tool, ['ci'], { env: iso.env });",
    'spawnSync(process.execPath, [\'-e\', "require(\'child_process\').execSync(\'npm ci\')"], { env: iso.env });',
  ],
  'helper-wrapper.test.mjs': [
    "import { spawnSync } from 'node:child_process';",
    "import { isolatedEnv } from './helpers/isolated-env.mjs';",
    'const ENV = isolatedEnv().env;',
    'const cli = (args, opts = {}) => spawnSync(process.execPath, [join(dir, \'bin\', names.bin), ...args], { env: ENV, ...opts });',
    "cli(['doctor']);",
    "function channel(t) { const iso = isolatedEnv(); t.after(iso.cleanup); return { env: iso.env }; }",
    "test('x', (t) => { const p = channel(t); spawnSync('npx', ['--yes', 'x'], { env: p.env }); });",
  ],
  'helper-process.test.mjs': [
    "import { execFileSync, execSync } from 'node:child_process';",
    "import { isolateProcessEnv } from './helpers/isolated-env.mjs';",
    'isolateProcessEnv();',
    "const tool = 'np' + 'm';",
    "execFileSync(tool, ['ci']);",
    'execSync(`cd ${dir} && npm pack`);',
    "const cp = await import('node:child_process');",
    "execFileSync('npm', ['ci'], { env: { ...process.env, CI: '1' } });",
    "const git = (d, ...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' });",
    "git('/repo', 'commit', '-qm', 'x');",
  ],
};

function plantedTree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'isolation-guard-'));
  for (const [name, lines] of Object.entries(files)) writeFileSync(join(dir, name), `${lines.join('\n')}\n`);
  return dir;
}

test('the scan flags planted violations: no env, env from process.env (claude, git), an entry-point script, a template, an unresolvable program, node -e, dynamic child_process', (t) => {
  const dir = plantedTree({ ...PLANTED, ...ISOLATED });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const found = scanTests(dir);
  assert.deepEqual(found.map((v) => v.split(': ')[0]), PLANTED_FOUND.map(([at]) => at), found.join('\n'));
  PLANTED_FOUND.forEach(([, re], i) => assert.match(found[i], re));
});

test('the scan follows wrappers, shells, exec strings, the launcher and module-level process isolation', () => {
  const flagged = (lines) => analyze(`${lines.join('\n')}\n`).map((v) => v.line);
  // A wrapper that runs the launcher without an env is flagged where it spawns, not at every call.
  assert.deepEqual(flagged([
    "const cli = (args, opts = {}) => spawnSync(process.execPath, [join(dir, 'bin', names.bin), ...args], { ...opts });",
    "cli(['--help']);",
  ]), [1]);
  // A caller that passes its own env to that wrapper is checked too.
  assert.deepEqual(flagged([
    "import { isolatedEnv } from './helpers/isolated-env.mjs';",
    "const cli = (args, opts = {}) => spawnSync(process.execPath, [LAUNCHER, ...args], { env: isolatedEnv().env, ...opts });",
    "const LAUNCHER = join(pluginDir, 'bin', names.bin);",
    "cli(['doctor'], { env: { ...process.env, PATH: '/bin' } });",
    "cli(['doctor']);",
  ]), [4]);
  // Shell command lines and exec strings.
  assert.deepEqual(flagged(["spawnSync('bash', ['-c', 'cd x && npm test']);", "execSync('npx --yes thing');", "spawnSync('bash', ['-n']);"]), [1, 2]);
  // An object env needs a spread of the helper env; a lone HOME from the helper keeps the rest of process.env.
  assert.deepEqual(flagged([
    "import { isolatedEnv } from './helpers/isolated-env.mjs';",
    'const iso = isolatedEnv();',
    "spawnSync('codex', ['exec'], { env: { ...process.env, HOME: iso.home } });",
  ]), [3]);
  // An env parameter is checked at every call of its function.
  const withParam = (...callers) => flagged([
    "import { isolatedEnv } from './helpers/isolated-env.mjs';",
    "function missing(t, env) { return spawnSync('claude', ['--version'], { env }).status !== 0; }",
    ...callers,
  ]);
  assert.deepEqual(withParam('missing(t, isolatedEnv().env);'), []);
  assert.deepEqual(withParam('missing(t, isolatedEnv().env);', 'missing(t, { ...process.env });'), [2]);
  assert.deepEqual(withParam(), [2], 'a function nobody calls proves nothing');
  // isolateProcessEnv() inside a test (not at module level) does not isolate the file.
  assert.deepEqual(flagged([
    "import { isolateProcessEnv } from './helpers/isolated-env.mjs';",
    "test('x', () => { isolateProcessEnv(); });",
    "spawnSync('npm', ['ci']);",
  ]), [3]);
  // Helper names count only in a file that loads the helper.
  assert.deepEqual(flagged(['const isolatedEnv = () => ({ env: process.env });', "spawnSync('npm', ['ci'], { env: isolatedEnv().env });"]), [2]);
  // git reads the global config of HOME: direct, in a shell line and in an exec string.
  assert.deepEqual(flagged(["spawnSync('git', ['init', '-q']);", "spawnSync('bash', ['-c', 'cd x && git stash']);", "execSync('git status');"]), [1, 2, 3]);
  // Template literals (review r1): the static parts of an exec string or a shell line are scanned.
  assert.deepEqual(flagged([
    "import { execSync, spawnSync } from 'node:child_process';",
    'execSync(`npx --yes pkg@${v}`);',
    'execSync(`npx --yes pkg@${v}`, { env: process.env });',
    'execSync(`cd ${d} && npm pack`);',
    'execSync(`git -C ${d} commit -m x`);',
    "execSync('npx --yes pkg', { env: process.env });",
    "spawnSync('sh', ['-c', `npx pkg@${v}`], { env: process.env });",
    "execSync('cd x && npm pack');",
    'execSync(`ls ${d}`);',
  ]), [2, 3, 4, 5, 6, 7, 8]);
  // Fail-safe: a program, shell line or node -e code the scan cannot resolve counts as a tool, unless the env is
  // built by the helper or the file is isolated. A wrapper's own program parameter is checked at its calls.
  const unresolved = [
    "const tool = 'np' + 'm';",
    "spawnSync(tool, ['ci']);",
    "const NPM = 'npm';",
    "spawnSync(NPM, ['ci']);",
    "spawnSync('ls', ['-la']);",
    "spawnSync('bash', ['-c', line]);",
    "spawnSync(process.execPath, ['-e', code]);",
    "spawnSync('node', ['-e', 'console.log(1)']);",
    'for (const [cmd, args] of list) spawnSync(cmd, args);',
    'const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { ...opts });',
    "run('ls', []);",
    'run(other, []);',
    'spawnSync(`${bin}/npm`, []);',
    'spawnSync(`${tool}`, []);',
  ];
  assert.deepEqual(flagged(unresolved), [2, 4, 6, 7, 9, 12, 13, 14]);
  assert.deepEqual(flagged(["import { isolateProcessEnv } from './helpers/isolated-env.mjs';", 'isolateProcessEnv();', ...unresolved]), []);
  assert.deepEqual(flagged([
    "import { isolatedEnv } from './helpers/isolated-env.mjs';",
    'const iso = isolatedEnv();',
    "spawnSync(tool, ['ci'], { env: iso.env });",
    "spawnSync('bash', ['-c', line], { env: iso.env });",
    'execSync(`npx --yes pkg@${v}`, { env: iso.env });',
  ]), []);
  // child_process loaded at run time hides its spawns: only a module-isolated file may do it.
  const dynamic = ["const { execSync } = await import('node:child_process');", "const cp = createRequire(import.meta.url)('child_process');", "const x = require('node:child_process');"];
  assert.deepEqual(flagged(dynamic), [1, 2, 3]);
  assert.deepEqual(flagged(["import { isolateProcessEnv } from './helpers/isolated-env.mjs';", 'isolateProcessEnv();', ...dynamic]), []);
  // Strings, comments and other programs are not spawns of a tool.
  assert.deepEqual(flagged(["// spawnSync('npm', ['ci'])", "const s = \"spawnSync('git', ['init'])\";", "writeFileSync(join(bin, 'npm'), 'x');", "spawnSync('tar', ['-xzf', 'x.tgz']);"]), []);
});

// Shell scripts: drop comments and quoted text, then look for a tool in command position.
const shellCode = (text) => text.split('\n').map((l) => (/^\s*#/.test(l) ? '' : l.replace(/\s#.*$/, '').replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, '""'))).join('\n');
function productSpawns() {
  const hits = [];
  const files = ['scripts', 'plugins', 'kit'].flatMap((d) => walk(join(root, d))).map((f) => relPath(root, f));
  for (const f of files) {
    const text = readFileSync(join(root, f), 'utf8');
    const shebang = text.split('\n', 1)[0];
    if (/\.(mjs|js|cjs)$/.test(f) || /^#!.*\bnode\b/.test(shebang)) {
      const { code, literals } = lex(text);
      for (const m of code.matchAll(/(?<![\w$])(?:spawn|spawnSync|execFile|execFileSync|exec|execSync|fork|run)\s*\(\s*§(\d+)§/g)) {
        const value = literals[m[1]];
        if (typeof value === 'string' && ENTRY_TOOLS.includes(programOf(value.trim().split(/\s+/)[0] ?? ''))) hits.push({ file: f, what: value });
      }
    } else if (/\.sh$/.test(f) || /^#!.*\b(ba|z|da)?sh\b/.test(shebang)) {
      const m = ENTRY_TOOL_CMD.exec(shellCode(text));
      if (m) hits.push({ file: f, what: m[1] });
      const lines = text.split('\n').filter((l) => !/^\s*#/.test(l));
      for (const ep of ENTRY_POINTS) if (ep.id !== f && lines.some((l) => ep.marker.test(l))) hits.push({ file: f, what: ep.id });
    }
  }
  return hits;
}

test('entry points: every repository script that runs npm, npx, claude or codex is listed, so tests that run it are checked', () => {
  const hits = productSpawns();
  assert.ok(hits.some((h) => h.file.startsWith(`${pluginRel}/lib/`) && h.what === 'claude'), 'the scan sees the claude spawn of the plugin');
  const uncovered = hits.filter((h) => !ENTRY_POINTS.some((ep) => ep.covers(h.file))).map((h) => `${h.file}: ${h.what}`);
  assert.deepEqual(uncovered, [], 'add an ENTRY_POINTS row (with the marker tests use to name the script)');
  // Each marker names its own script.
  for (const ep of ENTRY_POINTS) assert.match(`join(root, '${ep.id}')`, ep.marker, ep.id);
  assert.match('join(pluginDir, \'bin\', names.bin)', ENTRY_POINTS.find((ep) => ep.id.endsWith(`/bin/${names.bin}`)).marker);
});

// ---------- helper contract ----------
const PROBE = { CLAUDECODE: '1', CLAUDE_CONFIG_DIR: '/real/.claude', ANTHROPIC_API_KEY: 'k', CODEX_HOME: '/real/.codex', OPENAI_API_KEY: 'k',
  XDG_CONFIG_HOME: '/real/.config', GIT_DIR: '/real/.git', GIT_AUTHOR_NAME: 'Real Person', npm_config_cache: '/real/.npm', NPM_CONFIG_PREFIX: '/real/prefix',
  npm_lifecycle_event: 'test', NODE_OPTIONS: '--no-warnings', NODE_PATH: '/real/node_modules', SSH_AUTH_SOCK: '/real/agent.sock',
  GH_TOKEN: 'k', GITHUB_TOKEN: 'k', HOMEBREW_PREFIX: '/real/brew', HOMEBREW_NO_AUTO_UPDATE: '1', ISOLATION_PROBE_KEEP: 'kept' };
// Runs f with PROBE variables in process.env, then restores process.env exactly.
async function withProbe(f) {
  const saved = { ...process.env };
  Object.assign(process.env, PROBE);
  try { return await f(); } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}
const inside = (dir, p) => !relative(dir, p).startsWith('..') && !relative(dir, p).startsWith(sep);
const STRIPPED = /^(CLAUDE|ANTHROPIC|CODEX|OPENAI)/i;

test('isolatedEnv: throwaway HOME and per-user locations, session variables stripped, PATH kept', async () => {
  const { isolatedEnv } = await loadHelper();
  await withProbe(() => {
    const iso = isolatedEnv();
    try {
      const { env, base, home } = iso;
      assert.ok(inside(realpathSync(tmpdir()), base), `base ${base} lies in the temp directory`);
      assert.ok(inside(base, home) && statSync(home).isDirectory());
      assert.notEqual(env.HOME, process.env.HOME);
      assert.equal(env.HOME, home);
      assert.equal(env.USERPROFILE, home);
      for (const k of ['CLAUDE_CONFIG_DIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME']) assert.ok(inside(home, env[k]), `${k}=${env[k]} under HOME`);
      for (const k of ['npm_config_cache', 'npm_config_logs_dir', 'npm_config_userconfig', 'npm_config_globalconfig']) assert.ok(inside(base, env[k]), `${k}=${env[k]} in the throwaway directory`);
      assert.ok(inside(home, env.GIT_CONFIG_GLOBAL));
      assert.equal(readFileSync(env.GIT_CONFIG_GLOBAL, 'utf8'), '', 'global git config is an empty file');
      assert.equal(env.GIT_CONFIG_NOSYSTEM, '1');
      for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) assert.ok(env[k] && !/Real Person/.test(env[k]), `${k} set by the helper`);
      assert.equal(env.PATH, process.env.PATH);
      assert.equal(env.ISOLATION_PROBE_KEEP, 'kept');
      assert.equal(env.TMPDIR, process.env.TMPDIR, 'TMPDIR is kept');
      // Inherited session and per-user variables are gone or replaced.
      const leaked = Object.keys(env).filter((k) => (STRIPPED.test(k) && k !== 'CLAUDE_CONFIG_DIR') || /^npm_/i.test(k) && !/^npm_config_(cache|logs_dir|userconfig|globalconfig|update_notifier|fund|audit)$/.test(k));
      assert.deepEqual(leaked, []);
      for (const [k, v] of Object.entries(PROBE)) if (k !== 'ISOLATION_PROBE_KEEP') assert.notEqual(env[k], v, `${k} not inherited`);
      assert.equal(Object.keys(env).filter((k) => /^npm_config_prefix$/i.test(k)).length, 0);
    } finally { iso.cleanup(); }
  });
});

test('isolatedEnv: options for git identity and global git config; cleanup removes everything and is idempotent', async () => {
  const { isolatedEnv } = await loadHelper();
  const iso = isolatedEnv({ identity: false, gitConfig: '[init]\n\tdefaultBranch = main\n' });
  assert.equal(readFileSync(iso.env.GIT_CONFIG_GLOBAL, 'utf8'), '[init]\n\tdefaultBranch = main\n');
  for (const k of ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL']) assert.equal(iso.env[k], undefined, k);
  const other = isolatedEnv();
  assert.notEqual(other.base, iso.base, 'each call gets its own directory');
  iso.cleanup();
  iso.cleanup();
  assert.ok(!existsSync(iso.base), 'cleanup removed the throwaway directory');
  assert.ok(existsSync(other.base), 'cleanup touches only its own directory');
  other.cleanup();
});

test('isolatedEnv: git, node and npm in the child see the throwaway HOME, never the real one', async (t) => {
  const { isolatedEnv } = await loadHelper();
  const iso = isolatedEnv();
  t.after(iso.cleanup);
  const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', env: iso.env, cwd: iso.base });
  assert.equal(run(process.execPath, ['-e', 'process.stdout.write(require("os").homedir())']).stdout, iso.home);
  assert.equal(run('git', ['config', '--global', 'isolation.probe', 'yes']).status, 0);
  assert.match(readFileSync(iso.env.GIT_CONFIG_GLOBAL, 'utf8'), /probe = yes/, 'git --global writes the throwaway config');
  assert.equal(run('git', ['config', '--show-origin', '--get', 'isolation.probe']).stdout.trim(), `file:${iso.env.GIT_CONFIG_GLOBAL}\tyes`);
  const npm = spawnSync('npm', ['config', 'get', 'cache'], { encoding: 'utf8', env: iso.env, cwd: iso.base });
  if (npm.error && process.env[`${names.envPrefix}REQUIRE_TOOLS`]) assert.fail(`npm not on PATH (${names.envPrefix}REQUIRE_TOOLS)`);
  if (npm.error) return t.skip('npm not on PATH');
  assert.equal(npm.status, 0, npm.stderr);
  assert.equal(npm.stdout.trim(), iso.env.npm_config_cache);
});

test('isolateProcessEnv: process.env becomes the isolated env until cleanup restores it', async () => {
  const { isolateProcessEnv } = await loadHelper();
  await withProbe(() => {
    const before = { ...process.env };
    const iso = isolateProcessEnv({ identity: false });
    try {
      assert.equal(process.env.HOME, iso.home);
      assert.equal(iso.env, process.env);
      for (const k of Object.keys(PROBE)) if (k !== 'ISOLATION_PROBE_KEEP') assert.notEqual(process.env[k], PROBE[k], k);
      assert.equal(process.env.ISOLATION_PROBE_KEEP, 'kept');
      const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify([require("os").homedir(), process.env.CLAUDECODE ?? null]))'], { encoding: 'utf8' });
      assert.deepEqual(JSON.parse(child.stdout), [iso.home, null], 'a child started without env inherits the isolated one');
    } finally { iso.cleanup(); }
    assert.deepEqual({ ...process.env }, before, 'cleanup restored process.env');
    assert.ok(!existsSync(iso.base));
  });
});
