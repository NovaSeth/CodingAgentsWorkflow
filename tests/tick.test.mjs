// Testy tick.mjs: stan .workflow/ → następne kroki orkiestratora i decyzja AKCJA / CZEKAJ / KONIEC.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, cpSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TICK = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit/.workflow/bin/tick.mjs');
const T0 = Date.parse('2026-10-13T10:00:00Z');
const METODA = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');
function project({ ledger = '', tasks = {}, runs = {}, plan, plans = {}, metoda = false, config, claude, author, files = {} } = {}) {
  const d = mkdtempSync(join(tmpdir(), 'tick-'));
  mkdirSync(join(d, '.workflow/tasks'), { recursive: true });
  if (author !== undefined) { git(d, 'init', '-q'); if (author) git(d, 'config', 'workflow.author', author); }
  if (config) writeFileSync(join(d, '.workflow/config.json'), JSON.stringify(config));
  if (claude) writeFileSync(join(d, 'CLAUDE.md'), claude);
  for (const [f, c] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), c); }
  if (metoda) { mkdirSync(join(d, 'docs/workflow'), { recursive: true }); cpSync(METODA, join(d, 'docs/workflow/metoda'), { recursive: true }); }
  writeFileSync(join(d, '.workflow/progress.md'), `# Ledger\n${ledger}\n`);
  for (const [id, files] of Object.entries(tasks)) {
    mkdirSync(join(d, '.workflow/tasks', id), { recursive: true });
    let i = 0;
    for (const [f, c] of Object.entries(files)) {
      const p = join(d, '.workflow/tasks', id, f); writeFileSync(p, c);
      const t = (T0 + (i++) * 60000) / 1000; utimesSync(p, t, t); // kolejność plików = kolejność zdarzeń
    }
  }
  if (Object.keys(runs).length) mkdirSync(join(d, '.workflow/runs'), { recursive: true });
  for (const [f, [c, ageMin]] of Object.entries(runs)) {
    const p = join(d, '.workflow/runs', f); writeFileSync(p, c);
    const t = (T0 - ageMin * 60000) / 1000; utimesSync(p, t, t);
  }
  if (plan) plans = { 'plan.md': plan, ...plans };
  for (const [f, c] of Object.entries(plans)) { mkdirSync(join(d, 'docs/plans'), { recursive: true }); writeFileSync(join(d, 'docs/plans', f), c); }
  return d;
}
// Izolacja od globalnej konfiguracji gita (workflow.author dewelopera uruchamiającego testy).
const GITENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
function git(d, ...a) { const r = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8', env: { ...process.env, ...GITENV } }); assert.equal(r.status, 0, r.stderr); return r.stdout; }
const tick = (d, nowMin = 5, ...a) => spawnSync('node', [TICK, ...a], { encoding: 'utf8', env: { ...process.env, ...GITENV, WORKFLOW_ROOT: d, TICK_NOW_MS: String(T0 + nowMin * 60000) } });
// Znacznik ledgera „@ RRRR-MM-DD GG:MM” w czasie lokalnym, `min` minut po T0.
const at = (min) => { const t = new Date(T0 + min * 60000); const p = (n) => String(n).padStart(2, '0'); return `@ ${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`; };
const noAudit = (d) => tick(d, 0, '--audit-done');

test('brief niezlecony → AKCJA zleć', () => {
  const d = project({ tasks: { P1: { 'brief.md': 'x' } } }); noAudit(d);
  const r = tick(d);
  assert.equal(r.status, 0); assert.match(r.stdout, /P1 \| brief gotowy, nie zlecony \| zleć wykonawcy, zapisz: task\.sh P1 dispatched --exec <wykonawca> --base <sha>/, 'minimum: bez budget.sh');
  assert.doesNotMatch(r.stdout, /budget\.sh/);
  const s = project({ tasks: { P1: { 'brief.md': 'x' } }, files: { '.workflow/bin/budget.sh': '' } }); noAudit(s);
  assert.match(tick(s).stdout, /P1 \| brief gotowy, nie zlecony \| budget\.sh agent → zleć/, 'standard: budżet przed zleceniem');
});

test('implementer pracuje → CZEKAJ (zapas 1800 s); po progu → AKCJA prośba o status (PRC-11)', () => {
  const d = project({ ledger: 'Task P1: dispatched (BASE abc)', tasks: { P1: { 'brief.md': 'x' } } }); noAudit(d);
  let r = tick(d, 5);
  assert.equal(r.status, 3); assert.match(r.stdout, /CZEKAJ/); assert.match(r.stdout, /NASTĘPNY_TICK: 1800s/);
  r = tick(d, 45);
  assert.equal(r.status, 0); assert.match(r.stdout, /poproś o status.*PRC-11/);
});

test('raport bez recenzji → zleć recenzję; recenzja Needs fixes → plik ustaleń', () => {
  let d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'r' } } }); noAudit(d);
  assert.match(tick(d).stdout, /raport oddany \| zweryfikuj raport.*zleć recenzję/);
  d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'r', 'review-r1.md': '### Ocena\n**Needs fixes**. Brak testu.' } } }); noAudit(d);
  assert.match(tick(d).stdout, /recenzja r1: Needs fixes \| plik ustaleń findings-r1\.md/);
});

