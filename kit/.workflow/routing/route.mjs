#!/usr/bin/env node
// route.mjs — router wykonawców. Wybiera wykonawcę (agenta / model dostawcy z effortem) dla typu zadania
// na podstawie kolejności kandydatów, limitów dostawców i karty wyników. Bez zależności (Node ≥ 18).
//
//   node route.mjs <typ> [worktree brief nazwa]     → wybór + gotowe polecenie (kod 3: wszyscy kandydaci zablokowani)
//   node route.mjs --list                           → typy zadań
//   node route.mjs --status                         → limity i podsumowanie karty
//   node route.mjs --record <typ> <wykonawca> <rundy> <przepuszczone> [zadanie] [uwaga] [trudność 1–3]
//       wykonawca = klucz kandydata, np. claude:implementer albo other:model-x:high (patrz --list)
//       rundy = liczba rund poprawek po pierwszej recenzji
//       przepuszczone = ustalenia (P1/P2), które recenzja tego zadania przepuściła, a wyszły później (dla recenzentów)
//   node route.mjs --rebalance                      → przebudowa kolejności według karty (dziennik routing-changes.md)
//   node route.mjs --limit <dostawca> normal|tight|blocked [reset ISO] [uwaga]
//       stan limitu dostawcy; tight/blocked wygasa sam po czasie resetu; reset tylko jako data ISO (inaczej kod 2)
//
// Pliki obok skryptu: routing.json (konfiguracja), scorecard.jsonl (karta), limits.json (stany limitów),
// routing-changes.md (dziennik zmian kolejności). Katalog można nadpisać zmienną ROUTING_DIR (testy).
import { readFileSync, appendFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = process.env.ROUTING_DIR ?? dirname(fileURLToPath(import.meta.url));
const CFG = join(here, 'routing.json');
const CARD = join(here, 'scorecard.jsonl');
const LIMITS = join(here, 'limits.json');
const CHANGES = join(here, 'routing-changes.md');

const cfg = JSON.parse(readFileSync(CFG, 'utf8'));
const th = {
  window: 3, avgRoundsAbove: 2, missedAbove: 1, qualityWindow: 5, exploreEvery: 5, costWeight: 0.15, minHistory: 2,
  ...(cfg.thresholds ?? {}),
};
const EFFORT = { low: 0.8, medium: 1, high: 1.4, xhigh: 1.8, ...(cfg.effortFactor ?? {}) };

export const key = (c) => [c.provider, c.agent ?? c.model, c.effort].filter(Boolean).join(':') || 'none';
const isNone = (c) => c.provider === 'none';
const card = () => (existsSync(CARD) ? readFileSync(CARD, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const cost = (c) => (isNone(c) ? 0 : (cfg.cost?.[c.agent ?? c.model] ?? 3) * (EFFORT[c.effort] ?? 1));

// Stan limitu dostawcy; tight/blocked wygasa sam po resecie (limit ma datę resetu — po niej wracamy do normalnej pracy).
function limitState(provider) {
  const all = existsSync(LIMITS) ? JSON.parse(readFileSync(LIMITS, 'utf8')) : {};
  const s = all[provider] ?? { state: 'normal' };
  if (s.state !== 'normal' && s.reset && Date.parse(s.reset) <= Date.now()) return { ...s, state: 'normal', note: `wygasło (reset ${s.reset})` };
  return s;
}

// Jakość (mniej = lepiej): średnia z ostatnich N zadań (rundy + 2 × przepuszczone) × 2 / trudność.
// Runda na trudnym zadaniu waży mniej niż na łatwym — bez tego drogi model na trudnych zadaniach wypada gorzej niż tani na łatwych.
export function quality(type, k, rows = card(), n = th.qualityWindow) {
  let r = rows.filter((x) => x.type === type && x.exec === k).slice(-n);
  // Brak historii dla tego effortu → historia tego samego modelu z innym effortem (słabszy dowód, ale lepszy niż żaden).
  if (!r.length && k.split(':').length === 3) {
    const prefix = k.split(':').slice(0, 2).join(':') + ':';
    r = rows.filter((x) => x.type === type && x.exec.startsWith(prefix)).slice(-n);
  }
  if (!r.length) return null;
  return { n: r.length, q: r.reduce((s, x) => s + (x.rounds + 2 * (x.missed || 0)) * 2 / (x.diff || 2), 0) / r.length };
}

// Degradacja: w ostatnich `window` zadaniach typu średnio > avgRoundsAbove rund albo > missedAbove przepuszczonych.
export function weak(type, k, rows = card()) {
  const r = rows.filter((x) => x.type === type && x.exec === k).slice(-th.window);
  if (r.length < 2) return null;
  const avg = r.reduce((s, x) => s + x.rounds, 0) / r.length;
  const missed = r.reduce((s, x) => s + (x.missed || 0), 0);
  if (avg > th.avgRoundsAbove) return `średnio ${avg.toFixed(1)} rund w ostatnich ${r.length}`;
  if (missed > th.missedAbove) return `${missed} przepuszczonych ustaleń w ostatnich ${r.length}`;
  return null;
}

export function choose(type, { rows = card(), limit = limitState, critical = false } = {}) {
  const t = cfg.types[type];
  if (!t) throw new Error(`nieznany typ „${type}” (node route.mjs --list)`);
  const why = [];
  const done = rows.filter((x) => x.type === type).length;
  // Próbkowanie: co N-te zadanie typu dostaje kandydat bez historii — ale nie przy ustaleniach krytycznych.
  const fresh = t.candidates.find((c) => !isNone(c) && !quality(type, key(c), rows));
  const explore = fresh && !critical && done > 0 && done % th.exploreEvery === th.exploreEvery - 1;
  if (explore) why.push(`próbkowanie: kandydat bez historii ${key(fresh)} dostaje to zadanie (co ${th.exploreEvery}.)`);
  const order = explore ? [fresh, ...t.candidates.filter((c) => c !== fresh)] : t.candidates;
  const last = t.candidates.at(-1);
  for (const c of order) {
    const k = key(c);
    if (!isNone(c)) {
      const l = limit(c.provider);
      if (l.state === 'blocked') { why.push(`${k}: dostawca ${c.provider} zablokowany do ${l.reset ?? '?'}`); continue; }
      if (l.state === 'tight' && c.expensive && t.candidates.length > 1) { why.push(`${k}: dostawca ${c.provider} ograniczony — drogi model tylko, gdy jedyny`); continue; }
    }
    const w = weak(type, k, rows);
    if (w && c !== last) { why.push(`${k}: słaby wynik (${w})`); continue; }
    return { type, pick: c, key: k, why };
  }
  // Nikt nie przeszedł warunków: ostatni z listy — chyba że jego dostawca jest zablokowany; wtedy ostatni niezablokowany.
  const usable = [...t.candidates].reverse().find((c) => isNone(c) || limit(c.provider).state !== 'blocked');
  if (!usable) return { type, pick: null, key: null, blocked: true, why: [...why, 'wszyscy kandydaci zablokowani'] };
  return { type, pick: usable, key: key(usable), why: [...why, `żaden kandydat nie spełnia warunków — ${usable === last ? 'ostatni z listy' : 'ostatni niezablokowany'}`] };
}

export function rebalance(rows = card()) {
  const changes = [];
  for (const [type, t] of Object.entries(cfg.types)) {
    const before = t.candidates.map(key);
    const scored = t.candidates.map((c, i) => ({ c, i, qs: quality(type, key(c), rows) }));
    const known = scored.filter((x) => x.qs && x.qs.n >= th.minHistory && !isNone(x.c));
    if (known.length < 2) continue;
    known.sort((a, b) => (a.qs.q + th.costWeight * cost(a.c)) - (b.qs.q + th.costWeight * cost(b.c)));
    // Posortowani wracają na te same pozycje, które zajmowali — kandydaci bez historii nie zmieniają miejsca.
    const slots = known.map((x) => x.i).sort((a, b) => a - b);
    const next = [...t.candidates];
    slots.forEach((slot, j) => { next[slot] = known[j].c; });
    const after = next.map(key);
    if (after.join() !== before.join()) {
      t.candidates = next;
      changes.push(`- ${new Date().toISOString().slice(0, 16)} ${type}: ${before.join(' > ')} → ${after.join(' > ')} (`
        + known.map((x) => `${key(x.c)} q=${x.qs.q.toFixed(2)} n=${x.qs.n} koszt=${cost(x.c).toFixed(1)}`).join('; ') + ')');
    }
  }
  return changes;
}

// Cytowanie dla powłoki: wartości ze spacjami albo znakami specjalnymi w '…' (placeholdery <…> zostają bez zmian).
export const shq = (v) => (v === '' || /^[\w./:@%+=,<>-]+$/.test(v) ? v : `'${v.replaceAll("'", "'\\''")}'`);

export function command(r, wt = '<worktree>', brief = '<brief.md>', name = '<nazwa>') {
  const c = r.pick;
  if (isNone(c)) return c.note ?? '(bez modelu)';
  const tpl = cfg.providers?.[c.provider]?.command;
  if (!tpl) return `(brak szablonu polecenia dla dostawcy ${c.provider} w routing.json)`;
  const v = { agent: c.agent ?? '', model: c.model ?? '', effort: c.effort ?? '', mode: c.mode ?? '', worktree: wt, brief, name };
  return tpl.replace(/\{(agent|model|effort|mode|worktree|brief|name)\}/g, (_, k) => shq(v[k]));
}

// Data resetu limitu: ISO 8601 (RRRR-MM-DD albo RRRR-MM-DDTGG:MM[:SS][Z|±GG:MM]).
export const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s) && !Number.isNaN(Date.parse(s));

function main(argv) {
  const [cmd, ...a] = argv;
  if (!cmd || cmd === '--list') {
    for (const [k, v] of Object.entries(cfg.types)) console.log(`${k.padEnd(20)} ${v.description}\n${' '.repeat(21)}${v.candidates.map(key).join(' > ')}`);
  } else if (cmd === '--status') {
    for (const p of Object.keys(cfg.providers ?? {})) {
      const l = limitState(p);
      console.log(`${p}: ${l.state}${l.reset ? `, reset ${l.reset}` : ''}${l.note ? ` — ${l.note}` : ''}`);
    }
    const by = {};
    for (const r of card()) (by[`${r.type} ${r.exec}`] ??= []).push(r);
    for (const [k, rs] of Object.entries(by)) {
      console.log(`${k.padEnd(52)} n=${rs.length} rundy śr. ${(rs.reduce((s, r) => s + r.rounds, 0) / rs.length).toFixed(1)} przepuszczone ${rs.reduce((s, r) => s + (r.missed || 0), 0)}`);
    }
  } else if (cmd === '--record') {
    const [type, exec, rounds, missed, task = '', note = '', diff = '2'] = a;
    if (!cfg.types[type]) throw new Error(`nieznany typ „${type}”`);
    if ([rounds, missed, diff].some((x) => Number.isNaN(Number(x)))) throw new Error('rundy, przepuszczone i trudność muszą być liczbami');
    appendFileSync(CARD, JSON.stringify({ at: new Date().toISOString(), type, exec, rounds: Number(rounds), missed: Number(missed), task, note, diff: Number(diff) }) + '\n');
    console.log('zapisano');
  } else if (cmd === '--rebalance') {
    const changes = rebalance();
    if (changes.length) {
      writeFileSync(CFG, JSON.stringify(cfg, null, 2) + '\n');
      appendFileSync(CHANGES, changes.join('\n') + '\n');
      console.log(changes.join('\n'));
      console.log('→ zapisz zmianę kolejności w ledgerze jako ruling');
    } else console.log('bez zmian kolejności');
  } else if (cmd === '--limit') {
    const [provider, state, reset, ...note] = a;
    if (!['normal', 'tight', 'blocked'].includes(state)) throw new Error('stan: normal|tight|blocked');
    if (reset && !isIsoDate(reset)) throw new Error(`reset „${reset}” nie jest datą ISO (np. 2026-01-31T18:00Z); uwagę podaj po dacie`);
    const all = existsSync(LIMITS) ? JSON.parse(readFileSync(LIMITS, 'utf8')) : {};
    all[provider] = { state, reset: reset || null, note: note.join(' ') || null, at: new Date().toISOString() };
    writeFileSync(LIMITS, JSON.stringify(all, null, 1) + '\n');
    console.log(`${provider}: ${state}`);
  } else {
    const critical = a.includes('--critical');
    const rest = a.filter((x) => x !== '--critical');
    const r = choose(cmd, { critical });
    console.log(`${r.type} → ${r.key ?? 'brak wykonawcy'}`);
    for (const w of r.why) console.log(`  pominięto: ${w}`);
    if (r.blocked) {
      console.log('  wszyscy kandydaci zablokowani — czekaj na reset limitu (node route.mjs --status) albo zmień stan: --limit <dostawca> normal');
      process.exitCode = 3;
      return;
    }
    console.log(`  ${command(r, ...rest)}`);
  }
}

// Uruchomiony jako skrypt (nie import w testach). realpath: na macOS /var → /private/var.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(2); }
}
