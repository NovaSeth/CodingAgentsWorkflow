#!/usr/bin/env node
// tick.mjs — stan projektu → następne kroki orkiestratora. Jeden tick pętli = uruchom ten skrypt i wykonaj wskazane kroki.
// Prompt wybudzenia pętli jest stały („node .workflow/bin/tick.mjs i wykonaj kroki”); sytuację wylicza ten skrypt ze stanu,
// więc wybudzenie nigdy się nie przeterminuje.
//
//   node .workflow/bin/tick.mjs [--plan <plan.md>] [--json] [--no-rules]
//     --plan: ścieżka względna (od katalogu projektu) albo bezwzględna; brak pliku → kod 2
//     pod tabelą: pełna treść reguł (z docs/workflow/metoda/) tylko dla kroków AKCJA tego ticku
//   node .workflow/bin/tick.mjs --ack          → oznacz zakończone przebiegi w .workflow/runs/ jako odebrane
//   node .workflow/bin/tick.mjs --audit-done   → zapisz, że audyt tablicy / „żywy następny krok” został zrobiony
//
// Wyjście: tabela „zadanie → stan → następny krok → reguła”, sekcje informacyjne (Zablokowane, Inni), następne zadania
// z planu i linia NASTĘPNY_TICK. Kod: 0 AKCJA (zrób kroki teraz) · 3 CZEKAJ (praca trwa) · 4 KONIEC (zatrzymaj pętlę) · 2 błąd.
// Zmienne: STATUS_MIN (próg prośby o status, domyślnie 20), STALL_MIN (zastój przebiegu, 10), AUDIT_HOURS (3),
// WAIT_AGENTS_S (1800), WAIT_RUNS_S (600), WORKFLOW_REMOTE (origin — tylko lokalne refy claim/*, bez sieci).
//
// Ledger (.workflow/progress.md, sekcja Postęp; wpis może zaczynać się od „- ”; „by”, „pas”, „@” opcjonalne):
//   Task <id>: dispatched (BASE <sha>) — <wykonawca> by <AUTOR> pas <pas> @ RRRR-MM-DD GG:MM
//   Task <id>: implementer DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED (<sha>)
//   Task <id>: blocked (<co odblokuje>) by <AUTOR> @ …      → nieaktywne do kolejnego dispatched / fix round / complete
//   Task <id>: cancelled (<powód>) by <AUTOR> @ …           → pomijane; nie blokuje KONIEC
//   Task <id>: status-request by <AUTOR> @ …                → próg prośby o status liczony od tego wpisu
//   Task <id>: fix round <k>/2 (<a> addressed, <o> open) by <AUTOR> @ …   → runda k oddana
//   Task <id>: self-verified r<k> by <AUTOR> @ …            → samoweryfikacja (REV-18) zastępuje ponowną recenzję rundy k
//   Task <id>: complete (<opis>) by <AUTOR> @ …
//   Gate <obszar>: done by <AUTOR> @ …  ·  Release: done by <AUTOR> @ …   → KONIEC wymaga takiego wpisu po ostatnim complete
// Wiek zadania = od najnowszego „@ RRRR-MM-DD GG:MM” (czas lokalny) jego wpisów; bez znacznika — z mtime plików (lokalnie).
//
// Zespół („multiDev”: true w .workflow/config.json; ja = git config workflow.author): AKCJA tylko dla zadań moich albo
// niczyich. Właściciel = „by” z ostatniego dispatched → „- Orkiestrator: <AUTOR>” w brief.md → autor claim/<pas>
// (pas z „pas” w ledgerze albo „- Pas: <pas>” w brief.md). Cudze zadania → sekcja „Inni (informacyjnie)”, bez akcji.
//
// Pliki zadania (.workflow/tasks/<id>/): brief.md → report.md (sekcje „## Runda poprawek <k>”) → review-r<k>.md →
// findings-r<k>.md → rereview-r<k>.md. Briefy recenzji — konwencja: review-r<k>-brief.md i rereview-r<k>-brief.md.
// Akceptowane warianty: review-brief.md, recenzja-brief.md, recenzja-r<k>-brief.md, rereview-brief.md (= runda 1),
// separator „.brief.md” zamiast „-brief.md”.
// Werdykt: wyłącznie pogrubione **Approved** / **Needs fixes** w ostatniej sekcji „Ocena”/„Werdykt”; oba, żaden albo
// zaprzeczenie („Not Approved”, „nie **Approved**”) → nieczytelny.
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRules, idsIn } from './rules.mjs';