test('runda oddana → ponowna recenzja zawężona; w toku → CZEKAJ', () => {
  const files = { 'brief.md': 'x', 'review-r1.md': '### Ocena\n**Needs fixes**', 'findings-r1.md': 'f', 'report.md': 'r\n## Runda poprawek 1 (R: Important)\nnaprawione' };
  let d = project({ ledger: 'Task P1: dispatched', tasks: { P1: files } }); noAudit(d);
  assert.match(tick(d).stdout, /runda poprawek 1 oddana \| zleć ponowną recenzję zawężoną/);
  d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { ...files, 'rereview-brief.md': 'b' } } }); noAudit(d);
  const r = tick(d); assert.equal(r.status, 3); assert.match(r.stdout, /ponowna recenzja r1 w toku/);
  d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'r', 'review-r1.md': '### Ocena\nNeeds fixes', 'findings-r1.md': 'f' } } }); noAudit(d);
  assert.match(tick(d).stdout, /runda poprawek 1 w toku/);
});

test('ponowna recenzja r2 Needs fixes → wyłącznik; Approved → scal; complete w ledgerze → zadanie pominięte', () => {
  const base = { 'brief.md': 'x', 'review-r1.md': '### Ocena\nNeeds fixes', 'findings-r1.md': 'f', 'report.md': 'r', 'rereview-r1.md': '## Werdykt\n**Needs fixes**', 'findings-r2.md': 'f2' };
  let d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { ...base, 'rereview-r2.md': '## Werdykt\n**Needs fixes**' } } }); noAudit(d);
  assert.match(tick(d).stdout, /wyłącznik po 2 rundach/);
  d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { ...base, 'rereview-r2.md': '## Werdykt\n**Approved**' } } }); noAudit(d);
  assert.match(tick(d).stdout, /zaakceptowane \| bramka zadania, scal/);
  d = project({ ledger: 'Task P1: dispatched\nTask P1: complete (a..b)\nGate całość: done', tasks: { P1: { ...base, 'rereview-r2.md': '## Werdykt\n**Approved**' } }, plan: '### Zadanie P1: a\n' });
  const r = tick(d); assert.equal(r.status, 4); assert.match(r.stdout, /KONIEC/); assert.match(r.stdout, /STOP/);
});

test('werdykt nieczytelny (szablon z oboma słowami) → AKCJA przeczytaj werdykt', () => {
  const d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'r', 'review-r1.md': '### Ocena\n**Needs fixes** | **Approved**' } } }); noAudit(d);
  assert.match(tick(d).stdout, /bez czytelnego werdyktu/);
});

