#!/usr/bin/env node
// Hook PreToolUse (Bash): blokuje polecenia łamiące reguły procesu — egzekwowanie zamiast przypominania (ZAS-17).
// Działa także w subagentach i w trybie bypassPermissions. Blokada = kod 2 + powód na stderr (widzi go model).
// Polecenie jest rozbierane własnym tokenizerem powłoki (cytowanie, operatory, heredoc, podstawienia $(…)/`…`);
// reguły wbudowane sprawdzają słowa poleceń, nie surowy tekst — treść danych (wiadomość commita, heredoc) nie wyzwala blokady.
// Treść wykonywana przez powłokę (bash|sh|zsh|dash|ksh -c, eval, heredoc/here-string do powłoki, $(…), `…`) jest analizowana rekurencyjnie.
// Reguły własne projektu: .workflow/guard-extra.txt — linia: <regex ERE><TAB><komunikat> (plik należy do projektu); dopasowanie do surowego polecenia.
// Błąd parsowania = przepuść (fail-open) — blokowanie zepsutych poleceń nic nie daje.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
let TEAM_MODE = false; // ustawiane z .workflow/config.json (multiDev) przed analizą polecenia
let CWD = process.cwd(); // katalog polecenia (input.cwd) — z niego bieżąca gałąź dla pushu bez refspec; null = nieznany (cd $X)
// Wcześniej w tym samym poleceniu mogła się zmienić gałąź albo katalog (cd, git switch/checkout, alias, podpowłoka):
// bieżącej gałęzi nie da się wtedy ustalić przed wykonaniem — push bez refspec traktujemy jak push z `main`.
let UNSURE = false;

const MSG = {
  stash: 'NIE WOLNO używać `git stash` — stash jest wspólny dla wszystkich worktree; zrób commit roboczy (PUL-14, ORK-37).',
  pipe: 'Bramki sekretów NIE WOLNO puszczać przez potok — kod wyjścia byłby kodem ostatniego polecenia; uruchom bez potoku i sprawdź `$?` (BZP-16, PUL-3).',
  main: 'Push gałęzi prosto na `main` omija PR; użyj `git push -u origin HEAD` i PR (PUL-17, ZAS-2). Push bez refspec po zmianie katalogu/gałęzi w tym samym poleceniu traktuję jak push z `main` — uruchom go osobno albo z jawnym refspec.',
  force: 'NIE WOLNO wymuszać pushu na `main` — przepisanie historii jest nieodwracalne i wymaga decyzji człowieka (PUL-48, ZAS-20). Push bez refspec po zmianie katalogu/gałęzi w tym samym poleceniu traktuję jak push na `main` — podaj jawny refspec: `git push -f origin <gałąź>`.',
  hooks: 'NIE WOLNO pomijać hooków (`--no-verify`, `commit -n`, `core.hooksPath`) — hook pre-push to bramka sekretów (BZP-46).',
};
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', '!', 'time', 'esac', 'function']);
const MAX_DEPTH = 100;

