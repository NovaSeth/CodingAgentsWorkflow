// JavaScript source helpers for the evaluator (no parser dependency): a tokenizer good enough for test files,
// formatting-insensitive comparison (comments, whitespace, quote style, trailing commas and semicolons do not
// count), top-level test-call extraction, and the import rewrite that ports a trusted visible test file onto the
// candidate client. Used on files the agent may have edited, so it never executes them.
import { posix } from 'node:path';

const PUNCTUATORS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=',
  '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>'];
const REGEX_AFTER_WORDS = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
const ESCAPES = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };

export class SourceError extends Error {}

function readString(src, i, quote) {
  let value = '';
  let j = i + 1;
  while (j < src.length && src[j] !== quote) {
    if (src[j] === '\\') {
      const c = src[j + 1];
      if (c === 'x') { value += String.fromCharCode(parseInt(src.slice(j + 2, j + 4), 16)); j += 4; continue; }
      if (c === 'u' && src[j + 2] === '{') { const end = src.indexOf('}', j); value += String.fromCodePoint(parseInt(src.slice(j + 3, end), 16)); j = end + 1; continue; }
      if (c === 'u') { value += String.fromCharCode(parseInt(src.slice(j + 2, j + 6), 16)); j += 6; continue; }
      if (c === '\n') { j += 2; continue; }
      value += ESCAPES[c] ?? c;
      j += 2;
      continue;
    }
    if (src[j] === '\n') throw new SourceError(`unterminated string at ${i}`);
    value += src[j++];
  }
  if (j >= src.length) throw new SourceError(`unterminated string at ${i}`);
  return { value, end: j + 1 };
}

function readTemplate(src, i) {
  let j = i + 1;
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '$' && src[j + 1] === '{') {
      let depth = 1;
      j += 2;
      while (j < src.length && depth > 0) {
        const c = src[j];
        if (c === '{') depth++;
        else if (c === '}') depth--;
        else if (c === '"' || c === "'") { j = readString(src, j, c).end; continue; }
        else if (c === '`') { j = readTemplate(src, j); continue; }
        j++;
      }
      continue;
    }
    j++;
  }
  if (j >= src.length) throw new SourceError(`unterminated template at ${i}`);
  return j + 1;
}

function readRegex(src, i) {
  let j = i + 1;
  let inClass = false;
  while (j < src.length) {
    const c = src[j];
    if (c === '\\') { j += 2; continue; }
    if (c === '\n') throw new SourceError(`unterminated regex at ${i}`);
    if (inClass) { if (c === ']') inClass = false; }
    else if (c === '[') inClass = true;
    else if (c === '/') break;
    j++;
  }
  j++;
  while (j < src.length && /[a-z]/i.test(src[j])) j++;
  return j;
}

// Tokens: { t: 'id' | 'num' | 'str' | 'tpl' | 're' | 'p', v, start, end }. Comments and whitespace are dropped.
export function tokenize(src) {
  const tokens = [];
  let i = 0;
  const regexAllowed = () => {
    const prev = tokens[tokens.length - 1];
    if (!prev) return true;
    if (prev.t === 'id') return REGEX_AFTER_WORDS.has(prev.v);
    if (prev.t === 'p') return ![')', ']', '}', '++', '--'].includes(prev.v);
    return false;
  };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
    if (c === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); if (end === -1) throw new SourceError('unterminated comment'); i = end + 2; continue; }
    if (c === '#' && i === 0 && src[1] === '!') { const nl = src.indexOf('\n'); i = nl === -1 ? src.length : nl; continue; }
    if (c === '"' || c === "'") { const { value, end } = readString(src, i, c); tokens.push({ t: 'str', v: value, start: i, end }); i = end; continue; }
    if (c === '`') { const end = readTemplate(src, i); tokens.push({ t: 'tpl', v: src.slice(i, end), start: i, end }); i = end; continue; }
    if (c === '/' && regexAllowed()) { const end = readRegex(src, i); tokens.push({ t: 're', v: src.slice(i, end), start: i, end }); i = end; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:0[xXoObB][0-9a-fA-F_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?)/.exec(src.slice(i));
      tokens.push({ t: 'num', v: m[0].replace(/_/g, ''), start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$\u0080-\uffff]/.test(c)) {
      const m = /^[A-Za-z0-9_$\u0080-\uffff]+/.exec(src.slice(i));
      tokens.push({ t: 'id', v: m[0], start: i, end: i + m[0].length });
      i += m[0].length;
      continue;
    }
    const p = PUNCTUATORS.find((op) => src.startsWith(op, i)) ?? c;
    tokens.push({ t: 'p', v: p, start: i, end: i + p.length });
    i += p.length;
  }
  return tokens;
}