test('plan: kolejne zadanie → AKCJA brief.sh z planem; wszystko complete bez bramki → AKCJA bramka; z „Gate … done” → KONIEC', () => {
  const plan = '# Plan\n### Zadanie P1: a\n```\n### Zadanie X9: w bloku kodu\n```\n### Zadanie P2: b\n';
  let d = project({ ledger: 'Task P1: complete', tasks: { P1: { 'brief.md': 'x' } }, plan });
  let r = tick(d); assert.equal(r.status, 0); assert.match(r.stdout, /P2 \| następne w planie docs\/plans\/plan\.md \| bash \.workflow\/bin\/brief\.sh P2 docs\/plans\/plan\.md/);
  d = project({ ledger: 'Task P1: complete\nTask P2: complete', tasks: { P1: { 'brief.md': 'x' }, P2: { 'brief.md': 'x' } }, plan });
  r = tick(d); assert.equal(r.status, 0); assert.match(r.stdout, /brak bramki po ostatnim complete \| bramka obszaru \+ przegląd bezpieczeństwa.*PRC-9, BZP-43/);
  d = project({ ledger: '- Task P1: complete\nGate A: done by MG @ 2026-10-13 09:00\n- Task P2: complete', plan });
  assert.equal(tick(d).status, 0, 'bramka przed ostatnim complete się nie liczy');
  d = project({ ledger: 'Task P1: complete\n- Task P2: cancelled (poza zakresem)\nRelease: done by MG', plan });
  r = tick(d); assert.equal(r.status, 4, r.stdout); assert.match(r.stdout, /KONIEC/);
});

test('przebiegi w tle: EXIT → odbierz, --ack wycisza; bez EXIT świeży → CZEKAJ 600 s; stary → zastój', () => {
  const closed = { plan: '### Zadanie P1: a\n', ledger: 'Task P1: complete\nGate A: done' };
  let d = project({ ...closed, runs: { 'e2e.log': ['start\nOTHER EXIT 1\n', 1] } });
  let r = tick(d); assert.equal(r.status, 0); assert.match(r.stdout, /e2e\.log \| zakończony, kod 1/);
  tick(d, 5, '--ack'); r = tick(d); assert.equal(r.status, 4, r.stdout);
  d = project({ ...closed, runs: { 'testy.log': ['krok 3/10\n', 1] } }); noAudit(d);
  r = tick(d, 2); assert.equal(r.status, 3); assert.match(r.stdout, /NASTĘPNY_TICK: 600s/);
  r = tick(d, 30); assert.equal(r.status, 0); assert.match(r.stdout, /brak EXIT, log bez zmian/);
});

test('audyt: przy pracy w toku i braku audytu → krok PRC-13; --audit-done go zdejmuje', () => {
  const d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x' } } });
  assert.match(tick(d).stdout, /PRC-13/);
  tick(d, 5, '--audit-done');
  const r = tick(d); assert.doesNotMatch(r.stdout, /PRC-13/); assert.equal(r.status, 3);
});

test('--json: struktura do użycia maszynowego', () => {
  const d = project({ tasks: { P1: { 'brief.md': 'x' } } });
  const j = JSON.parse(tick(d, 5, '--json').stdout);
  assert.equal(j.tick, 'AKCJA'); assert.ok(j.rows.some((r) => r.id === 'P1'));
});

test('przypomnienie: pod tabelą pełna treść reguł tylko dla kroków AKCJA; --no-rules wyłącza', () => {
  const d = project({ metoda: true, ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'r', 'review-r1.md': '### Ocena\n**Needs fixes**' } } }); noAudit(d);
  const r = tick(d);
  assert.match(r.stdout, /Reguły dla kroków tego ticku:/);
  assert.match(r.stdout, /^\*\*REV-13\.\*\* .*plik/m);
  assert.doesNotMatch(r.stdout, /^\*\*KOD-/m, 'tylko reguły kroków tego ticku');
  assert.doesNotMatch(tick(d, 5, '--no-rules').stdout, /Reguły dla kroków/);
});

