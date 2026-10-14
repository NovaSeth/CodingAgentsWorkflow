// Testy narzędzi zespołowych na repo tymczasowych: ruling.sh, check-ledger.mjs, claim.sh, dev-setup.sh, brief.sh, task.sh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync, chmodSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(root, 'kit/.workflow/bin');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 20000, ...opts });
const git = (d, ...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' }).trim();
const tmp = (p = 'caw-team-') => mkdtempSync(join(tmpdir(), p));
const SCRIPTS = ['ruling.sh', 'claim.sh', 'dev-setup.sh', 'brief.sh', 'task.sh', 'check-ledger.mjs'];

// Projekt zespołowy bez kreatora: config, ledger z szablonu kitu, skrypty w .workflow/bin, commit na main.
function project({ author = 'AA', multi = true, d = join(tmp(), 'p') } = {}) {
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  git(d, 'config', 'user.email', 't@example.com'); git(d, 'config', 'user.name', 't');
  if (author) git(d, 'config', 'workflow.author', author);
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  for (const s of SCRIPTS) { copyFileSync(join(BIN, s), join(d, '.workflow/bin', s)); chmodSync(join(d, '.workflow/bin', s), 0o755); }
  copyFileSync(join(root, 'kit/.workflow/progress.md'), join(d, '.workflow/progress.md'));
  copyFileSync(join(root, 'kit/.gitattributes.workflow'), join(d, '.gitattributes'));
  if (multi) writeFileSync(join(d, '.workflow/developers.txt'), author ? `${author} t <t@example.com> 2026-01-01\n` : '');
  writeFileSync(join(d, '.workflow/config.json'), JSON.stringify({ multiDev: multi, stack: 'inny', areas: 'koszyk,platnosci' }, null, 2) + '\n');
  git(d, 'add', '-A'); git(d, 'commit', '-qm', 'init');
  return d;
}
const sh = (d, script, args, opts = {}) => run('bash', [join(d, '.workflow/bin', script), ...args], { cwd: d, ...opts });
const ledger = (d) => readFileSync(join(d, '.workflow/progress.md'), 'utf8');

test('ruling.sh: ta sama osoba w dwóch worktree dostaje różne numery (licznik w git-common-dir)', () => {
  const d = project();
  const wt = join(dirname(d), 'wt');
  git(d, 'worktree', 'add', '-q', '-b', 'pas-b', wt);
  assert.equal(sh(d, 'ruling.sh', ['a', 'b', 'c']).stdout.trim(), 'R-AA-1');
  assert.equal(sh(wt, 'ruling.sh', ['d', 'e', 'f']).stdout.trim(), 'R-AA-2', 'drugi worktree nie widzi ledgera pierwszego, ale widzi licznik');
  assert.equal(sh(d, 'ruling.sh', ['g', 'h', 'i']).stdout.trim(), 'R-AA-3');
  assert.match(readFileSync(join(git(d, 'rev-parse', '--git-common-dir').replace(/^\.git$/, join(d, '.git')), 'workflow-ruling-seq'), 'utf8'), /^R-AA- 3$/m);
  // po scaleniu obu gałęzi — bez duplikatów
  git(d, 'commit', '-qam', 'a'); git(wt, 'commit', '-qam', 'b');
  const m = run('git', ['-C', d, 'merge', '-q', '--no-edit', 'pas-b']);
  assert.equal(m.status, 0, m.stderr);
  const ck = run('node', [join(d, '.workflow/bin/check-ledger.mjs'), d]);
  assert.equal(ck.status, 0, ck.stdout + ck.stderr);
});

test('ruling.sh: numer uwzględnia ledger z origin/main; --next nic nie zapisuje', () => {
  const d = project();
  appendFileSync(join(d, '.workflow/progress.md'), '- Ruling R-AA-7 (2026-01-01 AA): x — y — koszt błędu: z.\n');
  git(d, 'commit', '-qam', 'main ma R-AA-7');
  git(d, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(d, 'checkout', '-q', '-b', 'pas', 'HEAD~1');
  const before = ledger(d);
  assert.equal(sh(d, 'ruling.sh', ['--next']).stdout.trim(), 'R-AA-8');
  assert.equal(ledger(d), before);
  assert.equal(sh(d, 'ruling.sh', ['a', 'b', 'c']).stdout.trim(), 'R-AA-8');
});

test('ruling.sh: --kind S|SEC, --shared, brak \\n na końcu ledgera, solo bez autora', () => {
  const d = project();
  writeFileSync(join(d, '.workflow/progress.md'), '# L\n- Ruling R-AA-1 (x AA): a — b — koszt błędu: c.');
  let r = sh(d, 'ruling.sh', ['--kind', 'S', 'wspólny typ Money', '--shared']);
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), 'S-AA-1');
  assert.equal(sh(d, 'ruling.sh', ['--kind', 'SEC', 'token w logach']).stdout.trim(), 'SEC-AA-1');
  assert.equal(sh(d, 'ruling.sh', ['--kind', 'S', '--next']).stdout.trim(), 'S-AA-2');
  assert.equal(sh(d, 'ruling.sh', ['co', 'dlaczego', 'koszt', '--shared']).stdout.trim(), 'R-AA-2');
  const s = ledger(d);
  assert.match(s, /koszt błędu: c\.\n- S-AA-1 \(\d{4}-\d\d-\d\d \d\d:\d\d AA\): \[wspólne\] wspólny typ Money\n/);
  assert.match(s, /^- SEC-AA-1 \(.* AA\): token w logach$/m);
  assert.match(s, /^- Ruling R-AA-2 \(.* AA\): \[wspólne\] co — dlaczego — koszt błędu: koszt\.$/m);
  assert.equal(sh(d, 'ruling.sh', ['--kind', 'X', 'a']).status, 64);
  assert.equal(sh(d, 'ruling.sh', ['tylko', 'dwa']).status, 64);

  const solo = project({ author: '', multi: false });
  assert.equal(sh(solo, 'ruling.sh', ['a', 'b', 'c']).stdout.trim(), 'R1');
  assert.equal(sh(solo, 'ruling.sh', ['--kind', 'SEC', 'x']).stdout.trim(), 'SEC-1');
  assert.equal(sh(solo, 'ruling.sh', ['--kind', 'S', 'x']).stdout.trim(), 'S1');
  assert.equal(sh(solo, 'ruling.sh', ['a', 'b', 'c']).stdout.trim(), 'R2');
});