const ROOT = process.env.WORKFLOW_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = join(ROOT, '.workflow');
const TASKS = join(W, 'tasks');
const RUNS = join(W, 'runs');
const STATE = join(RUNS, '.tick-state.json');
const NOW = Number(process.env.TICK_NOW_MS ?? Date.now());
const STATUS_MIN = Number(process.env.STATUS_MIN ?? 20);
const STALL_MIN = Number(process.env.STALL_MIN ?? 10);
const AUDIT_H = Number(process.env.AUDIT_HOURS ?? 3);
const WAIT_AGENTS = Number(process.env.WAIT_AGENTS_S ?? 1800);
const WAIT_RUNS = Number(process.env.WAIT_RUNS_S ?? 600);
const REMOTE = process.env.WORKFLOW_REMOTE ?? 'origin';
const ROUTER = existsSync(join(W, 'routing', 'route.mjs'));

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
const mtime = (p) => statSync(p).mtimeMs;
const minutes = (ms) => Math.round((NOW - ms) / 60000);
const state = () => { try { return JSON.parse(read(STATE) || '{}'); } catch { return {}; } };
const saveState = (s) => { mkdirSync(RUNS, { recursive: true }); writeFileSync(STATE, JSON.stringify(s, null, 1) + '\n'); };
const git = (...a) => { const r = spawnSync('git', ['-C', ROOT, ...a], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.trim() : null; };
const rel = (p) => relative(ROOT, p) || p;

if (!existsSync(W)) { console.error('tick: brak katalogu .workflow — uruchom w projekcie'); process.exit(2); }

// --- przebiegi w tle (.workflow/runs/*.log) ---
function runs() {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS).filter((f) => f.endsWith('.log')).map((f) => {
    const p = join(RUNS, f); const text = read(p);
    const m = [...text.matchAll(/\bEXIT[ =:]+(-?\d+)/g)].at(-1);
    return { name: f, mtime: mtime(p), exit: m ? Number(m[1]) : null };
  });
}
if (flag('--ack')) {
  const s = state(); s.seen = s.seen ?? {};
  for (const r of runs()) if (r.exit !== null) s.seen[r.name] = r.mtime;
  saveState(s); console.log('tick: zakończone przebiegi oznaczone jako odebrane'); process.exit(0);
}
if (flag('--audit-done')) { const s = state(); s.lastAudit = NOW; saveState(s); console.log('tick: audyt zapisany'); process.exit(0); }

let planArg = null;
if (flag('--plan')) {
  const v = opt('--plan');
  planArg = v && !v.startsWith('--') ? resolve(ROOT, v) : null;
  if (!planArg || !existsSync(planArg)) { console.error(`tick: brak planu ${v ?? '(nie podano ścieżki)'} — podaj istniejący plik (względem ${ROOT} albo bezwzględnie)`); process.exit(2); }
}

// --- tryb zespołowy ---
const config = (() => { try { return JSON.parse(read(join(W, 'config.json')) || '{}'); } catch { return {}; } })();
const MULTI = config.multiDev === true;
const ME = (git('config', 'workflow.author') ?? '').toUpperCase() || null;
const AUTHOR = /\bby ([A-Z]{2,4}\d?)\b/;
const claimOwner = {}; // pas → AUTOR z lokalnych refów refs/remotes/<remote>/claim/* (bez sieci)
for (const line of (git('for-each-ref', '--format=%(refname)\t%(subject)', `refs/remotes/${REMOTE}/claim/`) ?? '').split('\n')) {
  const m = line.match(/^refs\/remotes\/[^/]+\/claim\/(\S+)\tclaim \S+ by (\S+)/);
  if (m) claimOwner[m[1]] = m[2].toUpperCase();
}