const RULES = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit/.workflow/bin/rules.mjs');
test('rules.mjs: treść po ID, nieznane ID → kod 1, --core z pliku projektu (ID + linie własne)', () => {
  const d = project({ metoda: true });
  const env = { ...process.env, WORKFLOW_ROOT: d };
  let r = spawnSync('node', [RULES, 'KOD-28', 'REV-17'], { encoding: 'utf8', env });
  assert.equal(r.status, 0); assert.match(r.stdout, /^\*\*KOD-28\.\*\*/m); assert.match(r.stdout, /^\*\*REV-17\.\*\*/m);
  r = spawnSync('node', [RULES, 'XYZ-1'], { encoding: 'utf8', env });
  assert.equal(r.status, 1); assert.match(r.stdout, /XYZ-1: brak w metodzie/);
  writeFileSync(join(d, '.workflow/rules-core.txt'), '# komentarz\nZAS-6\nNie deployujemy w piątki.\n');
  r = spawnSync('node', [RULES, '--core'], { encoding: 'utf8', env });
  assert.equal(r.status, 0); assert.match(r.stdout, /^\*\*ZAS-6\.\*\*/m); assert.match(r.stdout, /^- Nie deployujemy w piątki\./m);
});

// --- zespół, sygnały z ledgera, nazwy briefów, werdykt, plan, start ---
const TEAM = { config: { multiDev: true }, author: 'AA' };
function claim(d, lane, who) {
  git(d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', `claim ${lane} by ${who} 2026-10-13 — opis`);
  git(d, 'update-ref', `refs/remotes/origin/claim/${lane}`, 'HEAD');
}

test('zespół: AKCJA tylko dla zadań moich i niczyich; cudze (ledger „by”, brief „Orkiestrator:”, claim pasa) w „Inni (informacyjnie)”', () => {
  const d = project({ ...TEAM,
    ledger: `Task A1: dispatched (BASE a) — impl by AA pas front ${at(0)}\n- Task B1: dispatched (BASE b) — impl by BB pas api ${at(-90)}`,
    tasks: { A1: { 'brief.md': 'x' }, B1: { 'brief.md': 'x' }, C1: { 'brief.md': 'x' }, D1: { 'brief.md': '# D\n- Orkiestrator: BB\n' }, E1: { 'brief.md': '# E\n- Pas: lane-x\n' } } });
  claim(d, 'lane-x', 'CC'); noAudit(d);
  const r = tick(d); const [main, inni = ''] = r.stdout.split('Inni (informacyjnie):');
  assert.equal(r.status, 0);
  assert.match(main, /C1 \| brief gotowy, nie zlecony/);
  assert.match(main, /A1 \| implementer pracuje/);
  for (const id of ['B1', 'D1', 'E1']) { assert.doesNotMatch(main, new RegExp(`\\| ${id} \\|`)); assert.match(inni, new RegExp(`\\| ${id} \\|.*\\| — \\| — \\|`)); }
  assert.match(inni, /B1 \| BB: implementer pracuje \[pas api\]/);
  assert.doesNotMatch(r.stdout, /B1.*poproś o status/, 'nie proś o status cudzego agenta');
  assert.match(inni, /E1 \| CC: brief gotowy/);
  const solo = project({ ledger: `Task B1: dispatched — impl by BB ${at(-90)}`, tasks: { B1: { 'brief.md': 'x' } }, author: 'AA' }); noAudit(solo);
  assert.match(tick(solo).stdout, /B1 \| implementer pracuje .*poproś o status/, 'bez multiDev „by” nie zmienia akcji');
});

test('zespół: wpis bez „by” = wspólne; brak workflow.author → AKCJA dev-setup; niezacommitowany developers.txt → AKCJA', () => {
  let d = project({ ...TEAM, ledger: 'Task S1: dispatched (BASE a) — impl', tasks: { S1: { 'brief.md': 'x', 'report.md': 'r' } } }); noAudit(d);
  assert.match(tick(d).stdout, /S1 \| raport oddany/);
  d = project({ config: { multiDev: true }, author: '', files: { '.workflow/developers.txt': 'AA Ala <a@a> 2026-10-13\n' } }); noAudit(d);
  const r = tick(d);
  assert.match(r.stdout, /tryb zespołowy bez workflow\.author \| bash \.workflow\/bin\/dev-setup\.sh.*ZES-16/);
  assert.match(r.stdout, /developers\.txt niezacommitowany \| zacommituj \.workflow\/developers\.txt \(gałąź \+ PR\) \| ZES-32/);
});

test('sygnały z ledgera: runda oddana z „fix round k/…” albo sekcji raportu (nie z mtime); wiek od „@”, status-request wycisza prośbę', () => {
  const base = { 'brief.md': 'x', 'review-r1.md': '### Ocena\n**Needs fixes**', 'findings-r1.md': 'f', 'report.md': 'r' };
  let d = project({ ledger: 'Task P1: dispatched', tasks: { P1: base } }); noAudit(d);
  assert.match(tick(d).stdout, /runda poprawek 1 w toku/, 'nowszy mtime raportu nie oznacza oddania rundy');
  d = project({ ledger: 'Task P1: dispatched\n- Task P1: fix round 1/2 (2 addressed, 0 open) by AA', tasks: { P1: base } }); noAudit(d);
  assert.match(tick(d).stdout, /runda poprawek 1 oddana \| zleć ponowną recenzję/);
  d = project({ ledger: `Task P1: dispatched (BASE a) — impl ${at(-60)}`, tasks: { P1: { 'brief.md': 'x' } } }); noAudit(d);
  let r = tick(d, 5); assert.equal(r.status, 0); assert.match(r.stdout, /65 min od ostatniego wpisu w ledgerze.*poproś o status.*status-request/);
  d = project({ ledger: `Task P1: dispatched (BASE a) — impl ${at(-60)}\nTask P1: status-request by AA ${at(0)}`, tasks: { P1: { 'brief.md': 'x' } } }); noAudit(d);
  r = tick(d, 5); assert.equal(r.status, 3, 'prośba wysłana — nie powtarzaj przed progiem');
  assert.equal(tick(d, 30).status, 0, 'po kolejnym progu prośba wraca');
});

test('nazwy briefów recenzji: konwencja review-r<k>-brief.md / rereview-r<k>-brief.md i warianty', () => {
  for (const f of ['review-r1-brief.md', 'review-brief.md', 'recenzja-brief.md', 'review-r1.brief.md']) {
    const d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'r', [f]: 'b' } } }); noAudit(d);
    assert.match(tick(d).stdout, /recenzja w toku/, f);
  }
  const files = { 'brief.md': 'x', 'review-r1.md': '### Ocena\n**Needs fixes**', 'findings-r1.md': 'f', 'report.md': 'r\n## Runda poprawek 1\nok' };
  for (const f of ['rereview-r1-brief.md', 'rereview-brief.md', 'rereview-r1.brief.md']) {
    const d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { ...files, [f]: 'b' } } }); noAudit(d);
    assert.match(tick(d).stdout, /ponowna recenzja r1 w toku/, f);
  }
  const d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { ...files, 'rereview-r2-brief.md': 'b' } } }); noAudit(d);
  assert.match(tick(d).stdout, /runda poprawek 1 oddana/, 'brief innej rundy się nie liczy');
});

