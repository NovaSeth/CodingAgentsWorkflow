#!/usr/bin/env node
// setup.mjs — kreator CodingAgentsWorkflow: nowy projekt albo wdrożenie w istniejącym.
//
//   node scripts/setup.mjs                         interaktywnie (pytania z domyślnymi odpowiedziami)
//   node scripts/setup.mjs --yes [--klucz wartość]… nieinteraktywnie: brakujące odpowiedzi = domyślne
//   node scripts/setup.mjs --answers plik.json     odpowiedzi z pliku (np. wspólny standard firmy)
//   node scripts/setup.mjs --dry-run …             pokaż plan, nic nie zapisuj
//   node scripts/setup.mjs --force …               nadpisuj istniejące pliki kitu; przy --update: pozwól na brudne drzewo gita
//   node scripts/setup.mjs --update [ścieżka]       aktualizacja frameworka: zastępuje pliki frameworka (metoda, skrypty, agenci,
//                                                  szablony); plik zmieniony lokalnie zostaje, nowa wersja → <plik>.kit-new;
//                                                  pliki projektu (manifest: userOwned) bez zmian, nowszy szablon → <plik>.kit-new;
//                                                  sumy SHA-256 zainstalowanych plików: .workflow/kit-files.json
//
// Klucze (flagi --klucz wartość albo --klucz=wartość):
//   mode new|existing · path · name · description · team solo|zespol|duzy · scale maly|sredni|duzy
//   stack typescript|python|inny · level minimum|standard|full · board · ci github|brak
//   author (inicjały, 2–4 litery + opcjonalnie cyfra; zapisywane tylko w git config workflow.author)
//   areas (lista po przecinku) · owners (@handle,…) · po · security-owner
// Flagi tak/nie (bez wartości = tak; --no-<flaga> albo --<flaga>=nie = nie):
//   --ui · --discovery · --second-provider · --install-deps (tylko nowy projekt) · --commit (tylko nowy projekt; domyślnie tak)
//   --lockfile (tylko nowy projekt TypeScript bez --install-deps; domyślnie tak): package-lock.json przez
//     npm install --package-lock-only --ignore-scripts (pobiera metadane pakietów z sieci); --no-lockfile pomija
// Kody wyjścia: 0 ok · 1 przerwane przez użytkownika · 2 błąd (brak gita, złe odpowiedzi, brudne drzewo przy --update).
import { createInterface } from 'node:readline/promises';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, chmodSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpus, totalmem } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, '../kit');
const MANIFEST = JSON.parse(readFileSync(join(KIT, 'manifest.json'), 'utf8'));
const KIT_VERSION = JSON.parse(readFileSync(resolve(HERE, '../package.json'), 'utf8')).version;
const KIT_FILES = '.workflow/kit-files.json';
const INITIALS_RE = /^[A-Z]{2,4}[0-9]?$/;