// The code inside a template literal's ${...} parts, tokenized and spliced in after the template token
// (recursively), for analyses that must see calls and names written inside templates.
export function expandTemplates(tokens) {
  const out = [];
  for (const tok of tokens) {
    out.push(tok);
    if (tok.t !== 'tpl') continue;
    const raw = tok.v;
    for (let i = 1; i < raw.length - 1; i++) {
      if (raw[i] === '\\') { i++; continue; }
      if (raw[i] !== '$' || raw[i + 1] !== '{') continue;
      let depth = 1;
      let j = i + 2;
      while (j < raw.length && depth > 0) {
        if (raw[j] === '{') depth++;
        else if (raw[j] === '}') depth--;
        else if (raw[j] === '"' || raw[j] === "'") { j = readString(raw, j, raw[j]).end; continue; }
        else if (raw[j] === '`') { j = readTemplate(raw, j); continue; }
        j++;
      }
      out.push(...expandTemplates(tokenize(raw.slice(i + 2, j - 1))));
      i = j - 1;
    }
  }
  return out;
}

// Formatting-insensitive form: no semicolons, no trailing commas before a closing bracket.
export function normalized(src) {
  const tokens = tokenize(src).filter((tok) => !(tok.t === 'p' && tok.v === ';'));
  return tokens
    .filter((tok, k) => !(tok.t === 'p' && tok.v === ',' && [')', ']', '}'].includes(tokens[k + 1]?.v)))
    .map((tok) => `${tok.t}:${tok.v}`);
}

export const sameCode = (a, b) => {
  const x = normalized(a);
  const y = normalized(b);
  return x.length === y.length && x.every((tok, k) => tok === y[k]);
};

const OPEN = { '(': ')', '[': ']', '{': '}' };

function matching(tokens, k) {
  const close = OPEN[tokens[k].v];
  let depth = 0;
  for (let j = k; j < tokens.length; j++) {
    if (tokens[j].t !== 'p') continue;
    if (OPEN[tokens[j].v]) depth++;
    else if ([')', ']', '}'].includes(tokens[j].v)) {
      depth--;
      if (depth === 0) {
        if (tokens[j].v !== close) throw new SourceError('mismatched brackets');
        return j;
      }
    }
  }
  throw new SourceError('unbalanced brackets');
}

// Top-level calls of test/it (and test.skip, it.todo, ...): { callee, name, options, tokens }.
export function testCalls(src) {
  const tokens = tokenize(src);
  const calls = [];
  let depth = 0;
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'p' && OPEN[tok.v]) { depth++; continue; }
    if (tok.t === 'p' && [')', ']', '}'].includes(tok.v)) { depth--; continue; }
    if (depth !== 0 || tok.t !== 'id' || !['test', 'it'].includes(tok.v)) continue;
    if (tokens[k - 1]?.v === '.') continue;
    let j = k + 1;
    let callee = tok.v;
    while (tokens[j]?.v === '.' && tokens[j + 1]?.t === 'id') { callee += `.${tokens[j + 1].v}`; j += 2; }
    if (tokens[j]?.v !== '(') continue;
    const end = matching(tokens, j);
    const args = tokens.slice(j + 1, end);
    const nameTok = args[0];
    const name = nameTok && (nameTok.t === 'str' || nameTok.t === 'tpl') ? nameTok.v : null;
    let options = false;
    if (args[1]?.v === ',' && args[2]?.v === '{') {
      const close = matching(args, 2);
      options = args.slice(3, close).some((a, n, list) => a.t === 'id' && ['skip', 'todo', 'only'].includes(a.v) && list[n + 1]?.v === ':');
    }
    calls.push({ callee, name, disabled: callee !== tok.v || options, tokens: tokens.slice(k, end + 1) });
    k = end;
  }
  return calls;
}

export const callKey = (call) => call.tokens.filter((tok) => !(tok.t === 'p' && tok.v === ';')).map((tok) => `${tok.t}:${tok.v}`).join(' ');