test('werdykt: tylko pogrubione **Approved** / **Needs fixes** w sekcji Ocena; zaprzeczenia → nieczytelny, nigdy zaakceptowane', () => {
  const v = (review) => { const d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'r', 'review-r1.md': review } } }); noAudit(d); return tick(d).stdout; };
  for (const bad of ['### Ocena\n**Not Approved**', '### Ocena\nnot **Approved**', '### Ocena\nApproved', '### Ocena\nNot approved — **Approved** po poprawkach', '### Problemy\n**Approved**\n### Ocena\nbrak']) {
    const out = v(bad); assert.match(out, /bez czytelnego werdyktu/, bad); assert.doesNotMatch(out, /zaakceptowane/, bad);
  }
  assert.match(v('### Ocena\n**Approved**. Nie znalazłem problemów.\n### Kontekst\nNeeds fixes w innym zadaniu'), /zaakceptowane/);
});

test('raport BLOCKED / NEEDS_CONTEXT → AKCJA ORK-24 zamiast recenzji; po „implementer …” i ponownym dispatched → czekaj', () => {
  let d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': '# Raport\nStatus: NEEDS_CONTEXT\nbrak kontraktu' } } }); noAudit(d);
  let r = tick(d); assert.match(r.stdout, /raport: NEEDS_CONTEXT \| rozstrzygnij brak\/blokadę \(ORK-24\), nie zlecaj recenzji/); assert.doesNotMatch(r.stdout, /zleć recenzję/);
  d = project({ ledger: 'Task P1: dispatched\nTask P1: implementer NEEDS_CONTEXT (a1)\nTask P1: dispatched (BASE b)', tasks: { P1: { 'brief.md': 'x', 'report.md': 'Status: NEEDS_CONTEXT' } } }); noAudit(d);
  r = tick(d); assert.equal(r.status, 3); assert.match(r.stdout, /implementer pracuje po rozstrzygnięciu/);
  d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { 'brief.md': 'x', 'report.md': 'Status: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED\n…\nStatus: DONE' } } }); noAudit(d);
  assert.match(tick(d).stdout, /raport oddany/);
});

