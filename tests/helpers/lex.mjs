// Lexer-light for static scans of JavaScript sources (architecture.test.mjs, isolation-guard.test.mjs): comments
// become spaces; every string, template and regex literal becomes a placeholder §n§ whose text is literals[n] (null
// for regex literals). Template expressions stay code, so calls inside them are scanned. Literal text is data: '/*'
// inside a string never starts a comment. Newlines are kept, so a position in the lexed code still gives the source line.
// parts[n] lists the static text of template n between its ${…} expressions (undefined for other literals).
export function lex(src) {
  const literals = [];
  const parts = [];
  let i = 0;
  const slot = (value, raw) => { literals.push(value); return `§${literals.length - 1}§${'\n'.repeat((raw.match(/\n/g) ?? []).length)}`; };
  const regexAllowed = (out) => {
    const last = out.trimEnd();
    if (last === '') return true;
    if ('(,=:[!&|?{};+-*%<>~^'.includes(last[last.length - 1])) return true;
    return /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/.test(last);
  };
  function quoted(q) {
    const start = i++;
    let value = '';
    while (i < src.length && src[i] !== q && src[i] !== '\n') {
      if (src[i] === '\\') { value += src[i + 1] ?? ''; i += 2; } else value += src[i++];
    }
    i++;
    return slot(value, src.slice(start, i));
  }
  function template() {
    i++;
    let value = '';
    let raw = '';
    let inner = '';
    const chunks = [''];
    while (i < src.length && src[i] !== '`') {
      if (src[i] === '\\') { value += src[i + 1] ?? ''; chunks[chunks.length - 1] += src[i + 1] ?? ''; raw += src.slice(i, i + 2); i += 2; } else if (src[i] === '$' && src[i + 1] === '{') { i += 2; inner += ` ${code(true)} `; chunks.push(''); } else { value += src[i]; chunks[chunks.length - 1] += src[i]; raw += src[i]; i++; }
    }
    i++;
    const placeholder = slot(value, raw);
    parts[literals.length - 1] = chunks;
    return placeholder + inner;
  }
  function regex() {
    const start = i++;
    let inClass = false;
    while (i < src.length && src[i] !== '\n') {
      if (src[i] === '\\') { i += 2; continue; }
      if (src[i] === '[') inClass = true;
      else if (src[i] === ']') inClass = false;
      else if (src[i] === '/' && !inClass) break;
      i++;
    }
    i++;
    while (i < src.length && /[a-z]/i.test(src[i])) i++;
    return slot(null, src.slice(start, i));
  }
  function code(untilBrace) {
    let out = '';
    let depth = 0;
    while (i < src.length) {
      const c = src[i];
      const d = src[i + 1];
      if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && d === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? src.length : e + 2; out += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue; }
      if (c === '\'' || c === '"') { out += quoted(c); continue; }
      if (c === '`') { out += template(); continue; }
      if (c === '/' && regexAllowed(out)) { out += regex(); continue; }
      if (untilBrace && c === '{') depth++;
      if (untilBrace && c === '}' && depth-- === 0) { i++; return out; }
      out += c;
      i++;
    }
    return out;
  }
  return { code: code(false), literals, parts };
}