test('check-ledger.mjs: duplikaty ID i inicjałów → 1, czysto → 0, brak plików → 2', () => {
  const d = project();
  const ck = () => run('node', [join(d, '.workflow/bin/check-ledger.mjs'), d]);
  writeFileSync(join(d, '.workflow/developers.txt'), 'AA Ala <a@example.com> 2026-01-01\nAA Ala <a@example.com> 2026-01-01\n');
  sh(d, 'ruling.sh', ['a', 'b', 'c']);
  appendFileSync(join(d, '.workflow/progress.md'), '- Ruling R-AA-2 (x AA): cytat R-AA-1 (korekta R-AA-1) w treści się nie liczy — b — koszt błędu: c.\n');
  let r = ck();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  appendFileSync(join(d, '.workflow/progress.md'), '- Ruling R-AA-1 (x AA): duplikat — z gałęzi — koszt błędu: x.\n- S-AA-1 (x AA): a\n- S-AA-1 (y AA): b\n');
  r = ck();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /duplikat ID R-AA-1/); assert.match(r.stdout, /duplikat ID S-AA-1/);
  writeFileSync(join(d, '.workflow/progress.md'), '# L\n');
  appendFileSync(join(d, '.workflow/developers.txt'), 'AA Adam <adam@example.com> 2026-01-02\n');
  r = ck();
  assert.equal(r.status, 1);
  assert.match(r.stdout, /duplikat inicjałów AA.*a@example\.com, adam@example\.com/);
  run('rm', [join(d, '.workflow/developers.txt')]);
  assert.equal(ck().status, 2, 'zespół bez developers.txt');
  assert.equal(run('node', [join(d, '.workflow/bin/check-ledger.mjs'), tmp()]).status, 2, 'brak ledgera');
});