// Module specifiers a file imports or requires (static imports, dynamic import(), require()).
export function importedSpecifiers(src) {
  const tokens = tokenize(src);
  const found = [];
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'id' && tok.v === 'from' && tokens[k + 1]?.t === 'str') found.push(tokens[k + 1].v);
    if (tok.t === 'id' && tok.v === 'import' && tokens[k + 1]?.t === 'str') found.push(tokens[k + 1].v);
    if (tok.t === 'id' && (tok.v === 'import' || tok.v === 'require') && tokens[k + 1]?.v === '(' && tokens[k + 2]?.t === 'str') found.push(tokens[k + 2].v);
  }
  return found;
}

// Ports a trusted test file (a visible test from the case fixture) onto the candidate client: every relative
// import becomes a call to the client; anything else that reaches into the workspace makes the port fail.
export function portTest(src, { fileRel, clientUrl }) {
  const tokens = tokenize(src);
  const edits = [];
  let depth = 0;
  let temp = 0;
  const toModule = (spec) => {
    const rel = posix.normalize(posix.join(posix.dirname(fileRel), spec));
    if (rel.startsWith('..') || posix.isAbsolute(rel)) throw new SourceError(`import ${spec} leaves the workspace`);
    return rel;
  };
  for (let k = 0; k < tokens.length; k++) {
    const tok = tokens[k];
    if (tok.t === 'p' && OPEN[tok.v]) { depth++; continue; }
    if (tok.t === 'p' && [')', ']', '}'].includes(tok.v)) { depth--; continue; }
    if (depth !== 0 || tok.t !== 'id' || tok.v !== 'import') continue;
    if (tokens[k + 1]?.v === '(' || tokens[k + 1]?.v === '.') continue;
    let j = k + 1;
    if (tokens[j]?.t === 'str') {
      const spec = tokens[j].v;
      if (!/^\.\.?\//.test(spec)) continue;
      const end = tokens[j + 1]?.v === ';' ? tokens[j + 1].end : tokens[j].end;
      edits.push([tok.start, end, `__c.module(${JSON.stringify(toModule(spec))});`]);
      continue;
    }
    while (j < tokens.length && !(tokens[j].t === 'id' && tokens[j].v === 'from' && tokens[j + 1]?.t === 'str')) j++;
    if (j >= tokens.length) throw new SourceError('unparsed import');
    const spec = tokens[j + 1].v;
    const stmtEnd = tokens[j + 2]?.v === ';' ? tokens[j + 2].end : tokens[j + 1].end;
    if (!/^\.\.?\//.test(spec)) { k = j + 1; continue; }
    const clause = tokens.slice(k + 1, j);
    const mod = `__c.module(${JSON.stringify(toModule(spec))})`;
    const lines = [];
    let rest = clause;
    let target = mod;
    if (rest[0]?.t === 'id' && rest[0].v !== '*') {
      const name = `__m${++temp}`;
      lines.push(`const ${name} = ${mod};`, `const ${rest[0].v} = ${name}.default;`);
      target = name;
      rest = rest[1]?.v === ',' ? rest.slice(2) : rest.slice(1);
    }
    if (rest[0]?.v === '*') {
      if (rest[1]?.v !== 'as' || rest[2]?.t !== 'id') throw new SourceError('unparsed namespace import');
      lines.push(`const ${rest[2].v} = ${target};`);
    } else if (rest[0]?.v === '{') {
      const names = [];
      for (let n = 1; n < rest.length - 1; n++) {
        if (rest[n].v === ',') continue;
        if (rest[n + 1]?.v === 'as') { names.push(`${rest[n].v}: ${rest[n + 2].v}`); n += 2; }
        else names.push(rest[n].v);
      }
      lines.push(`const { ${names.join(', ')} } = ${target};`);
    } else if (rest.length > 0) {
      throw new SourceError('unparsed import clause');
    }
    edits.push([tok.start, stmtEnd, lines.join(' ')]);
    k = j + 1;
  }
  let out = src;
  for (const [start, end, text] of edits.reverse()) out = out.slice(0, start) + text + out.slice(end);
  const leftover = tokenize(out).filter((tok) => tok.t === 'str' && /^\.\.?\//.test(tok.v));
  if (leftover.length > 0) throw new SourceError(`relative reference ${leftover[0].v} cannot be ported`);
  if (/\bimport\.meta\b/.test(out)) throw new SourceError('import.meta cannot be ported');
  return `import { candidate as __candidate } from ${JSON.stringify(clientUrl)};\nconst __c = __candidate();\n${out}`;
}