test('ledger: blocked → „Zablokowane” bez AKCJA; cancelled pomijane; self-verified r<k> zastępuje ponowną recenzję', () => {
  const plan = '### Zadanie P1: a\n### Zadanie P2: b\n';
  let d = project({ plan, ledger: 'Task P1: dispatched\n- Task P1: blocked (czeka na klucz API) by AA\nTask P2: cancelled (poza zakresem)', tasks: { P1: { 'brief.md': 'x' }, P2: { 'brief.md': 'x' } } }); noAudit(d);
  let r = tick(d, 90); assert.equal(r.status, 3, r.stdout); assert.match(r.stdout, /Zablokowane \(informacyjnie\):[\s\S]*P1 \| zablokowane: czeka na klucz API/);
  assert.doesNotMatch(r.stdout, /P2/);
  d = project({ ledger: 'Task P1: dispatched\nTask P1: blocked (x)\nTask P1: dispatched (BASE c)', tasks: { P1: { 'brief.md': 'x' } } }); noAudit(d);
  assert.match(tick(d).stdout, /P1 \| implementer pracuje/, 'ponowne dispatched odblokowuje');
  const files = { 'brief.md': 'x', 'review-r1.md': '### Ocena\n**Needs fixes**', 'findings-r1.md': 'f', 'report.md': 'r\n## Runda poprawek 1\nok' };
  d = project({ ledger: 'Task P1: dispatched\nTask P1: self-verified r1 by AA', tasks: { P1: files } }); noAudit(d);
  assert.match(tick(d).stdout, /zweryfikowana samodzielnie.*\| bramka zadania, scal/);
});

test('Critical w sekcji problemów ponownej recenzji → bez wyłącznika, runda z --critical (REV-24); pusty nagłówek Critical się nie liczy', () => {
  const base = { 'brief.md': 'x', 'review-r1.md': '### Ocena\n**Needs fixes**', 'findings-r1.md': 'f', 'report.md': 'r', 'rereview-r1.md': '## Werdykt\n**Needs fixes**', 'findings-r2.md': 'f2' };
  const rr = (problems) => `## Nowe problemy w diffie rundy\n${problems}\n## Werdykt\n**Needs fixes**`;
  let d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { ...base, 'rereview-r2.md': rr('**Critical**\n- a.ts:3 sekret w logu\n**Important**\n- …') } } }); noAudit(d);
  let r = tick(d); assert.match(r.stdout, /Needs fixes, Critical \| Critical nie podlega wyłącznikowi.*--critical \| REV-24/); assert.doesNotMatch(r.stdout, /wyłącznik po 2 rundach/);
  d = project({ ledger: 'Task P1: dispatched', tasks: { P1: { ...base, 'rereview-r2.md': rr('**Critical**\n- …\n**Important**\n- b.ts:9 brak testu') } } }); noAudit(d);
  assert.match(tick(d).stdout, /wyłącznik po 2 rundach/);
});