test('claim.sh: już twój → 0, cudzy → 1, błąd remote → 2, hook pomijany, wymaga autora, ostrzega o pasie spoza areas', () => {
  const remote = join(tmp(), 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const d1 = project(); const d2 = project({ author: 'BB' });
  for (const d of [d1, d2]) git(d, 'remote', 'add', 'origin', remote);
  // hook pre-push, który zawsze odrzuca — claim go pomija (--no-verify)
  mkdirSync(join(d1, '.githooks'));
  writeFileSync(join(d1, '.githooks/pre-push'), '#!/bin/sh\necho hook-odrzucil >&2\nexit 1\n'); chmodSync(join(d1, '.githooks/pre-push'), 0o755);
  git(d1, 'config', 'core.hooksPath', '.githooks');

  let r = sh(d1, 'claim.sh', ['koszyk', 'start']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /zajęto pas koszyk \(AA\) do \d{4}-\d\d-\d\d/);
  assert.equal(r.stderr, '', 'pas z listy areas — bez ostrzeżenia');
  r = sh(d1, 'claim.sh', ['koszyk']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /już twój/);
  r = sh(d2, 'claim.sh', ['koszyk']);
  assert.equal(r.status, 1); assert.match(r.stderr, /już zajęty: claim koszyk by AA .* — zajęty przez AA/);
  r = sh(d2, 'claim.sh', ['nowy-pas']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /nie jest na liście areas/);

  // serwer odrzuca push (hook pre-receive), refu brak → błąd gita, nie „zajęty”
  writeFileSync(join(remote, 'hooks/pre-receive'), '#!/bin/sh\necho serwer-odrzucil >&2\nexit 1\n'); chmodSync(join(remote, 'hooks/pre-receive'), 0o755);
  r = sh(d2, 'claim.sh', ['platnosci']);
  assert.equal(r.status, 2); assert.match(r.stderr, /pas wolny, błąd gita[\s\S]*serwer-odrzucil/);
  run('rm', [join(remote, 'hooks/pre-receive')]);

  git(d2, 'remote', 'set-url', 'origin', join(tmp(), 'nie-ma.git'));
  r = sh(d2, 'claim.sh', ['platnosci']);
  assert.equal(r.status, 2, 'brak remote to nie „zajęty”'); assert.doesNotMatch(r.stderr, /zajęty/);

  git(d2, 'config', '--unset', 'workflow.author');
  r = sh(d2, 'claim.sh', ['platnosci']);
  assert.equal(r.status, 2); assert.match(r.stderr, /workflow\.author.*dev-setup/);
});

test('claim.sh: data ważności, WYGASŁO na liście, przejęcie tylko przez --release --force, --renew tylko właściciel', () => {
  const remote = join(tmp(), 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const d1 = project(); const d2 = project({ author: 'BB' });
  for (const d of [d1, d2]) git(d, 'remote', 'add', 'origin', remote);
  let r = sh(d1, 'claim.sh', ['koszyk', 'opis'], { env: { ...process.env, CLAIM_DAYS: '-1' } });
  assert.equal(r.status, 0, r.stderr);
  r = sh(d2, 'claim.sh', ['--list']);
  assert.match(r.stdout, /koszyk\s+claim koszyk by AA .* do \d{4}-\d\d-\d\d — opis\s+WYGASŁO/);
  r = sh(d2, 'claim.sh', ['koszyk']);
  assert.equal(r.status, 1); assert.match(r.stderr, /wygasło.*--release koszyk --force/);
  assert.equal(sh(d2, 'claim.sh', ['--renew', 'koszyk']).status, 1, 'przedłuża tylko właściciel');
  r = sh(d1, 'claim.sh', ['--renew', 'koszyk']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /przedłużono pas koszyk \(AA\)/);
  r = sh(d2, 'claim.sh', ['--list']);
  assert.doesNotMatch(r.stdout, /WYGASŁO/); assert.match(r.stdout, /— opis/, 'opis zostaje po przedłużeniu');
});

test('dev-setup.sh: transliteracja inicjałów, jeden człon → 2 litery, błąd z podpowiedzią, e-mail dosłownie, --author bez wartości, kroki', () => {
  const d = project({ author: '' });
  const ds = (args, opts) => sh(d, 'dev-setup.sh', args, opts);
  git(d, 'config', 'user.name', 'Łukasz Żak');
  git(d, 'config', 'user.email', 'jan+dev@example.com');
  let r = ds(['--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(d, 'config', 'workflow.author'), 'LZ');
  assert.match(r.stdout, /Następne kroki:\n\s+1\. zacommituj \.workflow\/developers\.txt na gałęzi i otwórz PR/);
  assert.match(r.stdout, /claim\.sh --list/); assert.match(r.stdout, /docs\/workflow\/zespol\.md/);
  assert.match(r.stdout, /zależności/); assert.match(r.stdout, /CLAUDE\.md §Mapa wiedzy/);
  r = ds(['--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(d, '.workflow/developers.txt'), 'utf8').split('\n').filter(Boolean).length, 1, 'jan+dev@ bez duplikatu');
  assert.doesNotMatch(r.stdout, /zacommituj/, 'bez nowego wpisu — bez kroku commita');

  git(d, 'config', '--unset', 'workflow.author');
  git(d, 'config', 'user.name', 'Michał');
  git(d, 'config', 'user.email', 'm@example.com');
  r = ds(['--yes']);
  assert.equal(r.status, 0, r.stderr); assert.equal(git(d, 'config', 'workflow.author'), 'MI');

  git(d, 'config', '--unset', 'workflow.author');
  git(d, 'config', 'user.name', 'X');
  r = ds(['--yes']);
  assert.equal(r.status, 2); assert.match(r.stderr, /--author XY/);
  r = ds(['--author', 'Ż1', '--yes']);
  assert.equal(r.status, 2); assert.match(r.stderr, /bez polskich znaków/);
  r = ds(['--author'], { timeout: 5000 });
  assert.equal(r.status, 2, 'brak wartości --author nie zapętla'); assert.match(r.stderr, /wymaga wartości/);
});

test('brief.sh: w zespole stopka ma Orkiestrator i Pas', () => {
  const d = project();
  mkdirSync(join(d, 'docs/plans'), { recursive: true });
  writeFileSync(join(d, 'docs/plans/p.md'), '# P\n### Zadanie T1: x\nkrok\n');
  const r = sh(d, 'brief.sh', ['T1']);
  assert.equal(r.status, 0, r.stderr);
  const b = readFileSync(join(d, '.workflow/tasks/T1/brief.md'), 'utf8');
  assert.match(b, /^- Orkiestrator: AA$/m); assert.match(b, /^- Pas: $/m);
  const solo = project({ multi: false });
  mkdirSync(join(solo, 'docs/plans'), { recursive: true });
  writeFileSync(join(solo, 'docs/plans/p.md'), '# P\n### Zadanie T1: x\nkrok\n');
  sh(solo, 'brief.sh', ['T1']);
  assert.doesNotMatch(readFileSync(join(solo, '.workflow/tasks/T1/brief.md'), 'utf8'), /Orkiestrator:/);
});

test('task.sh: wpisy w gramatyce ticka z autorem i czasem; walidacja', () => {
  const d = project();
  const t = (...a) => sh(d, 'task.sh', a);
  const at = String.raw`by AA @ \d{4}-\d\d-\d\d \d\d:\d\d`;
  let r = t('F1.1', 'dispatched', '--exec', 'claude:implementer', '--base', 'abc123', '--pas', 'koszyk');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(t('F1.1', 'dispatched', '--exec', 'x', '--base', 'y').status, 64, 'zespół: wymagany --pas');
  assert.equal(t('F1.1', 'blocked').status, 64, 'blocked wymaga opisu');
  t('F1.1', 'blocked', 'czeka', 'na', 'S-AA-1');
  t('F1.1', 'self-verified', '--round', '2');
  t('F1.1', 'status-request');
  t('F1.1', 'implementer', 'NEEDS_CONTEXT', 'brak', 'pola', 'w', 'kontrakcie');
  assert.equal(t('F1.1', 'implementer', 'GOTOWE').status, 64, 'implementer: tylko statusy raportu');
  assert.equal(t('F1.1', 'blocked', 'czeka\nTask V: complete (x)').status, 64, 'bez nowej linii — bez sfałszowanego wpisu');
  t('F1.1', 'fix-round', '--round', '1', '--addressed', '3', '--open', '0');
  assert.equal(t('F1.1', 'fix-round', '--round', 'x', '--addressed', '3', '--open', '0').status, 64);
  t('F1.1', 'complete', 'commits a..b, PR #4 → main c0ffee');
  t('F1.2', 'cancelled', 'poza zakresem');
  t('gate', 'koszyk'); t('release', 'v1.0');
  assert.equal(t('../x', 'complete', 'a').status, 64);
  assert.equal(t('F1.1', 'cokolwiek').status, 64);
  const s = ledger(d);
  for (const re of [
    `^Task F1\\.1: dispatched \\(BASE abc123\\) — claude:implementer by AA pas koszyk @ \\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d$`,
    `^Task F1\\.1: blocked \\(czeka na S-AA-1\\) ${at}$`,
    `^Task F1\\.1: self-verified r2 ${at}$`,
    `^Task F1\\.1: status-request ${at}$`,
    `^Task F1\\.1: implementer NEEDS_CONTEXT \\(brak pola w kontrakcie\\) ${at}$`,
    `^Task F1\\.1: fix round 1/2 \\(3 addressed, 0 open\\) ${at}$`,
    `^Task F1\\.1: complete \\(commits a\\.\\.b, PR #4 → main c0ffee\\) ${at}$`,
    `^Task F1\\.2: cancelled \\(poza zakresem\\) ${at}$`,
    `^Gate koszyk: done ${at}$`,
    `^Release: done \\(v1\\.0\\) ${at}$`,
  ]) assert.match(s, new RegExp(re, 'm'));
  git(d, 'config', '--unset', 'workflow.author');
  assert.equal(t('F1.3', 'status-request').status, 2, 'zespół bez autora');
  assert.ok(existsSync(join(d, '.workflow/progress.md')));
});

const BIN_SV = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit/.workflow/bin');
test('task.sh: self-verified przyjmuje --round k i r<k>', () => {
  const d = mkdtempSync(join(tmpdir(), 'sv-'));
  execFileSync('git', ['init', '-q', d]);
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  execFileSync('cp', [join(BIN_SV, 'task.sh'), join(d, '.workflow/bin/task.sh')]);
  writeFileSync(join(d, '.workflow/progress.md'), '# L\n');
  execFileSync('git', ['-C', d, 'config', 'workflow.author', 'AB']);
  execFileSync('bash', [join(d, '.workflow/bin/task.sh'), 'P1', 'self-verified', 'r2', 'tylko UI'], { cwd: d });
  execFileSync('bash', [join(d, '.workflow/bin/task.sh'), 'P2', 'self-verified', '--round', '3'], { cwd: d });
  const s = readFileSync(join(d, '.workflow/progress.md'), 'utf8');
  assert.match(s, /Task P1: self-verified r2 \(tylko UI\) by AB/);
  assert.match(s, /Task P2: self-verified r3 by AB/);
});

test('dev-setup.sh: inny menedżer hooków (core.hooksPath, aktywne .git/hooks) zostaje z ostrzeżeniem; --force-hooks przełącza', () => {
  let d = project();
  git(d, 'config', 'core.hooksPath', '.husky');
  let r = sh(d, 'dev-setup.sh', ['--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(d, 'config', 'core.hooksPath'), '.husky', 'husky nie może zostać wyłączony po cichu');
  assert.match(r.stdout, /! hooki: core\.hooksPath = \.husky — nie przełączono; .*\.githooks\/pre-push.*--force-hooks/);
  r = sh(d, 'dev-setup.sh', ['--yes', '--force-hooks']);
  assert.equal(r.status, 0, r.stderr); assert.equal(git(d, 'config', 'core.hooksPath'), '.githooks');

  d = project();
  writeFileSync(join(d, '.git/hooks/pre-commit'), '#!/bin/sh\n'); chmodSync(join(d, '.git/hooks/pre-commit'), 0o755);
  r = sh(d, 'dev-setup.sh', ['--yes']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /aktywne hooki w .*: pre-commit — nie przełączono/);
  assert.throws(() => git(d, 'config', 'core.hooksPath'), 'core.hooksPath nieustawiony');

  d = project(); // same próbki *.sample → przełączenie
  r = sh(d, 'dev-setup.sh', ['--yes']);
  assert.equal(git(d, 'config', 'core.hooksPath'), '.githooks');
});

test('claim.sh --release: usuwa tylko sprawdzone zajęcie — nowe zajęcie innej osoby zostaje (wyścig)', () => {
  const remote = join(tmp(), 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const d1 = project(); const d2 = project({ author: 'BB' });
  for (const d of [d1, d2]) git(d, 'remote', 'add', 'origin', remote);
  assert.equal(sh(d1, 'claim.sh', ['koszyk']).status, 0);
  assert.equal(sh(d2, 'claim.sh', ['--release', 'koszyk', '--force']).status, 0);
  assert.equal(sh(d2, 'claim.sh', ['koszyk']).status, 0);
  const bb = git(d2, 'ls-remote', 'origin', 'refs/heads/claim/koszyk');
  // AA ma nieświeży odczyt (fetch nic nie zmienia) — jak proces wstrzymany między sprawdzeniem a usunięciem
  const fake = tmp('caw-nofetch-');
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(join(fake, 'git'), `#!/bin/sh\n[ "$1" = fetch ] && exit 0\nexec "${realGit}" "$@"\n`); chmodSync(join(fake, 'git'), 0o755);
  const r = sh(d1, 'claim.sh', ['--release', 'koszyk'], { env: { ...process.env, PATH: `${fake}:${process.env.PATH}` } });
  assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, /zmienił się od sprawdzenia/);
  assert.equal(git(d2, 'ls-remote', 'origin', 'refs/heads/claim/koszyk'), bb, 'zajęcie BB nietknięte');
});