const fail = (msg) => { console.error(`setup: ${msg}`); process.exit(2); };
const run = (cmd, args, cwd, extra = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', ...extra });
const out = (r) => String(r?.stdout ?? '').trim();
const errOut = (r) => String(r?.stderr ?? '').trim() || out(r) || String(r?.error?.message ?? '');
const gitOut = (args, cwd) => { const r = run('git', args, cwd); return r.status === 0 ? out(r) : ''; };
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

// ---------- argumenty ----------
const BOOL_KEYS = new Set(['ui', 'backend', 'discovery', 'secondProvider', 'installDeps', 'commit', 'lockfile']);
const argv = process.argv.slice(2);
const opts = { yes: false, dryRun: false, force: false, update: false };
const given = {};
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--yes' || a === '-y') opts.yes = true;
  else if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--force') opts.force = true;
  else if (a === '--update') { opts.update = true; opts.yes = true; }
  else if (a === '-h' || a === '--help') {
    const lines = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
    console.log(lines.slice(0, lines.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  } else if (a === '--answers') {
    if (argv[i + 1] === undefined) fail('--answers wymaga ścieżki do pliku JSON');
    const ans = readJson(argv[++i]);
    if (!isObj(ans)) fail(`--answers: ${argv[i]} nie jest obiektem JSON`);
    Object.assign(given, ans);
  } else if (a.startsWith('--no-')) given[camel(a.slice(5))] = false;
  else if (a.startsWith('--')) {
    const eq = a.indexOf('=');
    const k = camel(eq < 0 ? a.slice(2) : a.slice(2, eq));
    const next = argv[i + 1];
    if (eq >= 0) given[k] = a.slice(eq + 1);
    else if (BOOL_KEYS.has(k)) given[k] = true; // flaga tak/nie nie pobiera następnego argumentu
    else if (next === undefined || next.startsWith('--')) fail(`--${a.slice(2)} wymaga wartości`);
    else { given[k] = next; i++; }
  } else if (!given.path) given.path = a;
}

// ---------- git ----------
const gv = run('git', ['--version']);
if (gv.error || gv.status !== 0) fail('brak gita (git --version nie działa) — zainstaluj git i uruchom ponownie');

let savedCfg = null;
if (opts.update) {
  const cfgPath = join(resolve(given.path ?? '.'), '.workflow/config.json');
  if (!existsSync(cfgPath)) fail(`--update: brak ${cfgPath} — projekt nie był instalowany kreatorem`);
  savedCfg = readJson(cfgPath);
  if (!isObj(savedCfg)) fail(`--update: ${cfgPath} nie jest poprawnym JSON`);
  const saved = { ...savedCfg };
  for (const k of ['kit', 'kitVersion', 'created', 'multiDev', 'updated', 'author']) delete saved[k];
  Object.assign(given, { ...saved, ...given, mode: 'existing', path: resolve(given.path ?? '.'), commit: false, installDeps: false });
}
const interactive = !opts.yes && process.stdin.isTTY;

// ---------- pytania ----------
const gitName = gitOut(['config', 'user.name']);
// Inicjały z imienia i nazwiska: polskie znaki transliterowane (Łukasz Żak → LZ), jeden człon → dwie pierwsze litery (Michał → MI).
const initialsOf = (name) => {
  const words = String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .split(/[^A-Za-z]+/).filter(Boolean);
  if (!words.length) return '';
  return (words.length === 1 ? words[0].slice(0, 2) : words.map((w) => w[0]).join('').slice(0, 4)).toUpperCase();
};
const defaultAuthor = (a) => {
  const t = resolve(a.path);
  const own = a.mode === 'existing' && existsSync(join(t, '.git')) ? gitOut(['config', 'workflow.author'], t) : '';
  return own || initialsOf(gitName) || 'AB';
};
const suggestLevel = (a) => (a.team === 'duzy' || a.secondProvider ? 'full'
  : a.team === 'zespol' || a.scale !== 'maly' ? 'standard' : 'minimum');
const Q = [
  { key: 'mode', q: 'Nowy projekt czy istniejący?', choices: ['new', 'existing'], def: () => 'new' },
  { key: 'path', q: 'Ścieżka projektu', def: (a) => (a.mode === 'new' ? './nowy-projekt' : '.') },
  { key: 'name', q: 'Nazwa projektu', def: (a) => basename(resolve(a.path)) },
  { key: 'description', q: 'Jedno zdanie: co to za projekt', def: () => '<Jedno zdanie: co to za projekt.>' },
  { key: 'team', q: 'Zespół: solo (1 osoba), zespol (2–5 deweloperów), duzy (6+, kilka zespołów)?', choices: ['solo', 'zespol', 'duzy'], def: () => 'solo' },
  { key: 'scale', q: 'Skala: maly (dni–tygodnie), sredni (tygodnie–miesiące), duzy (miesiące, wiele obszarów)?', choices: ['maly', 'sredni', 'duzy'], def: () => 'sredni' },
  { key: 'stack', q: 'Stos?', choices: ['typescript', 'python', 'inny'], def: () => 'typescript' },
  { key: 'ui', q: 'Czy projekt ma interfejs użytkownika (design system, tokeny, makiety)?', bool: true, def: () => true },
  { key: 'backend', q: 'Czy projekt ma backend z zapisami / danymi wielu użytkowników (idempotencja, dzierżawcy, zdarzenia)?', bool: true, def: (a) => a.stack !== 'inny' },
  { key: 'discovery', q: 'Czy potrzebny jest research / discovery (strumienie, wywiady, raport decyzyjny)?', bool: true, def: (a) => a.mode === 'new' && a.scale !== 'maly' },
  { key: 'secondProvider', q: 'Czy używacie modeli drugiego dostawcy (inne CLI) jako wykonawców / recenzentów?', bool: true, def: () => false },
  { key: 'level', q: 'Poziom procesu?', choices: ['minimum', 'standard', 'full'], def: suggestLevel },
  { key: 'board', q: 'Tablica zadań (GitHub Issues, Linear, Jira, YouTrack, inna, brak)?', def: () => 'GitHub Issues' },
  { key: 'ci', q: 'CI?', choices: ['github', 'brak'], def: (a) => (a.team === 'solo' ? 'brak' : 'github') },
  { key: 'author', q: 'Twoje inicjały (identyfikator decyzji w ledgerze; 2–4 litery)', def: defaultAuthor, when: () => !opts.update },
  { key: 'areas', q: 'Obszary / pasy, po przecinku (np. konto,oferty,platnosci; puste = później)', def: () => '', when: (a) => a.level !== 'minimum' || a.team !== 'solo' },
  { key: 'owners', q: 'Właściciele części wspólnych dla CODEOWNERS (@login albo @org/zespol, po przecinku)', def: () => '', when: (a) => a.team !== 'solo' },
  { key: 'po', q: 'Właściciel produktu (PO)', def: () => '<PO>', when: (a) => a.team !== 'solo' },
  { key: 'securityOwner', q: 'Właściciel bezpieczeństwa (audyt przed wydaniem)', def: (a) => (a.owners || '').split(',')[0]?.trim() || '<osoba>', when: (a) => a.team !== 'solo' },
  { key: 'installDeps', q: 'Zainstalować zależności szkieletu teraz (npm / pip)?', bool: true, def: () => false, when: (a) => a.mode === 'new' && a.stack !== 'inny' },
  { key: 'lockfile', q: 'Wygenerować package-lock.json (npm, sieć; potrzebny dla npm ci w CI)?', bool: true, def: () => true, when: (a) => a.mode === 'new' && a.stack === 'typescript' && !a.installDeps },
  { key: 'commit', q: 'Zrobić pierwszy commit w nowym repo?', bool: true, def: () => true, when: (a) => a.mode === 'new' },
];

const TRUE_RE = /^(t|tak|y|yes|true|1)$/i;
const FALSE_RE = /^(n|nie|no|false|0)$/i;
const toBool = (v, key) => {
  if (typeof v === 'boolean') return v;
  if (TRUE_RE.test(String(v))) return true;
  if (FALSE_RE.test(String(v))) return false;
  throw new Error(`${key}: „${v}” — dozwolone: tak, nie`);
};
async function ask() {
  const a = {};
  const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  if (interactive) console.log('CodingAgentsWorkflow — kreator. Enter = odpowiedź domyślna w [nawiasach].\n');
  for (const q of Q) {
    if (q.when && !q.when(a)) continue;
    const def = q.def(a);
    let v = given[q.key];
    if (v === undefined && rl) {
      const hint = q.bool ? (def ? 'T/n' : 't/N') : q.choices ? `${q.choices.join(' | ')}; ${def}` : def;
      const ans = (await rl.question(`${q.q} [${hint}] `)).trim();
      v = ans === '' ? undefined : ans;
    }
    if (v === undefined) v = def;
    if (q.bool) v = toBool(v, q.key);
    if (q.choices && !q.choices.includes(v)) throw new Error(`${q.key}: „${v}” — dozwolone: ${q.choices.join(', ')}`);
    if (q.key === 'author') {
      v = String(v).toUpperCase();
      if (!INITIALS_RE.test(v)) throw new Error(`inicjały „${v}” są nieprawidłowe: 2–4 litery A–Z bez polskich znaków (opcjonalnie cyfra), np. MG albo MG2 — podaj --author XY`);
    }
    a[q.key] = v;
  }
  if (rl) {
    console.log('\nPodsumowanie:'); for (const [k, v] of Object.entries(a)) console.log(`  ${k.padEnd(15)} ${v}`);
    const ok = (await rl.question('\nInstalować? [T/n] ')).trim();
    rl.close();
    if (ok && !TRUE_RE.test(ok)) { console.log('przerwano'); process.exit(1); }
  }
  return a;
}

// ---------- narzędzia ----------
const log = { done: [], skipped: [], same: 0, kitNewWritten: 0, warn: [], steps: [], localNew: [], templNew: [], obsolete: [] };
// Pliki systemowe i edytorów z lokalnego klonu (.DS_Store, Thumbs.db, *.swp, *~) nie trafiają do projektu.
const JUNK = /^(\.DS_Store|Thumbs\.db|desktop\.ini)$|\.sw[op]$|~$/;
const files = (dir) => readdirSync(dir).filter((f) => !JUNK.test(f)).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p]; });
const userOwned = (rel) => (MANIFEST.userOwned ?? []).some((u) => (u.endsWith('/') ? rel.startsWith(u) : rel === u));
// Zapis bez warunków (dry-run: tylko wpis do planu).
function put(target, rel, content, { mode, quiet = false } = {}) {
  if (opts.dryRun) { if (!quiet) log.done.push(`(dry-run) ${rel}`); return true; }
  const dst = join(target, rel);
  mkdirSync(dirname(dst), { recursive: true });
  writeFileSync(dst, content);
  if (mode) chmodSync(dst, mode);
  if (!quiet) log.done.push(rel);
  return true;
}
// Plik spoza manifestu (szkielet, CODEOWNERS, README): istniejący zostaje, chyba że force (przy --update --force tylko zezwala na brudne drzewo).
function write(target, rel, content, { mode, force = opts.force && !opts.update } = {}) {
  if (existsSync(join(target, rel)) && !force) { log.skipped.push(rel); return false; }
  return put(target, rel, content, { mode });
}
// Stan instalacji: sumy plików frameworka (files) i szablonów plików projektu (templates) — .workflow/kit-files.json.
let prevKit = { files: {}, templates: {} };
let kitRec = { files: {}, templates: {} };
// Wersja .kit-new obok pliku; identyczna istniejąca kopia zostaje bez zapisu.
function putKitNew(target, rel, buf, mode) {
  const p = join(target, `${rel}.kit-new`);
  if (existsSync(p) && Buffer.compare(readFileSync(p), buf) === 0) return 0;
  put(target, `${rel}.kit-new`, buf, { mode, quiet: true });
  return 1;
}
// Plik z manifestu / szablonu: framework (nadpisywany przy --update, chyba że zmieniony lokalnie) albo plik projektu (userOwned).
function install(target, rel, content, { mode, templateHash, key = rel } = {}) {
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  const dst = join(target, rel);
  const exists = existsSync(dst);
  if (userOwned(rel)) {
    const prevT = prevKit.templates[key];
    if (templateHash) kitRec.templates[key] = templateHash;
    if (!exists || (opts.force && !opts.update)) return put(target, rel, buf, { mode });
    if (opts.update && prevT && templateHash && prevT !== templateHash && Buffer.compare(readFileSync(dst), buf) !== 0) {
      log.kitNewWritten += putKitNew(target, rel, buf, mode); log.templNew.push(rel);
      return false;
    }
    log.skipped.push(rel); return false;
  }
  const h = sha(buf);
  if (!exists) { kitRec.files[rel] = h; return put(target, rel, buf, { mode }); }
  const cur = sha(readFileSync(dst));
  if (cur === h) { kitRec.files[rel] = h; log.same++; return false; }
  if (!opts.update) {
    if (!opts.force) { log.skipped.push(rel); return false; }
    kitRec.files[rel] = h; return put(target, rel, buf, { mode });
  }
  const prevH = prevKit.files[rel];
  kitRec.files[rel] = h;
  if (prevH && cur !== prevH) { log.kitNewWritten += putKitNew(target, rel, buf, mode); log.localNew.push(rel); return false; }
  return put(target, rel, buf, { mode });
}
function copy(target, src, rel, vars, opt = {}) {
  const raw = readFileSync(src);
  const isText = !/\.(png|jpg|zip)$/.test(src);
  const content = isText && vars && MANIFEST.templated.includes(rel) ? conditional(fill(raw.toString('utf8'), vars)) : raw;
  return install(target, rel, content, { mode: statSync(src).mode & 0o111 ? 0o755 : undefined, templateHash: sha(raw), ...opt });
}
const fill = (s, vars) => s.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (vars[k] ?? m));
// Linie warunkowe w szablonach: „<!--if:ui-->” (cecha) albo „<!--if:standard-->” (poziom ≥). Prawda → marker znika, fałsz → linia znika.
let FLAGS = {};
const conditional = (s) => s.split('\n').filter((l) => { const m = l.match(/<!--if:(!?)(\w+)-->/); return !m || (m[1] === '!' ? !FLAGS[m[2]] : FLAGS[m[2]]); })
  .map((l) => l.replace(/\s*<!--if:!?\w+-->\s*/, (x) => (x.startsWith(' ') && x.endsWith(' ') ? ' ' : ''))).join('\n');
