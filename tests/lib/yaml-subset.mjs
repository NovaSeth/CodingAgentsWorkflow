// Strict YAML subset parser for generated configuration (spec §7.14 step 5, REV-56); zero dependencies.
// Accepted: block mappings and block sequences (space indentation, siblings aligned), `- key: value` sequence
// items, plain scalars, single- and double-quoted scalars, flow sequences of scalars, literal block scalars (`|`
// and `|-`), full-line comments and comments after a value (` #`).
// Rejected with YamlError (line number in the message): tabs, carriage returns, anchors, aliases, tags, flow
// mappings, folded scalars, document markers, directives, duplicate keys, misaligned indentation, unterminated
// quotes, unknown escapes, plain scalars that YAML 1.1 reads as booleans (yes, no, on, off, y, n; the mapping key
// `on` of GitHub Actions excepted), a plain scalar holding ": " or ending in ":".
// Typing follows the YAML 1.2 core schema for plain values: true, false, null, ~, integers; all else is a string.
// Keys are strings.

export class YamlError extends Error {}

const AMBIGUOUS = /^(y|Y|yes|Yes|YES|n|N|no|No|NO|on|On|ON|off|Off|OFF)$/;
const FORBIDDEN_START = /^[&*!%@`{>]/;

export function parseYaml(text) {
  if (text.includes('\t')) throw new YamlError(`line ${lineOf(text, text.indexOf('\t'))}: tab character`);
  if (text.includes('\r')) throw new YamlError(`line ${lineOf(text, text.indexOf('\r'))}: carriage return`);
  const lines = text.split('\n').map((raw, i) => ({ no: i + 1, raw, indent: raw.length - raw.trimStart().length, body: raw.trim() }));
  const p = { lines, i: 0 };
  skip(p);
  if (p.i >= lines.length) return null;
  const first = lines[p.i];
  if (first.indent !== 0) throw err(first, 'the document must start at column 0');
  const value = parseBlock(p, 0);
  skip(p);
  if (p.i < lines.length) throw err(lines[p.i], 'unexpected content (bad indentation)');
  return value;
}

const lineOf = (text, at) => text.slice(0, at).split('\n').length;
const err = (line, why) => new YamlError(`line ${line.no}: ${why}: ${line.raw}`);
const isBlank = (l) => l.body === '' || l.body.startsWith('#');

function skip(p) {
  while (p.i < p.lines.length && isBlank(p.lines[p.i])) {
    const b = p.lines[p.i].body;
    if (b === '---' || b === '...' || b.startsWith('%')) throw err(p.lines[p.i], 'document markers and directives are not supported');
    p.i++;
  }
  if (p.i < p.lines.length) {
    const b = p.lines[p.i].body;
    if (b === '---' || b === '...' || b.startsWith('%')) throw err(p.lines[p.i], 'document markers and directives are not supported');
  }
}

const isSeqItem = (body) => body === '-' || body.startsWith('- ');

function parseBlock(p, indent) {
  const line = p.lines[p.i];
  return isSeqItem(line.body) ? parseSeq(p, indent) : parseMap(p, indent);
}

// The key of a mapping entry and the rest of the line after "key:"; null when the line is no mapping entry.
function splitKey(body) {
  let key;
  let rest;
  if (body.startsWith('"') || body.startsWith("'")) {
    const { value, end } = quoted(body, 0);
    if (body[end] !== ':' || (end + 1 < body.length && body[end + 1] !== ' ')) return null;
    key = value;
    rest = body.slice(end + 1);
  } else {
    const m = /^([^\s:#][^:]*?):(?: |$)/.exec(body) ?? /^([^\s:#][^:]*?):$/.exec(body);
    if (!m) return null;
    key = m[1];
    if (FORBIDDEN_START.test(key) || key.startsWith('[') || key.startsWith('- ')) return null;
    if (AMBIGUOUS.test(key) && key !== 'on') throw new YamlError(`ambiguous key ${key}: quote it`);
    rest = body.slice(m[1].length + 1);
  }
  return { key, rest: rest.trim() };
}

function parseMap(p, indent) {
  const out = {};
  while (p.i < p.lines.length) {
    skip(p);
    if (p.i >= p.lines.length) break;
    const line = p.lines[p.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw err(line, 'misaligned mapping entry');
    if (isSeqItem(line.body)) break;
    let entry;
    try { entry = splitKey(line.body); } catch (e) { throw err(line, e.message); }
    if (!entry) throw err(line, 'expected "key: value"');
    if (Object.hasOwn(out, entry.key)) throw err(line, `duplicate key ${entry.key}`);
    p.i++;
    out[entry.key] = parseValue(p, line, indent, entry.rest);
  }
  return out;
}

function parseSeq(p, indent) {
  const out = [];
  while (p.i < p.lines.length) {
    skip(p);
    if (p.i >= p.lines.length) break;
    const line = p.lines[p.i];
    if (line.indent < indent) break;
    if (line.indent > indent) throw err(line, 'misaligned sequence item');
    if (!isSeqItem(line.body)) break;
    const rest = line.body === '-' ? '' : line.body.slice(2);
    const lead = line.raw.length - line.raw.trimStart().length + 2 + (rest.length - rest.trimStart().length);
    const item = rest.trim();
    if (item !== '' && !item.startsWith('"') && !item.startsWith("'") && !item.startsWith('[') && splitKeySafe(item)) {
      // "- key: value": a mapping whose entries sit at the column of "key".
      p.lines[p.i] = { ...line, indent: lead, body: item };
      out.push(parseMap(p, lead));
      continue;
    }
    p.i++;
    out.push(parseValue(p, line, indent, item));
  }
  return out;
}

function splitKeySafe(body) {
  try { return splitKey(body); } catch { return null; }
}

// The value after "key:" or "- ": inline scalar, flow sequence, block scalar, or a nested block (empty rest).
function parseValue(p, line, indent, rest) {
  if (rest === '' || rest.startsWith('#')) {
    skip(p);
    if (p.i < p.lines.length && p.lines[p.i].indent > indent) return parseBlock(p, p.lines[p.i].indent);
    // A sequence may sit at the same indentation as its parent key.
    if (p.i < p.lines.length && p.lines[p.i].indent === indent && isSeqItem(p.lines[p.i].body) && !isSeqItem(line.body)) return parseSeq(p, indent);
    return null;
  }
  if (rest === '|' || rest === '|-') return blockScalar(p, indent, rest === '|-');
  if (rest.startsWith('|') || rest.startsWith('>')) throw err(line, 'only literal block scalars | and |- are supported');
  try {
    return inline(rest);
  } catch (e) {
    throw err(line, e.message);
  }
}

function blockScalar(p, indent, strip) {
  const body = [];
  let blockIndent = null;
  while (p.i < p.lines.length) {
    const l = p.lines[p.i];
    if (l.body === '') { body.push(''); p.i++; continue; }
    if (l.indent <= indent) break;
    if (blockIndent === null) blockIndent = l.indent;
    if (l.indent < blockIndent) throw err(l, 'block scalar line less indented than its first line');
    body.push(l.raw.slice(blockIndent));
    p.i++;
  }
  while (body.length && body[body.length - 1] === '') body.pop();
  const text = body.join('\n');
  return strip ? text : `${text}\n`;
}

function inline(s) {
  if (s.startsWith('[')) return flowSeq(s);
  if (s.startsWith('"') || s.startsWith("'")) {
    const { value, end } = quoted(s, 0);
    const tail = s.slice(end).trim();
    if (tail !== '' && !tail.startsWith('#')) throw new YamlError(`text after a quoted scalar: ${tail}`);
    return value;
  }
  return plain(stripComment(s));
}

function stripComment(s) {
  const at = s.search(/ #/);
  return (at < 0 ? s : s.slice(0, at)).trim();
}

function plain(s) {
  if (s === '') return null;
  if (FORBIDDEN_START.test(s) || s.startsWith('|') || s.startsWith(']') || s.startsWith(',')) throw new YamlError(`plain scalar starts with an indicator: ${s}`);
  if (s.includes(': ') || s.endsWith(':')) throw new YamlError(`plain scalar holds ": " or ends with ":": ${s}`);
  if (AMBIGUOUS.test(s)) throw new YamlError(`ambiguous plain scalar ${s} (YAML 1.1 boolean): quote it`);
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?(0|[1-9]\d*)$/.test(s)) return Number(s);
  return s;
}

function flowSeq(s) {
  const out = [];
  let i = 1;
  const ws = () => { while (s[i] === ' ') i++; };
  ws();
  if (s[i] === ']') return finishFlow(s, i + 1, out);
  for (;;) {
    ws();
    if (s[i] === '"' || s[i] === "'") {
      const { value, end } = quoted(s, i);
      out.push(value);
      i = end;
    } else {
      const m = /^[^,\][{}#]+/.exec(s.slice(i));
      if (!m) throw new YamlError(`bad flow sequence item: ${s}`);
      out.push(plain(m[0].trim()));
      i += m[0].length;
    }
    ws();
    if (s[i] === ',') { i++; continue; }
    if (s[i] === ']') return finishFlow(s, i + 1, out);
    throw new YamlError(`unterminated flow sequence: ${s}`);
  }
}

function finishFlow(s, end, out) {
  const tail = s.slice(end).trim();
  if (tail !== '' && !tail.startsWith('#')) throw new YamlError(`text after a flow sequence: ${tail}`);
  return out;
}

const ESCAPES = { '\\': '\\', '"': '"', n: '\n', t: '\t', '/': '/' };

function quoted(s, start) {
  const q = s[start];
  let out = '';
  let i = start + 1;
  while (i < s.length) {
    const c = s[i];
    if (q === "'" && c === "'") {
      if (s[i + 1] === "'") { out += "'"; i += 2; continue; }
      return { value: out, end: i + 1 };
    }
    if (q === '"' && c === '"') return { value: out, end: i + 1 };
    if (q === '"' && c === '\\') {
      const e = s[i + 1];
      if (!Object.hasOwn(ESCAPES, e)) throw new YamlError(`unknown escape \\${e}`);
      out += ESCAPES[e];
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  throw new YamlError(`unterminated quoted scalar: ${s.slice(start)}`);
}