test('--plan: ścieżka bezwzględna działa, nieistniejący plan → kod 2', () => {
  const d = project({ plans: { 'x.md': '### Zadanie Q1: a\n' } });
  let r = tick(d, 5, '--plan', join(d, 'docs/plans/x.md')); assert.equal(r.status, 0); assert.match(r.stdout, /Q1 \| następne w planie/);
  r = tick(d, 5, '--plan', 'docs/plans/x.md'); assert.match(r.stdout, /Q1 \| następne w planie/);
  r = tick(d, 5, '--plan', '/nie/ma/planu.md'); assert.equal(r.status, 2); assert.match(r.stderr, /brak planu \/nie\/ma\/planu\.md/);
});

test('plany bez --plan: zespół → plan moich pasów (claim/* lokalnie albo „pas” moich zadań); niejednoznaczne → wszystkie, nie najnowszy', () => {
  const plans = { 'plan-api.md': '### Zadanie API1: a\n', 'plan-front.md': '### Zadanie FR1: a\n' };
  let d = project({ ...TEAM, plans }); claim(d, 'api', 'AA'); claim(d, 'front', 'BB'); noAudit(d);
  let r = tick(d); assert.match(r.stdout, /API1 \| następne w planie docs\/plans\/plan-api\.md/); assert.doesNotMatch(r.stdout, /FR1/);
  d = project({ ...TEAM, plans, ledger: `Task X1: dispatched — impl by AA pas front ${at(0)}`, tasks: { X1: { 'brief.md': 'x' } } }); noAudit(d);
  r = tick(d); assert.match(r.stdout, /następne w planie: FR1 \(docs\/plans\/plan-front\.md\)/); assert.doesNotMatch(r.stdout, /API1/);
  d = project({ plans }); noAudit(d);
  r = tick(d); assert.match(r.stdout, /API1 \| następne w planie/); assert.match(r.stdout, /FR1 \| następne w planie/);
});

test('świeży projekt → AKCJA START (nie KONIEC); CLAUDE.md z placeholderami → AKCJA WDR-6', () => {
  let d = project();
  let r = tick(d); assert.equal(r.status, 0); assert.match(r.stdout, /START \| brak specu\/planu \| napisz spec \(`docs\/workflow\/metoda\/04-spec-i-plan\.md` §Procedura\)/); assert.doesNotMatch(r.stdout, /KONIEC/);
  d = project({ claude: '# P\n<Jedno zdanie: co to za projekt.>\n- Środowisko / build: <lokalnie / chmura / telemetria>.\n', plan: '### Zadanie P1: a\n', ledger: 'Task P1: complete\nGate A: done' });
  r = tick(d); assert.equal(r.status, 0); assert.match(r.stdout, /CLAUDE\.md z placeholderami \| uzupełnij CLAUDE\.md \(Global Constraints, Review Focus\) \| WDR-6/);
  // istniejący projekt: szablon w CLAUDE.workflow.md czeka na scalenie (WDR-16), KONIEC niemożliwy
  d = project({ claude: '# Mój projekt\n', plan: '### Zadanie P1: a\n', ledger: 'Task P1: complete\nGate A: done' });
  writeFileSync(join(d, 'CLAUDE.workflow.md'), '# szablon\n<Jedno zdanie: co to za projekt.>\n');
  r = tick(d); assert.equal(r.status, 0); assert.match(r.stdout, /CLAUDE\.workflow\.md nie scalony \| .* \| WDR-16/);
});

test('ID reguł w tick.mjs istnieją w docs/', () => {
  const src = readFileSync(TICK, 'utf8');
  const docs = readdirSync(METODA).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(METODA, f), 'utf8')).join('\n');
  const ids = [...new Set([...src.matchAll(/regula: [`'"]([^`'"]+)/g)].flatMap((m) => m[1].match(/[A-Z]{3}-\d+/g) ?? []))];
  assert.ok(ids.length > 20);
  for (const id of ids) assert.match(docs, new RegExp(`^\\*\\*${id}\\.\\*\\*`, 'm'), id);
});