function appendLines(target, rel, lines) {
  const dst = join(target, rel);
  const have = existsSync(dst) ? readFileSync(dst, 'utf8').split('\n') : [];
  const add = lines.filter((l) => l && !have.includes(l));
  if (!add.length) return;
  if (opts.dryRun) { log.done.push(`(dry-run) ${rel} += ${add.length} linii`); return; }
  mkdirSync(dirname(dst), { recursive: true });
  const prefix = have.length && have.at(-1) !== '' ? '\n' : '';
  appendFileSync(dst, prefix + add.join('\n') + '\n');
  log.done.push(`${rel} += ${add.join(', ')}`);
}

// Hooki Claude Code: plan scalenia z .claude/settings.json liczony PRZED zapisem plików (nieczytelna struktura → osobny plik).
function planHooks(target) {
  const ours = JSON.parse(readFileSync(join(KIT, '.claude/settings.workflow.json'), 'utf8'));
  const dst = join(target, '.claude/settings.json');
  const fallback = (why) => ({ fallback: `.claude/settings.json: ${why} — hooki zapisane do .claude/settings.workflow.json, scal ręcznie`, ours });
  let cur = {};
  if (existsSync(dst)) {
    try { cur = JSON.parse(readFileSync(dst, 'utf8')); } catch { return fallback('niepoprawny JSON'); }
  }
  if (!isObj(cur)) return fallback('to nie jest obiekt JSON');
  if (cur.hooks !== undefined && !isObj(cur.hooks)) return fallback('„hooks” nie jest obiektem');
  const hooks = { ...(cur.hooks ?? {}) };
  for (const event of Object.keys(ours.hooks)) {
    const v = hooks[event];
    if (v === undefined) continue;
    if (!Array.isArray(v)) return fallback(`„hooks.${event}” nie jest tablicą`);
    if (!v.every((g) => isObj(g) && Array.isArray(g.hooks))) return fallback(`„hooks.${event}”: grupa bez tablicy „hooks”`);
  }
  let added = 0;
  for (const [event, groups] of Object.entries(ours.hooks)) {
    const list = [...(hooks[event] ?? [])];
    const have = new Set(list.flatMap((g) => g.hooks.map((h) => (isObj(h) ? h.command : undefined))));
    for (const g of groups) if (!g.hooks.every((h) => have.has(h.command))) { list.push(g); added++; }
    hooks[event] = list;
  }
  return { added, merged: { ...cur, hooks }, dst };
}
function applyHooks(target, plan) {
  if (plan.fallback) {
    log.warn.push(plan.fallback);
    write(target, '.claude/settings.workflow.json', JSON.stringify(plan.ours, null, 2) + '\n', { force: true });
    return;
  }
  if (!plan.added) { log.skipped.push('.claude/settings.json (hooki już są)'); return; }
  if (opts.dryRun) { log.done.push(`(dry-run) .claude/settings.json += ${plan.added} hooków`); return; }
  mkdirSync(dirname(plan.dst), { recursive: true });
  writeFileSync(plan.dst, JSON.stringify(plan.merged, null, 2) + '\n');
  log.done.push(`.claude/settings.json += ${plan.added} hooków (SessionStart, SubagentStart, PreToolUse:Bash)`);
}
const sortKeys = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// ---------- główna logika ----------
async function main() {
  const a = await ask();
  const target = resolve(a.path);
  const multiDev = a.team !== 'solo';
  const stackDir = a.stack !== 'inny' ? join(KIT, 'stacks', a.stack) : null;
  const profile = stackDir ? JSON.parse(readFileSync(join(stackDir, 'profile.json'), 'utf8')) : null;
  const pkg = a.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projekt';
  const pyPkg = pkg.replace(/-/g, '_').replace(/^(\d)/, '_$1');
  const cores = cpus().length; const memGb = Math.round(totalmem() / 2 ** 30);
  const agentMax = memGb < 16 ? 2 : memGb >= 48 && cores >= 12 ? 4 : 3;
  const areas = String(a.areas || '').split(',').map((s) => s.trim()).filter(Boolean);
  const owners = String(a.owners || '').split(',').map((s) => s.trim()).filter(Boolean);
  const lvl = ['minimum', 'standard', 'full'].indexOf(a.level);
  FLAGS = { ui: a.ui, backend: a.backend, multiDev, discovery: a.discovery, secondProvider: a.secondProvider, ci: a.ci === 'github', standard: lvl >= 1, full: lvl >= 2, typescript: a.stack === 'typescript', python: a.stack === 'python', inny: a.stack === 'inny' };
  const vars = {
    PROJECT: a.name, DESCRIPTION: a.description, STACK: a.stack, LEVEL: a.level, TEAM: a.team, PKG: pkg, PY_PKG: pyPkg,
    GATE: profile?.commands.gate ?? '<typecheck> && <lint> && <testy>',
    WORKER_LIMIT: profile?.workerLimit ?? '<ogranicz workery runnera testów do 2>',
    // Zespół: maszyny różnią się, więc CLAUDE.md wskazuje limit lokalny, nie liczbę z maszyny instalującej.
    AGENT_MAX: multiDev ? 'limit z `.workflow/budget.local.env` (AGENT_MAX) tej maszyny' : `najwyżej ${agentMax}`,
    BOARD: a.board,
    DISCOVERY_TPL: a.discovery ? '; szablony `.workflow/templates/discovery/`' : '',
    LEDGER_IDS: multiDev ? 'R-<AUTOR>-<n>' : 'R<n>',
    AREAS: areas.length ? areas.map((x) => `\`${x}\``).join(', ') : '<pas-a>, <pas-b>, …', // pas = obszar (katalogi), nie gałąź
    AREAS_TABLE: (areas.length ? areas : ['<pas>']).map((x) => `| ${x} | ${a.stack === 'python' ? `src/${pyPkg}/modules/${x}/` : `src/modules/${x}/`} | <osoba> | \`claim.sh ${x}\` |`).join('\n'),
    PO: a.po ?? '<PO>', OWNERS: owners.join(', ') || '<właściciele>', SECURITY_OWNER: a.securityOwner ?? '<osoba>',
    TEAM_ROW: multiDev ? '\n| zespół: kto prowadzi pas, zajęcie i przekazanie pasa, decyzje [wspólne] | `docs/workflow/zespol.md` + `docs/workflow/metoda/14-zespol-wielu-deweloperow.md` §Procedura | przypisania pasów i właścicieli; `.workflow/bin/claim.sh`; zmiana części wspólnych |' : '',
    STACK_ROW: profile ? `\n| polecenia i wzorce stosu ${a.stack} | \`.workflow/stacks/${a.stack}/README.md\` | bramka, układ repo, limity workerów, wzorce kontraktu i zapisów |` : '',
    TEAM_GATES: multiDev ? '\n- **Zespół:** pas zajmujesz `claim.sh <pas>` przed pierwszym zleceniem; części wspólne tylko zadaniem S<n> z akceptacją właściciela (CODEOWNERS); decyzje dotyczące innych pasów mają znacznik [wspólne]; CI musi być zielone przed scaleniem.' : '',
    TEAM_HANDBOOK: multiDev ? ' W zespole: Twoja seria to R-<Twoje inicjały>-<n>; decyzje dotyczące innych pasów oznaczasz [wspólne]; pas zajmujesz `claim.sh` (`docs/workflow/zespol.md`).' : '',
  };

  // walidacja PRZED jakimkolwiek zapisem (bez połowicznej instalacji)
  if (a.mode === 'new') {
    if (existsSync(target) && readdirSync(target).filter((f) => f !== '.git').length && !opts.force) throw new Error(`${target} istnieje i nie jest pusty (--force albo inna ścieżka)`);
  } else if (!existsSync(target)) throw new Error(`brak katalogu ${target}`);
  const isRepo = existsSync(join(target, '.git'));
  if (opts.update && isRepo && !opts.force && !opts.dryRun) {
    const st = run('git', ['status', '--porcelain', '--untracked-files=no'], target);
    if (st.status !== 0) throw new Error(`git status: ${errOut(st)}`);
    if (out(st)) throw new Error(`--update: niezacommitowane zmiany śledzonych plików w ${target} — zacommituj je (commit roboczy na osobnej gałęzi), żeby aktualizację dało się przejrzeć w git diff; wymuszenie: --force\n${out(st)}`);
  }
  const hooksPlan = planHooks(target);
  const prevKitRaw = readJson(join(target, KIT_FILES));
  if (isObj(prevKitRaw)) prevKit = { kitVersion: prevKitRaw.kitVersion, files: isObj(prevKitRaw.files) ? prevKitRaw.files : {}, templates: isObj(prevKitRaw.templates) ? prevKitRaw.templates : {} };
  kitRec = { files: opts.update ? {} : { ...prevKit.files }, templates: { ...prevKit.templates } };
  const cfgPath = join(target, '.workflow/config.json');
  const prevCfg = readJson(cfgPath) ?? {};
  const prevVersion = prevKit.kitVersion ?? prevCfg.kitVersion;

  // katalog i git
  if (a.mode === 'new') {
    if (!opts.dryRun) {
      mkdirSync(target, { recursive: true });
      if (!existsSync(join(target, '.git'))) {
        const gi = run('git', ['init', '-q', '-b', 'main'], target);
        if (gi.status !== 0) throw new Error(`git init: ${errOut(gi)}`);
      }
    }
    log.steps.push(`nowe repo git: ${target}`);
  } else if (!isRepo) log.warn.push('to nie jest repo git — hooki i ruling.sh wymagają gita (git init)');

  // pliki z manifestu
  const order = ['minimum', 'standard', 'full'];
  const items = order.slice(0, order.indexOf(a.level) + 1).flatMap((l) => MANIFEST.levels[l]);
  if (multiDev) items.push(...MANIFEST.features.multiDev);
  if (a.ui) items.push(...MANIFEST.features.ui);
  if (a.discovery) items.push(...MANIFEST.features.discovery);
  if (a.secondProvider) items.push(...MANIFEST.features.secondProvider);
  const seen = new Set();
  const progressExisted = existsSync(join(target, '.workflow/progress.md'));
  for (const it of items) {
    if (seen.has(it)) continue; seen.add(it);
    const [s, d] = it.split(':');
    const src = join(KIT, s);
    if (!existsSync(src)) { log.warn.push(`brak w kicie: ${s}`); continue; }
    if (statSync(src).isDirectory()) for (const f of files(src)) copy(target, f, join(d, relative(src, f)), vars);
    else copy(target, src, d, vars);
  }

  // profil stosu (opis wzorców i poleceń; szkielet tylko dla nowego projektu)
  if (stackDir) for (const f of ['README.md', 'profile.json']) copy(target, join(stackDir, f), `.workflow/stacks/${a.stack}/${f}`);

  // router bez drugiego dostawcy (tylko świeżo zapisany routing.json — plik projektu)
  const routing = join(target, '.workflow/routing/routing.json');
  if (a.level === 'full' && !a.secondProvider && log.done.includes('.workflow/routing/routing.json')) {
    const cfg = JSON.parse(readFileSync(routing, 'utf8'));
    delete cfg.providers.other;
    for (const t of Object.values(cfg.types)) t.candidates = t.candidates.filter((c) => c.provider !== 'other');
    writeFileSync(routing, JSON.stringify(cfg, null, 2) + '\n');
    log.steps.push('router: usunięto dostawcę „other” (brak drugiego dostawcy)');
  }

  // hooki Claude Code: dołącz do .claude/settings.json (scalanie, idempotentne; własne ustawienia zespołu zostają)
  applyHooks(target, hooksPlan);

  // CLAUDE.md (sumę szablonu zapisuje pod kluczem CLAUDE.md, także gdy plik trafił do CLAUDE.workflow.md)
  const claudeTpl = join(KIT, 'CLAUDE.md.template');
  if (!opts.update) {
    const claudeRel = existsSync(join(target, 'CLAUDE.md')) && !opts.force ? 'CLAUDE.workflow.md' : 'CLAUDE.md';
    if (copy(target, claudeTpl, claudeRel, vars, { key: 'CLAUDE.md' }) && claudeRel !== 'CLAUDE.md') log.warn.push('CLAUDE.md istnieje — szablon zapisany jako CLAUDE.workflow.md; scal ręcznie');
  } else {
    const claudeRel = ['CLAUDE.workflow.md', 'CLAUDE.md'].find((f) => existsSync(join(target, f)));
    if (claudeRel) copy(target, claudeTpl, claudeRel, vars, { key: 'CLAUDE.md' });
  }

  // zespół: gitattributes, CODEOWNERS
  if (multiDev) {
    appendLines(target, '.gitattributes', readFileSync(join(KIT, '.gitattributes.workflow'), 'utf8').split('\n'));
    const shared = ['/CLAUDE.md', '/AGENTS.md', '/.claude/', '/.githooks/', '/.gitattributes', '/.workflow/bin/', '/.workflow/config.json',
      '/.workflow/rules-core.txt', '/.workflow/guard-extra.txt', '/.workflow/secrets-patterns.txt', '/.workflow/routing/routing.json',
      '/.github/', '/docs/security/', '/docs/workflow/metoda/']
      .concat(a.stack === 'typescript' ? ['/src/platform/', '/packages/contract/', '/packages/tokens/', '/packages/ui/', '/package.json', '/package-lock.json', '/tsconfig.json', '/eslint.config.mjs'] : [])
      .concat(a.stack === 'python' ? [`/src/${pyPkg}/platform/`, '/pyproject.toml'] : []);
    const who = owners.length ? owners.join(' ') : '@<właściciel-albo-zespol>';
    if (!owners.length && !existsSync(join(target, '.github/CODEOWNERS'))) log.warn.push('CODEOWNERS bez właścicieli — uzupełnij .github/CODEOWNERS');
    write(target, '.github/CODEOWNERS', '# Części wspólne: zmiana tylko zadaniem S<n> z akceptacją właściciela (CodingAgentsWorkflow).\n'
      + '# Włącz w ochronie gałęzi main: „Require review from Code Owners”.\n' + shared.map((p) => `${p.padEnd(34)} ${who}`).join('\n') + '\n');
  }
  if (a.ci === 'github') {
    const yml = fill(readFileSync(join(KIT, 'ci/github/bramki.yml'), 'utf8'), {
      STACK: a.stack,
      SETUP_STEPS: (profile?.ciSetup ?? ['      # TODO: kroki instalacji narzędzi stosu']).join('\n'),
      GATE_STEPS: (profile?.ciGate ?? ['      - run: echo "TODO: polecenia bramki (typecheck, lint, testy)"']).join('\n'),
    });
    install(target, '.github/workflows/bramki.yml', yml, { templateHash: sha(yml) });
  }
  if (a.ci === 'github' || multiDev) copy(target, join(KIT, 'ci/github/pull_request_template.md'), '.github/pull_request_template.md');

  // szkielet nowego projektu
  if (a.mode === 'new') {
    if (stackDir) for (const f of files(join(stackDir, 'scaffold'))) {
      const rel = relative(join(stackDir, 'scaffold'), f).replace('__PKG__', pyPkg);
      write(target, rel, fill(readFileSync(f, 'utf8'), vars));
    }
    write(target, 'docs/specs/.gitkeep', '');
    write(target, 'docs/plans/.gitkeep', '');
    if (a.discovery) write(target, 'research/README.md', '# Research\n\nZacznij od `.workflow/templates/discovery/0-kontekst-wlasny.md` → `research/0-kontekst-wlasny.md`. Surowe dane: `research/raw/` (do analizy tylko pola wyciągnięte skryptem). Dane osobowe i transkrypcje: tylko w repo prywatnym albo poza repo.\n');
    write(target, 'README.md', `# ${a.name}\n\n${a.description}\n\n## Jak pracujemy\nProjekt jest prowadzony procesem CodingAgentsWorkflow (${a.level}, zespół: ${a.team}, stos: ${a.stack}).\n- Zasady dla agentów i ludzi: [CLAUDE.md](CLAUDE.md)\n- Nowy deweloper: \`.workflow/bin/dev-setup.sh\`\n- Decyzje: [.workflow/progress.md](.workflow/progress.md) · Lekcje: [docs/workflow/lekcje.md](docs/workflow/lekcje.md)\n`
      + (profile ? `\n## Polecenia\n\`\`\`bash\n${profile.commands.install}\n${profile.commands.gate}\n\`\`\`\n` : ''));
  }
  appendLines(target, '.gitignore', ['.worktrees/', '.workflow/runs/', '.env', '.env.*', '!.env.example']
    .concat(a.stack === 'typescript' ? ['node_modules/'] : a.stack === 'python' ? ['__pycache__/', '.venv/', '*.egg-info/', '.mypy_cache/', '.ruff_cache/', '.pytest_cache/'] : []));

  // przestarzałe pliki frameworka: były w poprzedniej instalacji, nie ma ich w obecnym manifeście (nie usuwa)
  if (opts.update) for (const rel of Object.keys(prevKit.files)) {
    if (kitRec.files[rel] || !existsSync(join(target, rel))) continue;
    kitRec.files[rel] = prevKit.files[rel];
    log.obsolete.push(rel);
  }

  // konfiguracja (wspólna dla zespołu: bez inicjałów — te są w git config workflow.author)
  const changed = log.done.length + log.kitNewWritten;
  const versionChanged = prevVersion !== KIT_VERSION;
  const updated = opts.update && (changed || versionChanged) ? new Date().toISOString().slice(0, 10) : prevCfg.updated;
  const config = { kit: 'CodingAgentsWorkflow', kitVersion: KIT_VERSION, created: prevCfg.created ?? new Date().toISOString().slice(0, 10), updated, ...a, mode: opts.update ? (prevCfg.mode ?? a.mode) : a.mode, multiDev, path: undefined, installDeps: undefined, commit: undefined, lockfile: undefined, author: undefined };
  const cfgText = JSON.stringify(config, null, 2) + '\n';
  if (!existsSync(cfgPath) || readFileSync(cfgPath, 'utf8') !== cfgText) put(target, '.workflow/config.json', cfgText);
  const kitText = JSON.stringify({ kit: 'CodingAgentsWorkflow', kitVersion: KIT_VERSION, files: sortKeys(kitRec.files), templates: sortKeys(kitRec.templates) }, null, 2) + '\n';
  const kitPath = join(target, KIT_FILES);
  if (!existsSync(kitPath) || readFileSync(kitPath, 'utf8') !== kitText) put(target, KIT_FILES, kitText, { quiet: true });

  if (opts.dryRun) return opts.update ? reportUpdate(a, target, prevVersion) : report(a, target);

  if (opts.update) {
    if ((changed || versionChanged) && existsSync(join(target, '.workflow/bin/ruling.sh'))) {
      const what = `Aktualizacja CodingAgentsWorkflow ${prevVersion ?? '?'} → ${KIT_VERSION}: ${changed} plików`
        + (log.localNew.length + log.templNew.length ? `, ${log.localNew.length + log.templNew.length} do scalenia (*.kit-new)` : '');
      const rr = run('bash', [join(target, '.workflow/bin/ruling.sh'), what, 'nowa wersja metody, skryptów i szablonów',
        'niski — pliki projektu (manifest userOwned) i pliki zmienione lokalnie bez zmian; zmiany widać w git diff'], target);
      if (rr.status === 0) log.steps.push(`ledger: ${out(rr)} (aktualizacja)`); else log.warn.push(`ruling.sh: ${errOut(rr)}`);
    }
    return reportUpdate(a, target, prevVersion);
  }

  // TypeScript: lockfile od pierwszego commitu (CI używa npm ci i cache npm tylko z lockfile)
  if (a.mode === 'new' && a.stack === 'typescript' && !a.installDeps && a.lockfile !== false && !existsSync(join(target, 'package-lock.json'))) {
    const r = run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], target, { timeout: 180000 });
    if (r.status === 0 && existsSync(join(target, 'package-lock.json'))) log.steps.push('package-lock.json (npm install --package-lock-only --ignore-scripts)');
    else log.warn.push('package-lock.json nie powstał (npm niedostępny albo brak sieci) — uruchom npm install i zacommituj package-lock.json; do tego czasu CI instaluje przez npm install bez cache');
  }

  // deweloper: hooki, autor, progi maszyny
  if (existsSync(join(target, '.git'))) {
    const r = run('bash', [join(target, '.workflow/bin/dev-setup.sh'), '--author', a.author, '--yes'], target);
    if (r.status === 0) {
      log.steps.push(`dev-setup: ${a.author}, hooki, progi maszyny (${cores} rdzeni, ${memGb} GB)`);
      for (const l of out(r).split('\n')) if (/^\s*! /.test(l)) log.warn.push(`dev-setup: ${l.replace(/^\s*! /, '')}`);
    } else log.warn.push(`dev-setup: ${errOut(r)}`);
    if (!progressExisted) {
      const rr = run('bash', [join(target, '.workflow/bin/ruling.sh'),
        `Proces CodingAgentsWorkflow ${KIT_VERSION}: poziom ${a.level}, zespół ${a.team}, skala ${a.scale}, stos ${a.stack}${a.ui ? ', UI' : ''}${a.discovery ? ', discovery' : ''}${a.secondProvider ? ', drugi dostawca' : ''}, CI ${a.ci}`,
        'konfiguracja z kreatora (.workflow/config.json)',
        'niski — poziom podnosi się ponownym uruchomieniem setup z innym --level'], target);
      if (rr.status === 0) log.steps.push(`ledger: ${out(rr)} (konfiguracja procesu)`);
      else log.warn.push(`ruling.sh: ${errOut(rr)}`);
    }
  }
  if (a.installDeps && profile) {
    const [cmd, ...args] = a.stack === 'typescript' ? ['npm', 'install', '--no-audit', '--no-fund'] : ['python3', '-m', 'pip', 'install', '-e', '.[dev]'];
    const r = run(cmd, args, target);
    if (r.status === 0) log.steps.push(`zależności: ${cmd} ${args.join(' ')}`);
    else log.warn.push(`instalacja zależności nie powiodła się: ${errOut(r).split('\n').slice(-3).join(' ')}`);
  }
  if (a.mode === 'new' && a.commit) {
    run('git', ['add', '-A'], target);
    const r = run('git', ['commit', '-q', '-m', `chore: start projektu ${a.name} (CodingAgentsWorkflow ${KIT_VERSION}, ${a.level})`], target);
    if (r.status === 0) log.steps.push('pierwszy commit w nowym repo (lokalnie, bez push)');
    else log.warn.push(`commit: ${errOut(r)}`);
  }
  return report(a, target);
}