// --- ledger ---
const ledgerRaw = read(join(W, 'progress.md')).replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ''));
const ledgerTasks = {};
const led = (id) => (ledgerTasks[id] ??= { dispatched: false, complete: false, cancelled: false, blocked: null, owner: null, pas: null,
  fixRounds: new Set(), selfVerified: new Set(), lastAt: null, lastDispatch: -1, lastImplBlock: -1 });
const stamp = (s) => { const m = s.match(/@\s*(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : null; };
let lastComplete = -1, lastGate = -1;
ledgerRaw.split('\n').forEach((line, i) => {
  if (/^\s*(?:[-*]\s+)?(?:Gate [^:]+|Release):\s*done\b/.test(line)) { lastGate = i; return; }
  const m = line.match(/^\s*(?:[-*]\s+)?Task ([^\s:]+):\s+(.+?)\s*$/);
  if (!m) return;
  const t = led(m[1]); const e = m[2];
  const at = stamp(e); if (at !== null && (t.lastAt === null || at > t.lastAt)) t.lastAt = at;
  if (/^(dispatched|fix round|self-verified|complete|unblocked)\b/.test(e)) t.blocked = null;
  if (/^dispatched\b/.test(e)) {
    t.dispatched = true; t.lastDispatch = i;
    t.owner = e.match(AUTHOR)?.[1] ?? t.owner; t.pas = e.match(/\bpas ([\w./-]+)/)?.[1] ?? t.pas;
  } else if (/^complete\b/.test(e)) { t.complete = true; lastComplete = i; }
  else if (/^cancelled\b/.test(e)) t.cancelled = true;
  else if (/^blocked\b/.test(e)) t.blocked = e.match(/^blocked\s*\(([^)]*)\)/)?.[1] || 'bez opisu';
  else if (/^implementer (NEEDS_CONTEXT|BLOCKED)\b/.test(e)) t.lastImplBlock = i;
  else if (/^fix round (\d+)\//.test(e)) t.fixRounds.add(Number(e.match(/^fix round (\d+)/)[1]));
  else if (/^self-verified r(\d+)/.test(e)) t.selfVerified.add(Number(e.match(/^self-verified r(\d+)/)[1]));
});
const done = (id) => ledgerTasks[id]?.complete || ledgerTasks[id]?.cancelled;

// --- treść plików zadania ---
function verdict(p) {
  const lines = read(p).split('\n');
  let start = -1;
  lines.forEach((l, i) => { if (/^#{1,4} .*(Ocena|Werdykt)/i.test(l)) start = i; });
  if (start < 0) return 'nieczytelny';
  let end = lines.findIndex((l, i) => i > start && /^#{1,4} /.test(l)); if (end < 0) end = lines.length;
  const sec = lines.slice(start + 1, end).join('\n');
  const found = new Set([...sec.matchAll(/\*\*(Approved|Needs fixes)\*\*/g)].map((m) => m[1]));
  if (found.size !== 1) return 'nieczytelny';
  if (/\b(not|non|un|dis)[\s-]*approved\b/i.test(sec) || /\b(not|nie|no|never|nigdy)\s*[:-]?\s*\*\*(Approved|Needs fixes)\*\*/i.test(sec)) return 'nieczytelny';
  return [...found][0];
}
function hasCritical(p) { // treść pod „Critical” w sekcji Problemy (sam pusty nagłówek się nie liczy) albo Critical NOT ADDRESSED
  let inProb = false, inCrit = false;
  for (const l of read(p).split('\n')) {
    if (/^#{1,4} /.test(l)) { inProb = /problem/i.test(l); inCrit = false; continue; }
    if (/NOT ADDRESSED/.test(l) && /\bcritical\b/i.test(l)) return true;
    if (!inProb) continue;
    if (/^\s*\*\*[^*]+\*\*\s*:?\s*$/.test(l)) { inCrit = /critical/i.test(l); continue; }
    const body = l.replace(/^\s*[-*]\s*/, '').trim();
    if (!body || /^(…|\.\.\.|<[^>]*>|brak\.?|nie ma\.?|none\.?|n\/a|—|-)$/i.test(body)) continue;
    if (inCrit || /\bcritical\b/i.test(body)) return true;
  }
  return false;
}
const reportStatus = (s) => [...s.matchAll(/^[\s>*_-]*Status[*_]*\s*:[*_\s]*([A-Z_]+)[*_\s.]*$/gm)].map((m) => m[1]).at(-1) ?? null;
const BRIEF = /^(review|recenzja|rereview)(?:-r(\d+))?[-.]brief\.md$/;

// --- zadania (.workflow/tasks/<id>/) ---
const rows = []; // moje: {id, stan, krok, regula, typ: 'akcja'|'czekaj-agent'|'czekaj-tlo'}
const others = []; const blocked = [];
const newest = (dir) => Math.max(...readdirSync(dir).map((f) => mtime(join(dir, f))));
const round = (files, prefix) => Math.max(0, ...files.map((f) => (f.match(new RegExp(`^${prefix}-r(\\d+)\\.md$`)) ?? [])[1]).filter(Boolean).map(Number));
const ids = existsSync(TASKS) ? readdirSync(TASKS).filter((d) => statSync(join(TASKS, d)).isDirectory()).sort() : [];
const myLanes = new Set(Object.entries(claimOwner).filter(([, a]) => ME && a === ME).map(([l]) => l));
const label = (owner, pas) => [owner && `by ${owner}`, pas && `pas ${pas}`].filter(Boolean).join(', ');

function assess(id, dir, files, L, mine) {
  const has = (f) => files.includes(f);
  const fromLedger = L.lastAt !== null;
  const age = minutes(fromLedger ? L.lastAt : newest(dir));
  const working = (stan, prog) => (mine && age >= STATUS_MIN
    ? { stan: `${stan} (${age} min ${fromLedger ? 'od ostatniego wpisu w ledgerze' : 'bez zmian w plikach'})`, krok: `poproś o status w 5 liniach, zweryfikuj w gicie, procesach i logach; zapisz: task.sh ${id} status-request`, regula: 'PRC-11', typ: 'akcja' }
    : { stan, krok: 'czekaj (powiadomienie o końcu agenta jest głównym sygnałem)', regula: prog, typ: 'czekaj-agent' });
  const approved = (stan = 'zaakceptowane') => ({ stan, krok: `bramka zadania, scal (PR albo merge --no-ff bez remote), zapisz: task.sh ${id} complete "<PR, SHA na main>"${ROUTER ? ', route.mjs --record' : ''}, tablica`, regula: 'REV-32, REV-33, PRC-8', typ: 'akcja' });

  if (!has('report.md')) {
    if (!L.dispatched) return { stan: 'brief gotowy, nie zlecony', krok: `${existsSync(join(W, 'bin', 'budget.sh')) ? 'budget.sh agent → ' : ''}zleć wykonawcy, zapisz: task.sh ${id} dispatched --exec <wykonawca> --base <sha>${MULTI ? ' --pas <pas>' : ''}`, regula: 'RES-3, ORK-10, ORK-17', typ: 'akcja' };
    return working('implementer pracuje', 'ORK-5');
  }
  const report = read(join(dir, 'report.md'));
  const status = reportStatus(report);
  if (status === 'BLOCKED' || status === 'NEEDS_CONTEXT') {
    if (L.lastImplBlock >= 0 && L.lastDispatch > L.lastImplBlock) return working(`implementer pracuje po rozstrzygnięciu ${status}`, 'ORK-5');
    return { stan: `raport: ${status}`, krok: `rozstrzygnij brak/blokadę (ORK-24), nie zlecaj recenzji; zapisz: task.sh ${id} implementer ${status}, po rozstrzygnięciu ponowne task.sh ${id} dispatched --exec <wykonawca> --base <sha>${MULTI ? ' --pas <pas>' : ''}`, regula: 'ORK-24', typ: 'akcja' };
  }
  const kF = round(files, 'findings'), kRR = round(files, 'rereview'), kR = round(files, 'review');
  const briefs = files.map((f) => f.match(BRIEF)).filter(Boolean);
  if (kRR > 0 && kRR >= kF) {
    const p = join(dir, `rereview-r${kRR}.md`); const v = verdict(p);
    if (v === 'Approved') return approved();
    if (v === 'Needs fixes' && hasCritical(p)) return { stan: `ponowna recenzja r${kRR}: Needs fixes, Critical`, krok: `Critical nie podlega wyłącznikowi: findings-r${kRR + 1}.md → kolejna runda z route.mjs … --critical`, regula: 'REV-24, REV-13', typ: 'akcja' };
    if (v === 'Needs fixes' && kRR >= 2) return { stan: `ponowna recenzja r${kRR}: Needs fixes`, krok: 'wyłącznik po 2 rundach: rozstrzygnij sam (ruling), Minor na listę odroczonych', regula: 'REV-23, REV-25', typ: 'akcja' };
    if (v === 'Needs fixes') return { stan: `ponowna recenzja r${kRR}: Needs fixes`, krok: `plik ustaleń findings-r${kRR + 1}.md → runda poprawek`, regula: 'REV-13, REV-15', typ: 'akcja' };
    return { stan: `rereview-r${kRR}.md bez czytelnego werdyktu`, krok: 'przeczytaj §Werdykt i zapisz go w ledgerze', regula: 'REV-10', typ: 'akcja' };
  }
  if (kF > 0) {
    if (L.selfVerified.has(kF)) return approved(`runda ${kF} zweryfikowana samodzielnie (self-verified r${kF})`);
    const delivered = L.fixRounds.has(kF) || new RegExp(`^#{1,4}\\s*Runda poprawek ${kF}\\b`, 'm').test(report);
    const rrBrief = briefs.some((m) => m[1] === 'rereview' && (Number(m[2] ?? 1) === kF));
    if (delivered && !rrBrief) return { stan: `runda poprawek ${kF} oddana`, krok: `zleć ponowną recenzję zawężoną (diff rundy → rereview-r${kF}.diff, szablon rereview.md, brief rereview-r${kF}-brief.md); poprawki tylko mechaniczne/UI → samoweryfikacja i task.sh ${id} self-verified --round ${kF}`, regula: 'REV-17, REV-18, REV-20', typ: 'akcja' };
    if (delivered) return working(`ponowna recenzja r${kF} w toku`, 'REV-17');
    return working(`runda poprawek ${kF} w toku`, 'REV-17');
  }
  if (kR > 0) {
    const p = join(dir, `review-r${kR}.md`); const v = verdict(p);
    if (v === 'Approved') return approved();
    if (v === 'Needs fixes') return { stan: `recenzja r${kR}: Needs fixes${hasCritical(p) ? ', Critical' : ''}`, krok: `plik ustaleń findings-r${kR}.md → runda poprawek${hasCritical(p) ? ' (route.mjs … --critical)' : ''}`, regula: hasCritical(p) ? 'REV-13, REV-15, REV-24' : 'REV-13, REV-15', typ: 'akcja' };
    return { stan: `review-r${kR}.md bez czytelnego werdyktu`, krok: 'przeczytaj §Ocena i zapisz werdykt w ledgerze', regula: 'REV-10', typ: 'akcja' };
  }
  if (briefs.some((m) => m[1] !== 'rereview')) return working('recenzja w toku', 'REV-3');
  return { stan: 'raport oddany', krok: 'zweryfikuj raport (PRC-12), zleć recenzję innemu wykonawcy (szablon recenzja-brief.md → review-r1-brief.md)', regula: 'PRC-12, REV-3, REV-4', typ: 'akcja' };
}

for (const id of ids) {
  const dir = join(TASKS, id);
  const files = readdirSync(dir);
  const L = led(id);
  if (L.complete || L.cancelled || !files.includes('brief.md')) continue;
  const brief = read(join(dir, 'brief.md'));
  const pas = L.pas ?? brief.match(/^\s*(?:[-*]\s+)?Pas:\s*([\w./-]+)/m)?.[1] ?? null;
  const owner = L.owner ?? brief.match(/^\s*(?:[-*]\s+)?Orkiestrator:\s*([A-Za-z]{2,4}\d?)\b/m)?.[1]?.toUpperCase() ?? (pas && claimOwner[pas]) ?? null;
  const mine = !MULTI || !owner || owner === ME;
  if (MULTI && owner && owner === ME && pas) myLanes.add(pas);
  const who = MULTI ? label(owner, pas) : '';
  if (L.blocked) { blocked.push({ id, stan: `zablokowane: ${L.blocked}${who ? ` [${who}]` : ''}`, krok: '—', regula: '—', typ: 'zablokowane' }); continue; }
  const r = { id, ...assess(id, dir, files, L, mine) };
  if (mine) rows.push(r); else others.push({ id, stan: `${owner}: ${r.stan}${pas ? ` [pas ${pas}]` : ''}`, krok: '—', regula: '—', typ: 'inni' });
}
// cudze zadania z ledgera bez lokalnego katalogu (np. przed pull)
if (MULTI) for (const [id, L] of Object.entries(ledgerTasks)) {
  if (ids.includes(id) || !L.dispatched || done(id) || !L.owner || L.owner === ME) continue;
  others.push({ id, stan: `${L.owner}: zlecone, brak katalogu zadania lokalnie${L.pas ? ` [pas ${L.pas}]` : ''}`, krok: '—', regula: '—', typ: 'inni' });
}

// --- przebiegi w tle ---
const st = state(); const seen = st.seen ?? {};
const runRows = [];
for (const r of runs()) {
  if (r.exit !== null) { if (seen[r.name] !== r.mtime) runRows.push({ id: r.name, stan: `zakończony, kod ${r.exit}`, krok: 'odbierz wynik (kod i liczba wyników), potem tick.mjs --ack', regula: 'PRC-12, PRC-17', typ: 'akcja' }); }
  else if (minutes(r.mtime) >= STALL_MIN) runRows.push({ id: r.name, stan: `brak EXIT, log bez zmian ${minutes(r.mtime)} min`, krok: 'sprawdź proces: żyje? potomkowie? zastój → przerwij i ponów', regula: 'RES-35, RES-36', typ: 'akcja' });
  else runRows.push({ id: r.name, stan: 'w toku', krok: 'czekaj', regula: '—', typ: 'czekaj-tlo' });
}

// --- plan(y) ---
// Wybór: --plan → (zespół) plany z nazwą moich pasów → plan z nagłówka ledgera „# Ledger — plan: <ścieżka>” → wszystkie.
const plansDir = join(ROOT, 'docs', 'plans');
const allPlans = existsSync(plansDir) ? readdirSync(plansDir).filter((f) => f.endsWith('.md')).sort().map((f) => join(plansDir, f)) : [];
const headerPlan = ledgerRaw.match(/^# Ledger — plan: (.+?)\s*$/m)?.[1];
let plans = allPlans; let ambiguous = allPlans.length > 1;
if (planArg) { plans = [planArg]; ambiguous = false; }
else if (MULTI && myLanes.size && allPlans.some((p) => [...myLanes].some((l) => basename(p).includes(l)))) {
  plans = allPlans.filter((p) => [...myLanes].some((l) => basename(p).includes(l))); ambiguous = false;
} else if (headerPlan && existsSync(resolve(ROOT, headerPlan)) && allPlans.length > 1) { plans = [resolve(ROOT, headerPlan)]; ambiguous = false; }
const planIdsOf = (p) => {
  let fence = false; const out = [];
  for (const line of read(p).split('\n')) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && line.match(/^### (?:Zadanie|Task) ([^:\s]+)/);
    if (m) out.push(m[1]);
  }
  return out;
};
const nextPlans = []; const openPlanIds = []; let planDone = plans.length > 0;
for (const p of plans) {
  const pids = planIdsOf(p);
  for (const id of pids) if (!done(id)) { planDone = false; openPlanIds.push(id); }
  const id = pids.find((x) => !ids.includes(x) && !done(x) && !ledgerTasks[x]?.dispatched);
  if (id) nextPlans.push({ id, plan: rel(p) });
}

// --- kroki projektu ---
const extra = [];
if (MULTI && !ME) extra.push({ id: '—', stan: 'tryb zespołowy bez workflow.author', krok: 'bash .workflow/bin/dev-setup.sh (ustawia inicjały); do tego czasu wszystkie zadania z „by” są cudze', regula: 'ZES-16', typ: 'akcja' });
if (MULTI && existsSync(join(W, 'developers.txt')) && git('status', '--porcelain', '--', '.workflow/developers.txt')) extra.push({ id: '—', stan: 'developers.txt niezacommitowany', krok: 'zacommituj .workflow/developers.txt (gałąź + PR)', regula: 'ZES-32', typ: 'akcja' });
if (existsSync(join(ROOT, 'CLAUDE.workflow.md'))) extra.push({ id: '—', stan: 'CLAUDE.workflow.md nie scalony', krok: 'scal sekcje CLAUDE.workflow.md do CLAUDE.md i usuń CLAUDE.workflow.md w tym samym commicie', regula: 'WDR-16', typ: 'akcja' });
else if (/<Jedno zdanie|<lokalnie \/ chmura/.test(read(join(ROOT, 'CLAUDE.md')))) extra.push({ id: '—', stan: 'CLAUDE.md z placeholderami', krok: 'uzupełnij CLAUDE.md (Global Constraints, Review Focus)', regula: 'WDR-6', typ: 'akcja' });

const active = rows.length + blocked.length + runRows.filter((r) => r.typ !== 'akcja').length;
const auditDue = active > 0 && (!st.lastAudit || (NOW - st.lastAudit) / 3600000 >= AUDIT_H);
if (auditDue) extra.push({ id: '—', stan: `audyt ${st.lastAudit ? `${Math.round((NOW - st.lastAudit) / 3600000)} h temu` : 'nie był robiony'}`, krok: 'audyt: każde zadanie w toku ma żywy następny krok; tablica = git = ledger; potem tick.mjs --audit-done', regula: 'PRC-13, PRC-17', typ: 'akcja' });
const claimHint = MULTI && ambiguous ? ' (zespół: najpierw zajmij pas planu — claim.sh <pas>)' : '';
if (!rows.length) for (const n of nextPlans) extra.push({ id: n.id, stan: `następne w planie ${n.plan}`, krok: `bash .workflow/bin/brief.sh ${n.id} ${n.plan} → uzupełnij brief → zleć${claimHint}`, regula: claimHint ? 'SPC-25, ORK-17, ZES-9' : 'SPC-25, ORK-17', typ: 'akcja' });
const idle = !rows.length && !blocked.length && !others.length;
if (!plans.length && idle) extra.push({ id: 'START', stan: ids.length ? 'brak planu w docs/plans/' : 'brak specu/planu', krok: 'napisz spec (`docs/workflow/metoda/04-spec-i-plan.md` §Procedura), potem plan w docs/plans/', regula: 'SPC-1, SPC-2', typ: 'akcja' });
if (plans.length && !planDone && idle && !nextPlans.length) extra.push({ id: '—', stan: `zadania planu bez stanu: ${openPlanIds.join(', ')}`, krok: 'uzupełnij brief (brief.sh) albo zapisz: task.sh <id> cancelled "<powód>"', regula: 'SPC-25, PRC-13', typ: 'akcja' });
const gateOk = lastComplete < 0 || lastGate > lastComplete;
if (planDone && idle && !gateOk) extra.push({ id: '—', stan: 'plan zakończony, brak bramki po ostatnim complete', krok: 'bramka obszaru + przegląd bezpieczeństwa przed wydaniem; potem task.sh gate <obszar> albo task.sh release', regula: 'PRC-9, BZP-43', typ: 'akcja' });

const all = [...rows, ...runRows, ...extra];
const actions = all.filter((r) => r.typ === 'akcja');
let verdictTick, next, code;
if (actions.length) { verdictTick = 'AKCJA'; next = 'teraz — wykonaj kroki, potem uruchom tick ponownie'; code = 0; }
else if (all.some((r) => r.typ === 'czekaj-tlo')) { verdictTick = 'CZEKAJ'; next = `${WAIT_RUNS}s (przebiegi w tle bez powiadomień)`; code = 3; }
else if (all.some((r) => r.typ === 'czekaj-agent')) { verdictTick = 'CZEKAJ'; next = `${WAIT_AGENTS}s (zapas; główny sygnał to powiadomienie o końcu agenta)`; code = 3; }
else if (blocked.length || others.length) { verdictTick = 'CZEKAJ'; next = `${WAIT_AGENTS}s (${[blocked.length && 'zadania zablokowane', others.length && 'praca innych w toku'].filter(Boolean).join(', ')})`; code = 3; }
else { verdictTick = 'KONIEC'; next = 'STOP — zadania planu zamknięte, bramka zapisana; zatrzymaj pętlę, raport dla PO'; code = 4; }
if (nextPlans.length && rows.length) next += ` · wolne miejsce budżetu? następne w planie: ${nextPlans.map((n) => `${n.id} (${n.plan})`).join(', ')}`;

// Przypomnienie: pełna treść reguł tylko dla kroków AKCJA tego ticku (nie całe dokumenty).
const ruleMap = loadRules(ROOT);
const reminders = flag('--no-rules') ? [] : [...new Set(actions.flatMap((r) => idsIn(r.regula)))].map((id) => ruleMap.get(id)).filter(Boolean);

if (flag('--json')) {
  console.log(JSON.stringify({ tick: verdictTick, next, rows: all, blocked, others, nextPlan: nextPlans[0]?.id ?? null, nextPlans, me: ME, multiDev: MULTI, rules: reminders }, null, 1));
} else {
  const table = (list) => { console.log('| zadanie | stan | następny krok | reguła |\n|---|---|---|---|'); for (const r of list) console.log(`| ${r.id} | ${r.stan} | ${r.krok} | ${r.regula} |`); };
  console.log(`TICK ${new Date(NOW).toLocaleString('sv-SE').slice(0, 16)} — ${verdictTick}${actions.length ? ` (${actions.length})` : ''}${MULTI ? ` · ja: ${ME ?? '?'}` : ''}`);
  if (all.length) table(all);
  if (blocked.length) { console.log('\nZablokowane (informacyjnie):'); table(blocked); }
  if (others.length) { console.log('\nInni (informacyjnie):'); table(others); }
  if (existsSync(join(W, 'routing')) && actions.some((r) => /scal/.test(r.krok))) console.log('Po zapisie wyników: node .workflow/routing/route.mjs --rebalance (zmiana kolejności = ruling, PRC-14).');
  if (reminders.length) { console.log('\nReguły dla kroków tego ticku:'); for (const r of reminders) console.log(r); }
  console.log(`NASTĘPNY_TICK: ${next}`);
}
process.exit(code);