// ---------- tokenizer ----------
// Wynik: { cmds: [{ words, heredocs, herestrings, piped }], subs: [tekst podstawień $(…)/`…`/<(…)], end }.
// nested = czytanie wnętrza $(…): kończy na niesparowanym ')' (end = indeks za nim).
// Niedomknięte cudzysłowy i podstawienia biorą resztę wejścia (łagodnie, bez wyjątku).
function tokenize(src, start = 0, nested = false) {
  const cmds = []; const subs = []; const groups = []; const pending = [];
  let cur = newCmd(); let word = null; let target = null; let lastGroup = null; let i = start; let paren = 0;
  const n = src.length;
  function newCmd() { return { words: [], lit: [], heredocs: [], herestrings: [], piped: false }; }
  const add = (s) => { word = word ?? { text: '', quoted: false }; word.text += s; };
  function endWord() {
    if (word === null) return;
    const word0 = word; const { text, quoted } = word; word = null;
    if (target === 'here') { cur.herestrings.push(text); target = null; return; }
    if (target === 'file') { target = null; return; }
    if (!quoted && cur.words.length === 0 && text === '{') { groups.push(cmds.length); return; }
    if (!quoted && cur.words.length === 0 && text === '}') { closeGroup(); return; }
    cur.words.push(text); cur.lit.push(word0.lit === true);
  }
  function endCmd() { endWord(); target = null; if (cur.words.length) { cur.inSub = paren > 0; cmds.push(cur); } cur = newCmd(); }
  function closeGroup() { const s = groups.length ? groups.pop() : cmds.length; lastGroup = { start: s, end: cmds.length }; }
  function pipe() {
    endWord();
    if (cur.words.length === 0 && lastGroup && lastGroup.end === cmds.length) {
      for (let k = lastGroup.start; k < lastGroup.end; k++) cmds[k].piped = true;
    } else cur.piped = true;
    endCmd();
  }
  function substitution(prefix, open) { // open = indeks za '('
    const { end } = tokenize(src, open, true);
    const body = src.slice(open, Math.max(open, end - 1));
    subs.push(body); add(`${prefix}(${body})`); i = end;
  }
  function readHeredocs() {
    for (const h of pending.splice(0)) {
      const lines = [];
      while (i < n) {
        let e = src.indexOf('\n', i); if (e < 0) e = n;
        let line = src.slice(i, e); i = e + 1;
        if (h.dash) line = line.replace(/^\t+/, '');
        if (line === h.tag) break;
        lines.push(line);
      }
      const body = lines.join('\n');
      h.cmd.heredocs.push(body);
      if (!h.quoted) subs.push(...expansions(body));
    }
  }
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t') { endWord(); i++; continue; }
    if (c === '\n') { endCmd(); i++; readHeredocs(); continue; }
    if (c === '#' && word === null) { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '\\') { if (src[i + 1] === '\n') { i += 2; continue; } add(src[i + 1] ?? ''); word.quoted = true; if (src[i + 1] === '$') word.lit = true; i += 2; continue; }
    if (c === "'") { const e = src.indexOf("'", i + 1); const end = e < 0 ? n : e; add(src.slice(i + 1, end)); word.quoted = true; if (src.slice(i + 1, end).includes('$')) word.lit = true; i = end + 1; continue; }
    if (c === '"') {
      add(''); word.quoted = true; i++;
      while (i < n && src[i] !== '"') {
        const d = src[i];
        if (d === '\\' && i + 1 < n) { const x = src[i + 1]; if ('"\\$`'.includes(x)) { add(x); if (x === '$') word.lit = true; } else if (x !== '\n') add(d + x); i += 2; }
        else if (d === '$' && src[i + 1] === '(') substitution('$', i + 2);
        else if (d === '`') { const [body, e] = backtick(src, i + 1); subs.push(body); add(`\`${body}\``); i = e; }
        else { add(d); i++; }
      }
      i++; continue;
    }
    if (c === '$' && src[i + 1] === "'") { const [s, e] = ansiC(src, i + 2); add(s); word.quoted = true; if (s.includes('$')) word.lit = true; i = e; continue; }
    if (c === '$' && src[i + 1] === '(') { substitution('$', i + 2); continue; }
    if (c === '`') { const [body, e] = backtick(src, i + 1); subs.push(body); add(`\`${body}\``); i = e; continue; }
    if (c === ';') { endCmd(); i += src[i + 1] === ';' ? 2 : 1; continue; }
    if (c === '&') {
      if (src[i + 1] === '&') { endCmd(); i += 2; continue; }
      if (src[i + 1] === '>') { endWord(); i += src[i + 2] === '>' ? 3 : 2; target = 'file'; continue; }
      endCmd(); i++; continue;
    }
    if (c === '|') {
      if (src[i + 1] === '|') { endCmd(); i += 2; continue; }
      pipe(); i += src[i + 1] === '&' ? 2 : 1; continue;
    }
    if (c === '(') { endCmd(); groups.push(cmds.length); paren++; i++; continue; }
    if (c === ')') {
      if (nested && groups.length === 0) { endCmd(); return { cmds, subs, end: i + 1 }; }
      endCmd(); closeGroup(); paren = Math.max(0, paren - 1); i++; continue;
    }
    if (c === '<' || c === '>') {
      if (src[i + 1] === '(') { endWord(); substitution(c, i + 2); continue; }
      if (word && !word.quoted && /^\d+$/.test(word.text)) word = null; // numer deskryptora (2>&1)
      else endWord();
      if (src.startsWith('<<<', i)) { i += 3; target = 'here'; continue; }
      if (src.startsWith('<<', i)) {
        const dash = src[i + 2] === '-'; i += dash ? 3 : 2;
        while (src[i] === ' ' || src[i] === '\t') i++;
        let tag = ''; let quoted = false;
        while (i < n && !/[\s;&|<>()]/.test(src[i])) {
          const d = src[i];
          if (d === "'" || d === '"') { quoted = true; const e = src.indexOf(d, i + 1); const end = e < 0 ? n : e; tag += src.slice(i + 1, end); i = end + 1; }
          else if (d === '\\') { quoted = true; tag += src[i + 1] ?? ''; i += 2; }
          else { tag += d; i++; }
        }
        pending.push({ tag, dash, quoted, cmd: cur });
        continue;
      }
      i++;
      if (i < n && '<>&|'.includes(src[i])) i++;
      target = 'file'; continue;
    }
    add(c); i++;
  }
  endCmd();
  return { cmds, subs, end: n };
}
function backtick(s, j) {
  let out = '';
  while (j < s.length && s[j] !== '`') { if (s[j] === '\\' && j + 1 < s.length) { out += s[j + 1]; j += 2; } else out += s[j++]; }
  return [out, j + 1];
}
function ansiC(s, j) {
  const esc = { n: '\n', t: '\t', r: '\r', e: '\x1b', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', "'": "'", '"': '"', '?': '?' };
  let out = '';
  while (j < s.length && s[j] !== "'") {
    if (s[j] !== '\\') { out += s[j++]; continue; }
    const c = s[j + 1]; let m;
    if (c === 'x' && (m = /^[0-9a-fA-F]{1,2}/.exec(s.slice(j + 2)))) { out += String.fromCharCode(parseInt(m[0], 16)); j += 2 + m[0].length; }
    else if ((m = /^[0-7]{1,3}/.exec(s.slice(j + 1)))) { out += String.fromCharCode(parseInt(m[0], 8)); j += 1 + m[0].length; }
    else { out += esc[c] ?? `\\${c ?? ''}`; j += 2; }
  }
  return [out, j + 1];
}
// Podstawienia $(…) i `…` w treści heredoca bez cytowanego ogranicznika (powłoka je wykona).
function expansions(body) {
  const out = [];
  for (let j = 0; j < body.length;) {
    if (body[j] === '\\') { j += 2; continue; }
    if (body.startsWith('$(', j)) { const { end } = tokenize(body, j + 2, true); out.push(body.slice(j + 2, Math.max(j + 2, end - 1))); j = end; continue; }
    if (body[j] === '`') { const [b, e] = backtick(body, j + 1); out.push(b); j = e; continue; }
    j++;
  }
  return out;
}

// ---------- analiza ----------
const base = (w) => w.slice(w.lastIndexOf('/') + 1);
const isMainRef = (ref) => {
  const r = ref.replace(/^refs\/heads\//, '');
  if (r.includes('*')) {
    const re = new RegExp(`^${ref.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
    return ['main', 'master', 'refs/heads/main', 'refs/heads/master'].some((x) => re.test(x));
  }
  return r === 'main' || r === 'master';
};
const isNoVerify = (t) => t.length >= 8 && '--no-verify'.startsWith(t.split('=')[0]);

// Pomija przedrostki (przypisania, słowa kluczowe, env/command/sudo/xargs…); zwraca { words, env }.
function strip(words) {
  const env = []; let i = 0;
  const skipOpts = (withArg = []) => {
    while (i < words.length && /^-/.test(words[i]) && words[i] !== '--') {
      const t = words[i++];
      if (withArg.includes(t)) i++;
    }
    if (words[i] === '--') i++;
  };
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) { env.push(w); i++; continue; }
    if (KEYWORDS.has(w)) { i++; continue; }
    const b = base(w);
    if (b === 'command' || b === 'builtin' || b === 'exec' || b === 'nohup') { i++; skipOpts(); continue; }
    if (b === 'env') { i++; skipOpts(['-u', '-C', '--unset', '--chdir']); continue; }
    if (b === 'sudo' || b === 'doas') { i++; skipOpts(['-u', '-g', '-h', '-p', '-C', '-U', '-D', '-r', '-t']); continue; }
    if (b === 'nice' || b === 'ionice') { i++; skipOpts(['-n', '-c']); continue; }
    if (b === 'timeout') { i++; skipOpts(['-s', '-k', '--signal', '--kill-after']); i++; continue; }
    if (b === 'xargs') { i++; skipOpts(['-I', '-n', '-P', '-L', '-d', '-E', '-s', '-a']); continue; }
    break;
  }
  return { words: words.slice(i), env };
}

// Opcje powłoki: { cMode, sMode, rest } — rest = pierwsze słowo po opcjach (polecenie przy -c albo skrypt).
function shellArgs(w) {
  let i = 1; let cMode = false; let sMode = false;
  while (i < w.length) {
    const t = w[i];
    if (t === '--' || t === '-') { i++; break; }
    if (t.startsWith('--')) { i += t === '--rcfile' || t === '--init-file' ? 2 : 1; continue; }
    if (/^[-+][A-Za-z]+$/.test(t)) {
      let skip = 0;
      for (const ch of t.slice(1)) {
        if (ch === 'c' && t[0] === '-') cMode = true;
        if (ch === 's') sMode = true;
        if (ch === 'o' || ch === 'O') skip++;
      }
      i += 1 + skip; continue;
    }
    break;
  }
  return { cMode, sMode, rest: i < w.length ? w[i] : null, restIdx: i };
}

// Bieżąca gałąź repo w katalogu polecenia (push bez refspec / z HEAD wypycha właśnie ją); brak gita albo odłączony HEAD → null.
// Nieznany katalog albo możliwa zmiana stanu wcześniej w poleceniu → zakładamy main (bezpiecznie domyślnie).
function currentBranch(dir) {
  if (dir === null || UNSURE) return 'main';
  const r = spawnSync('git', ['-C', dir, 'symbolic-ref', '-q', '--short', 'HEAD'], { encoding: 'utf8', timeout: 3000 });
  return r.status === 0 ? r.stdout.trim() : null;
}
const inDir = (dir, v) => (/[$`~]/.test(v) ? null : /^\//.test(v) ? resolve(v) : dir === null ? null : resolve(dir, v));
// Skutki polecenia dla dalszej części łańcucha: cd zmienia katalog (nieznany cel albo cd w podpowłoce → niepewność),
// git switch / checkout <gałąź> / rebase <baza> <gałąź> / alias powłokowy → gałąź niepewna (zmiana na dysku albo nieudana).
function applyEffects(w, inSub = false, depth = 0) {
  const b = base(w[0]);
  if (b === 'cd' || b === 'pushd' || b === 'popd') {
    const t = b === 'popd' ? '-' : (w.find((x, k) => k > 0 && !x.startsWith('-')) ?? '~');
    const next = t === '-' ? null : inDir(CWD, t.replace(/^~(?=\/|$)/, process.env.HOME ?? '~'));
    if (next === null || inSub) UNSURE = true;
    CWD = next; return;
  }
  if (b === 'source' || b === '.') { UNSURE = true; return; }
  if (b !== 'git') return;
  let i = 1; let dir = CWD; const aliases = {};
  while (i < w.length && w[i].startsWith('-')) {
    const t = w[i];
    if (t === '-C') dir = inDir(dir, w[i + 1] ?? '');
    if (t === '-c') { const m = (w[i + 1] ?? '').match(/^alias\.([^=]+)=([\s\S]*)$/i); if (m) aliases[m[1]] = m[2]; }
    i += ['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix'].includes(t) ? 2 : 1;
  }
  const sub = w[i]; const args = w.slice(i + 1);
  if (sub === undefined) return;
  const alias = aliases[sub] ?? gitAlias(dir, sub);
  if (alias) {
    if (alias.startsWith('!') || depth >= 10) { UNSURE = true; return; }
    applyEffects(['git', ...(tokenize(alias).cmds[0]?.words ?? []), ...args], inSub, depth + 1); return;
  }
  const positional = args.filter((a) => !a.startsWith('-'));
  if (sub === 'switch') UNSURE = true;
  else if (sub === 'checkout' && !args.includes('--')) UNSURE = true; // checkout -- <pliki> nie zmienia gałęzi
  else if (sub === 'rebase' && positional.length >= 2) UNSURE = true; // rebase <baza> <gałąź> przełącza na <gałąź>
}

// Polecenia wbudowane gita — aliasu o takiej nazwie git nie użyje, więc nie trzeba go szukać w konfiguracji.
const GIT_BUILTINS = new Set(['add', 'am', 'apply', 'bisect', 'blame', 'branch', 'checkout', 'cherry-pick', 'clean', 'clone', 'commit',
  'config', 'describe', 'diff', 'fetch', 'format-patch', 'gc', 'grep', 'init', 'log', 'ls-files', 'ls-remote', 'merge', 'mv', 'notes',
  'pull', 'push', 'rebase', 'reflog', 'remote', 'reset', 'restore', 'rev-parse', 'revert', 'rm', 'show', 'stash', 'status', 'submodule',
  'switch', 'tag', 'worktree', 'help', 'version', 'for-each-ref', 'symbolic-ref', 'update-ref', 'cat-file', 'hash-object', 'shortlog']);
function gitAlias(dir, name) {
  if (dir === null || GIT_BUILTINS.has(name) || !/^[\w-]+$/.test(name)) return null;
  const r = spawnSync('git', ['-C', dir, 'config', '--get', `alias.${name}`], { encoding: 'utf8', timeout: 3000 });
  return r.status === 0 ? r.stdout.trim() : null;
}
const quote = (x) => (/^[\w./=:@%+-]+$/.test(x) ? x : `'${x.replace(/'/g, "'\\''")}'`);

function checkGit(w, env, depth = 0) {
  for (const e of env) if (/^GIT_CONFIG_(KEY_\d+|PARAMETERS)=.*core\.hookspath/i.test(e)) return MSG.hooks;
  let i = 1; let dir = CWD; const aliases = {}; const opts = [];
  const ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env', '--super-prefix']);
  const config = (v) => { // -c klucz=wartość: hooksPath zabroniony, alias zapamiętany do rozwinięcia
    if (/^core\.hookspath(=|$)/i.test(v)) return MSG.hooks;
    const m = v.match(/^alias\.([^=]+)=([\s\S]*)$/i); if (m) aliases[m[1]] = m[2];
    return null;
  };
  while (i < w.length && w[i].startsWith('-')) {
    const t = w[i];
    if (ARG.has(t)) {
      const v = w[i + 1] ?? '';
      if (t === '-c' || t === '--config-env') { const r = config(v); if (r) return r; }
      if (t === '-C') dir = inDir(dir, v);
      opts.push(t, v); i += 2; continue;
    }
    if (/^--config-env=core\.hookspath(=|$)/i.test(t)) return MSG.hooks;
    if (t.startsWith('-c') && t.length > 2) { const r = config(t.slice(2)); if (r) return r; }
    if (t.startsWith('-C') && t.length > 2) dir = inDir(dir, t.slice(2));
    opts.push(t); i++;
  }
  const sub = w[i]; const args = w.slice(i + 1);
  if (sub === undefined) return null;
  // Alias (z -c alias.X=… albo z konfiguracji repo): „!…” to polecenie powłoki, inaczej podpolecenie gita z argumentami.
  const alias = depth < 10 ? (aliases[sub] ?? gitAlias(dir, sub)) : null;
  if (alias) {
    if (alias.startsWith('!')) { // alias powłokowy działa w katalogu repo z -C
      const saved = CWD; CWD = dir;
      try { return analyze([alias.slice(1), ...args.map(quote)].join(' '), depth + 1); } finally { CWD = saved; }
    }
    const expanded = tokenize(alias).cmds[0]?.words ?? [];
    return checkGit(['git', ...opts, ...expanded, ...args], [], depth + 1);
  }
  if (sub === 'stash') return args[0] === 'list' || args[0] === 'show' ? null : MSG.stash;
  if (sub === 'commit') return checkCommit(args);
  if (sub === 'push') return checkPush(args, dir);
  if (sub === 'config') {
    let pos = args.filter((a) => !a.startsWith('-'));
    // składnia podpoleceń (git ≥ 2.46): git config set|unset … <klucz> [wartość]
    const verb = ['set', 'unset'].includes(pos[0]) ? pos[0] : null;
    if (verb) pos = pos.slice(1);
    if (verb === 'unset' && pos[0] && /^core\.hookspath$/i.test(pos[0])) return MSG.hooks;
    const unset = args.some((a) => a.startsWith('--unset'));
    if (pos[0] && /^core\.hookspath$/i.test(pos[0]) && (unset || (pos[1] !== undefined && pos[1] !== '.githooks'))) return MSG.hooks;
    return null;
  }
  if (['merge', 'rebase', 'am', 'pull', 'cherry-pick', 'revert'].includes(sub)) {
    for (const a of args) { if (a === '--') break; if (isNoVerify(a)) return MSG.hooks; }
  }
  return null;
}

function checkCommit(args) {
  const LONG = new Set(['--message', '--file', '--reuse-message', '--reedit-message', '--template', '--author', '--date',
    '--fixup', '--squash', '--trailer', '--pathspec-from-file', '--cleanup']);
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--') break;
    if (t.startsWith('--')) {
      if (isNoVerify(t)) return MSG.hooks;
      if (!t.includes('=') && LONG.has(t)) i++;
      continue;
    }
    if (t.startsWith('-') && t.length > 1) {
      for (let k = 1; k < t.length; k++) {
        const ch = t[k];
        if (ch === 'n') return MSG.hooks;
        if ('mFCct'.includes(ch)) { if (k === t.length - 1) i++; break; }
      }
    }
  }
  return null;
}

function checkPush(args, dir = CWD) {
  const LONG = new Set(['--repo', '--receive-pack', '--exec', '--push-option']);
  let force = false; let noVerify = false; let mirror = false; let all = false; const pos = [];
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '--') { pos.push(...args.slice(i + 1)); break; }
    if (t.startsWith('--')) {
      const name = t.split('=')[0];
      if (isNoVerify(t)) noVerify = true;
      else if (name.length >= 5 && ('--force'.startsWith(name) || '--force-with-lease'.startsWith(name))) force = true;
      else if (name === '--mirror') { force = true; mirror = true; }
      else if (name === '--all' || name === '--branches') all = true;
      else if (!t.includes('=') && LONG.has(t)) i++;
      continue;
    }
    if (t.startsWith('-') && t.length > 1) {
      for (let k = 1; k < t.length; k++) {
        if (t[k] === 'f') force = true;
        if (t[k] === 'o') { if (k === t.length - 1) i++; break; }
      }
      continue;
    }
    pos.push(t);
  }
  let toMain = false; let forceMain = false;
  const specs = pos.slice(1); if (mirror || all) specs.push('refs/heads/*:refs/heads/*');
  // Bez refspec push wysyła bieżącą gałąź; „HEAD”/„@” bez dwukropka też. Na main to push na main.
  let branch;
  const cur = () => (branch === undefined ? (branch = currentBranch(dir)) : branch);
  if (!specs.length) specs.push(cur() ?? 'HEAD');
  for (let spec of specs) {
    const plusRaw = spec.startsWith('+'); const bare = plusRaw ? spec.slice(1) : spec;
    if (bare === 'HEAD' || bare === '@') spec = `${plusRaw ? '+' : ''}${cur() ?? 'HEAD'}`;
    const plus = spec.startsWith('+'); const s = plus ? spec.slice(1) : spec;
    const c = s.indexOf(':'); const dst = c < 0 || c === s.length - 1 ? s.slice(0, c < 0 ? s.length : c) : s.slice(c + 1);
    if (!isMainRef(dst)) continue;
    if (plus || force) forceMain = true;
    // Inna gałąź (HEAD:main, feat/x:main) wypychana na main zawsze omija PR. Zwykły push main → main jest
    // blokowany tylko w zespole (main chroniony); w trybie solo to droga zapisów procesu (ZAS-2).
    const src = c < 0 ? s : s.slice(0, c);
    if (!isMainRef(src) || TEAM_MODE) toMain = true;
  }
  if (forceMain) return MSG.force;
  if (toMain) return MSG.main;
  if (noVerify) return MSG.hooks;
  return null;
}

function runsCheckSecrets(w, depth = 0) {
  const b = base(w[0]);
  if (/check-secrets\.sh$/.test(b)) return true;
  if (!SHELLS.has(b) || depth > 10) return false;
  const { cMode, rest } = shellArgs(w);
  if (rest === null) return false;
  // -c: skaner musi być poleceniem w treści, nie słowem w danych (echo "check-secrets.sh")
  if (cMode) return tokenize(rest).cmds.some((c) => { const ws = strip(c.words).words; return ws.length > 0 && runsCheckSecrets(ws, depth + 1); });
  return /check-secrets\.sh$/.test(base(rest));
}

function analyze(src, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error('zbyt głębokie zagnieżdżenie');
  const { cmds, subs } = tokenize(src);
  const vars = {}; // g=git; "$g" push … — samodzielne przypisania podstawiane w nazwie polecenia
  for (const cmd of cmds) {
    const { words: w, env } = strip(cmd.words);
    if (!w.length) { for (const e of env) { const k = e.indexOf('='); vars[e.slice(0, k)] = e.slice(k + 1); } continue; }
    const v = w[0].match(/^\$\{?([A-Za-z_]\w*)\}?$/);
    const literal = cmd.lit[cmd.words.length - w.length]; // '$g' w apostrofach powłoka nie rozwija
    if (v && !literal && vars[v[1]] !== undefined) w.splice(0, 1, ...(tokenize(vars[v[1]]).cmds[0]?.words ?? []));
    if (!w.length) continue;
    if (cmd.piped && runsCheckSecrets(w)) return MSG.pipe;
    const b = base(w[0]);
    let r = null;
    if (b === 'find') {
      // find … -exec|-execdir|-ok|-okdir <polecenie> … ;|+ — polecenie wykonywane dla każdego pliku
      for (let k = 1; k < w.length && !r; k++) {
        if (!['-exec', '-execdir', '-ok', '-okdir'].includes(w[k])) continue;
        let e = k + 1; while (e < w.length && w[e] !== ';' && w[e] !== '+') e++;
        r = analyze(w.slice(k + 1, e).map(quote).join(' '), depth + 1);
        k = e;
      }
    }
    if (b === 'git') r = checkGit(w, env, depth);
    else if (b === 'eval') r = analyze(w.slice(1).join(' '), depth + 1);
    else if (SHELLS.has(b)) {
      const { cMode, sMode, rest } = shellArgs(w);
      if (cMode && rest !== null) { const saved = CWD; r = analyze(rest, depth + 1); CWD = saved; } // cd w powłoce potomnej nie przenosi rodzica
      else if (rest === null || sMode) {
        for (const body of [...cmd.heredocs, ...cmd.herestrings]) if ((r = analyze(body, depth + 1))) break;
      }
    }
    if (r) return r;
    applyEffects(w, cmd.inSub);
  }
  for (const s of subs) { const r = analyze(s, depth + 1); if (r) return r; }
  return null;
}

// ---------- główny przebieg ----------
function block(msg) { process.stderr.write(`Zablokowane przez strażnika procesu: ${msg}\n`); process.exit(2); }

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const cmd = String(input.tool_input?.command ?? '');
if (!cmd) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
CWD = input.cwd ?? root;
try { TEAM_MODE = /"multiDev"\s*:\s*true/.test(readFileSync(join(root, '.workflow', 'config.json'), 'utf8')); } catch { TEAM_MODE = false; }

let verdict = null;
try { verdict = analyze(cmd); } catch { verdict = null; /* fail-open */ }
if (verdict) block(verdict);

const extra = join(root, '.workflow', 'guard-extra.txt');
if (existsSync(extra)) {
  for (const line of readFileSync(extra, 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [re, msg] = line.split('\t');
    let rx;
    try { rx = new RegExp(re); } catch { continue; /* błędny wzorzec pomijamy */ }
    if (rx.test(cmd)) block(msg || `Polecenie zablokowane regułą projektu: ${re}`);
  }
}
process.exit(0);