function printCommon() {
  if (log.steps.length) { console.log('Kroki:'); log.steps.forEach((x) => console.log(`  ✓ ${x}`)); }
  if (log.warn.length) { console.log('Uwagi:'); log.warn.forEach((x) => console.log(`  ! ${x}`)); }
}

function report(a, target) {
  const multiDev = a.team !== 'solo';
  console.log(`\nCodingAgentsWorkflow → ${target}  (tryb: ${a.mode}, poziom: ${a.level}, zespół: ${a.team}, stos: ${a.stack}${opts.dryRun ? ', DRY-RUN' : ''})\n`);
  console.log(`Zainstalowane / zaplanowane (${log.done.length}):`); log.done.forEach((x) => console.log(`  ${x}`));
  if (log.skipped.length) { console.log(`Pominięte, bo istnieją (${log.skipped.length}):`); log.skipped.forEach((x) => console.log(`  ${x}`)); }
  if (log.same) console.log(`Bez zmian (identyczne z kitem): ${log.same}`);
  printCommon();
  const next = [
    'Uzupełnij CLAUDE.md: Global Constraints (5–12), Review Focus (3–5 scenariuszy), definicja ukończenia.',
    'Dopisz wzorce własnych sekretów (prefiksy tokenów, nazwy zmiennych) do .workflow/secrets-patterns.txt i uruchom .workflow/bin/check-secrets.sh raz.',
    'Wypełnij skan przed startem w .workflow/skan-przed-startem.md; pierwszy spec: .workflow/templates/spec.md → docs/specs/.',
  ];
  if (a.level !== 'minimum') next.push('Uzupełnij podręcznik orkiestratora (§0 usługi, §7 zasady produktu) i przewodnik bezpieczeństwa (aktywa, granice zaufania).');
  if (multiDev) next.push('Zespół: zacommituj i wypchnij; każdy deweloper po sklonowaniu: .workflow/bin/dev-setup.sh; ochrona main: wymagany check „bramki / wynik” + Code Owners; pasy: .workflow/bin/claim.sh <pas>.');
  if (a.level === 'full') next.push('Router: dopasuj modele i koszty w .workflow/routing/routing.json (node .workflow/routing/route.mjs --list).');
  console.log('\nNastępne kroki:'); next.forEach((x, i) => console.log(`  ${i + 1}. ${x}`));
}

function reportUpdate(a, target, prevVersion) {
  console.log(`\nCodingAgentsWorkflow --update → ${target}  (wersja: ${prevVersion ?? '?'} → ${KIT_VERSION}, poziom: ${a.level}${opts.dryRun ? ', DRY-RUN' : ''})\n`);
  console.log(`Zaktualizowane / dodane (${log.done.length}):`); log.done.forEach((x) => console.log(`  ${x}`));
  console.log(`Bez zmian: ${log.same} plików frameworka; pliki projektu nieruszone: ${log.skipped.length}`);
  if (log.localNew.length) { console.log(`Zmienione lokalnie — zostawione, nowa wersja w <plik>.kit-new (${log.localNew.length}):`); log.localNew.forEach((x) => console.log(`  ${x} → ${x}.kit-new`)); }
  if (log.templNew.length) { console.log(`Nowsza wersja szablonu pliku projektu (${log.templNew.length}):`); log.templNew.forEach((x) => console.log(`  nowsza wersja szablonu: ${x}.kit-new, porównaj z ${x}`)); }
  if (log.obsolete.length) { console.log(`Przestarzałe — nie ma ich w kicie, usuń ręcznie (${log.obsolete.length}):`); log.obsolete.forEach((x) => console.log(`  ${x}`)); }
  printCommon();
  const todo = [];
  if (log.localNew.length || log.templNew.length) todo.push('scal zmiany z plików *.kit-new do plików obok i usuń *.kit-new');
  if (log.obsolete.length) todo.push('usuń przestarzałe pliki (git rm)');
  if (log.done.length || todo.length) todo.push('przejrzyj git diff i zacommituj aktualizację');
  console.log(todo.length ? `\nDo zrobienia: ${todo.join('; ')}.` : '\nFramework aktualny — nic do zrobienia.');
}

main().catch((e) => { console.error(`setup: ${e.message}`); process.exit(2); });
