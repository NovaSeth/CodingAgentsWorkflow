// Testy skryptów kitu i instalatora: node --test tests/*.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = join(root, 'kit/.workflow/bin');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'caw-'));
  execFileSync('git', ['init', '-q', d]);
  execFileSync('git', ['-C', d, 'config', 'user.email', 't@example.com']);
  execFileSync('git', ['-C', d, 'config', 'user.name', 't']);
  return d;
}
const commit = (d, file, content) => {
  mkdirSync(dirname(join(d, file)), { recursive: true });
  writeFileSync(join(d, file), content);
  execFileSync('git', ['-C', d, 'add', '-A']);
  execFileSync('git', ['-C', d, 'commit', '-qm', `add ${file}`]);
};

// Wartości testowe składane w locie, żeby same nie wyglądały jak sekrety w repo tego kitu.
const ghToken = 'gh' + 'p_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const envLine = (v) => 'PAYMENT_API' + '_KEY=' + v;

test('check-secrets: czyste repo → 0, sekret → 1 (zamaskowany), znacznik SYNTH → 0, plik klucza → 1', () => {
  const d = repo();
  commit(d, 'src/a.ts', 'export const x = 1;\n');
  let r = run('bash', [join(BIN, 'check-secrets.sh')], { cwd: d });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /czysto/);

  commit(d, 'src/b.ts', `const t = "${ghToken}";\n`);
  r = run('bash', [join(BIN, 'check-secrets.sh')], { cwd: d });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /src\/b\.ts/);
  assert.ok(!r.stdout.includes(ghToken), 'wartość sekretu nie może trafić na wyjście');

  commit(d, 'src/b.ts', `const t = "${ghToken}"; // check-secrets: syntetyczne\n`);
  r = run('bash', [join(BIN, 'check-secrets.sh')], { cwd: d });
  assert.equal(r.status, 0, r.stdout + r.stderr);

  commit(d, 'config/app.env.ts', `// ${envLine('Zx9Yw8Xv7Wu6Vt5Us4')}\n`);
  r = run('bash', [join(BIN, 'check-secrets.sh')], { cwd: d });
  assert.equal(r.status, 1, 'KEY=wartość w konfiguracji');
  commit(d, 'config/app.env.ts', `// ${envLine('SYNTH_Zx9Yw8Xv7Wu6Vt5Us4')}\n`);

  commit(d, 'release.p12', 'binary');
  r = run('bash', [join(BIN, 'check-secrets.sh')], { cwd: d });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pliki kluczy/);
});

test('check-secrets: poza repo git → 2 (wynik nieważny, nigdy „czysto”)', () => {
  const d = mkdtempSync(join(tmpdir(), 'caw-nogit-'));
  const r = run('bash', [join(BIN, 'check-secrets.sh')], { cwd: d, env: { ...process.env, GIT_CEILING_DIRECTORIES: tmpdir() } });
  assert.equal(r.status, 2);
});

test('check-key-leak: brak .env → 2; wartość z .env w pliku i w artefakcie → 1; czysto → 0; nie drukuje wartości', () => {
  const d = repo();
  commit(d, 'src/a.ts', 'export const x = 1;\n');
  writeFileSync(join(d, '.gitignore'), '.env\n');
  let r = run('bash', [join(BIN, 'check-key-leak.sh')], { cwd: d });
  assert.equal(r.status, 2);

  const secret = 'Qm7' + 'Lp2Rt9Vx4Zk8Wn3';
  writeFileSync(join(d, '.env'), `UPSTREAM_TOKEN=${secret}\nPORT=8787\n`);
  r = run('bash', [join(BIN, 'check-key-leak.sh')], { cwd: d });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /czysto.*1 zmiennych/);

  writeFileSync(join(d, 'src/leak.ts'), `const k = "${secret.slice(0, 8)}";\n`);
  r = run('bash', [join(BIN, 'check-key-leak.sh')], { cwd: d });
  assert.equal(r.status, 1, 'fragment wartości (pierwsze 8 znaków) też jest wyciekiem');
  assert.ok(!(r.stdout + r.stderr).includes(secret.slice(0, 8)));

  const dist = mkdtempSync(join(tmpdir(), 'caw-dist-'));
  writeFileSync(join(dist, 'bundle.js'), 'fetch(process.env.UPSTREAM_TOKEN)');
  writeFileSync(join(d, 'src/leak.ts'), 'ok\n');
  r = run('bash', [join(BIN, 'check-key-leak.sh'), '--dir', dist, '--forbid-name', 'UPSTREAM_TOKEN'], { cwd: d });
  assert.equal(r.status, 1, 'nazwa zmiennej z sekretem w artefakcie klienta');
});

test('check-key-leak: CRLF, „export ”, spacje na końcu; opcja bez wartości → 2', () => {
  const d = repo();
  writeFileSync(join(d, '.gitignore'), '.env\n');
  const v1 = 'Zx8' + 'Qw4Er7Ty1Ui5', v2 = 'Pk3' + 'Lm6Nb9Vc2Xz';
  writeFileSync(join(d, '.env'), `export API_TOKEN=${v1}   \r\nDB_PASSWORD="${v2}"\r\n`);
  commit(d, 'src/a.ts', `const a = "${v1}"; const b = "${v2}";\n`);
  let r = run('bash', [join(BIN, 'check-key-leak.sh')], { cwd: d });
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, /sprawdzono 2 zmiennych/);
  r = run('bash', [join(BIN, 'check-key-leak.sh'), '--env'], { cwd: d });
  assert.equal(r.status, 2); assert.match(r.stderr, /--env wymaga wartości/);
});

test('check-key-leak: ostatnia linia .env bez \\n jest sprawdzana; błąd narzędzia → 2 (nigdy „czysto”)', () => {
  const d = repo();
  writeFileSync(join(d, '.gitignore'), '.env\n');
  const v1 = 'Ab1' + 'Cd2Ef3Gh4Ij5', v2 = 'Kl6' + 'Mn7Op8Qr9St0';
  writeFileSync(join(d, '.env'), `API_KEY=${v1}\nSECRET=${v2}`);
  commit(d, 'leak.txt', `${v2}\n`);
  let r = run('bash', [join(BIN, 'check-key-leak.sh')], { cwd: d });
  assert.equal(r.status, 1, r.stdout + r.stderr); assert.match(r.stderr, /sprawdzono 2 zmiennych/);
  const fake = mkdtempSync(join(tmpdir(), 'caw-fakegit-'));
  writeFileSync(join(fake, 'git'), '#!/bin/sh\necho "fatal: zepsuty" >&2\nexit 2\n'); chmodSync(join(fake, 'git'), 0o755);
  r = run('bash', [join(BIN, 'check-key-leak.sh'), '--env', join(d, '.env')], { cwd: d, env: { ...process.env, PATH: `${fake}:${process.env.PATH}` } });
  assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, /wynik nieważny/); assert.doesNotMatch(r.stdout, /czysto/);
  // awaria grep przy budowie listy plików też unieważnia wynik
  const realGrep = execFileSync('sh', ['-c', 'command -v grep'], { encoding: 'utf8' }).trim();
  writeFileSync(join(fake, 'grep'), `#!/bin/sh\n[ "$1" = -vxF ] && { echo "grep: zepsuty" >&2; exit 2; }\nexec "${realGrep}" "$@"\n`); chmodSync(join(fake, 'grep'), 0o755);
  rmSync(join(fake, 'git'));
  r = run('bash', [join(BIN, 'check-key-leak.sh')], { cwd: d, env: { ...process.env, PATH: `${fake}:${process.env.PATH}` } });
  assert.equal(r.status, 2, r.stdout + r.stderr); assert.match(r.stderr, /lista plików/);
  // awaria narzędzia przy rozpoznawaniu nazw zmiennych nie pomija zmiennej po cichu
  rmSync(join(fake, 'grep'));
  writeFileSync(join(fake, 'tr'), '#!/bin/sh\nexit 2\n'); chmodSync(join(fake, 'tr'), 0o755);
  r = run('bash', [join(BIN, 'check-key-leak.sh')], { cwd: d, env: { ...process.env, PATH: `${fake}:${process.env.PATH}` } });
  assert.equal(r.status, 2, r.stdout + r.stderr); assert.doesNotMatch(r.stdout, /czysto/);
});

test('budget.sh: próg nie-liczbowy → 64 z komunikatem (nie wywrotka [ ])', () => {
  for (const [k, v] of [['LOAD_MAX', '4.5'], ['FREE_MIN', 'x'], ['EXECUTOR_MAX', 'dwa']]) {
    const r = run('bash', [join(BIN, 'budget.sh'), 'agent'], { env: { ...process.env, [k]: v } });
    assert.equal(r.status, 64, `${k}=${v}: ${r.stderr}`); assert.match(r.stderr, new RegExp(`${k}=`));
  }
});

test('brief.sh: wycina zadanie do następnego nagłówka, pomija nagłówki w blokach kodu', () => {
  const d = repo();
  const plan = [
    '# Plan', '## Faza F1', '### Zadanie F1.1: pierwsze', 'krok A', '```md', '### Zadanie F1.2: w bloku kodu', '```', 'krok B',
    '### Zadanie F1.2: drugie', 'krok C', '## Faza F2', 'koniec',
  ].join('\n');
  commit(d, 'docs/plans/2026-01-01-plan.md', plan);
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  execFileSync('cp', [join(BIN, 'brief.sh'), join(d, '.workflow/bin/brief.sh')]);
  let r = run('bash', [join(d, '.workflow/bin/brief.sh'), 'F1.1']);
  assert.equal(r.status, 0, r.stderr);
  const b = readFileSync(join(d, '.workflow/tasks/F1.1/brief.md'), 'utf8');
  assert.match(b, /krok A[\s\S]*krok B/);
  assert.doesNotMatch(b, /krok C/);
  assert.match(b, /Uzupełnia orkiestrator/);
  r = run('bash', [join(d, '.workflow/bin/brief.sh'), 'F1.1']);
  assert.equal(r.status, 1, 'nie nadpisuje bez FORCE=1');
  r = run('bash', [join(d, '.workflow/bin/brief.sh'), 'F9.9']);
  assert.equal(r.status, 1);
  assert.ok(!existsSync(join(d, '.workflow/tasks/F9.9/brief.md')));
});

test('brief.sh: ID porównywane dosłownie (1.2 nie wycina 102), ID ze ścieżką → 2', () => {
  const d = repo();
  commit(d, 'docs/plans/p.md', ['# Plan', '### Zadanie 102: sto dwa', 'krok 102', '### Zadanie 1.2: jeden dwa', 'krok 1.2', '## Koniec'].join('\n'));
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  execFileSync('cp', [join(BIN, 'brief.sh'), join(d, '.workflow/bin/brief.sh')]);
  const r = run('bash', [join(d, '.workflow/bin/brief.sh'), '1.2']);
  assert.equal(r.status, 0, r.stderr);
  const b = readFileSync(join(d, '.workflow/tasks/1.2/brief.md'), 'utf8');
  assert.match(b, /krok 1\.2/); assert.doesNotMatch(b, /krok 102/);
  for (const bad of ['../x', 'a/b', '..', 'a b']) {
    const x = run('bash', [join(d, '.workflow/bin/brief.sh'), bad]);
    assert.equal(x.status, 2, bad); assert.match(x.stderr, /nieprawidłowe ID/);
  }
  assert.ok(!existsSync(join(d, '.workflow/x')));
});

test('budget.sh: OK przy luźnych progach, CZEKAJ przy przekroczonym load', () => {
  let r = run('bash', [join(BIN, 'budget.sh'), 'agent'], { env: { ...process.env, LOAD_MAX: '100000', FREE_MIN: '0' } });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /OK$/m);
  r = run('bash', [join(BIN, 'budget.sh'), 'agent'], { env: { ...process.env, LOAD_MAX: '0', FREE_MIN: '0' } });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /CZEKAJ: load>=0/);
  r = run('bash', [join(BIN, 'budget.sh'), 'cokolwiek']);
  assert.equal(r.status, 64);
});

test('budget.sh: tryb wysoki bierze progi HIGH z budget.local.env, normalny — NORMAL', () => {
  const d = mkdtempSync(join(tmpdir(), 'caw-budget-'));
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  execFileSync('cp', [join(BIN, 'budget.sh'), join(d, '.workflow/bin/budget.sh')]);
  writeFileSync(join(d, '.workflow/budget.local.env'), 'LOAD_MAX_NORMAL=0\nLOAD_MAX_HIGH=100000\nFREE_MIN_NORMAL=0\nFREE_MIN_HIGH=0\n');
  const env = { ...process.env }; delete env.LOAD_MAX; delete env.FREE_MIN;
  writeFileSync(join(d, '.workflow/budget.mode'), 'normalny');
  let r = run('bash', [join(d, '.workflow/bin/budget.sh'), 'agent'], { env });
  assert.equal(r.status, 1, r.stdout);
  writeFileSync(join(d, '.workflow/budget.mode'), 'wysoki');
  r = run('bash', [join(d, '.workflow/bin/budget.sh'), 'agent'], { env });
  assert.equal(r.status, 0, r.stdout);
});

test('budget.sh: zmienne środowiska mają pierwszeństwo przed budget.env i budget.local.env', () => {
  const d = mkdtempSync(join(tmpdir(), 'caw-budget-'));
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  execFileSync('cp', [join(BIN, 'budget.sh'), join(d, '.workflow/bin/budget.sh')]);
  writeFileSync(join(d, '.workflow/budget.env'), 'LOAD_MAX=0\nEXECUTOR_MAX=5\n');
  writeFileSync(join(d, '.workflow/budget.local.env'), 'FREE_MIN=0\nLOAD_MAX_NORMAL=0\n');
  const env = { ...process.env }; delete env.LOAD_MAX; delete env.FREE_MIN; delete env.EXECUTOR_MAX;
  let r = run('bash', [join(d, '.workflow/bin/budget.sh'), 'agent'], { env });
  assert.equal(r.status, 1, 'bez zmiennych obowiązuje plik (LOAD_MAX=0)');
  r = run('bash', [join(d, '.workflow/bin/budget.sh'), 'agent'], { env: { ...env, LOAD_MAX: '100000' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  r = run('bash', [join(d, '.workflow/bin/budget.sh'), 'executor'], { env: { ...env, LOAD_MAX: '100000', EXECUTOR_MAX: '0' } });
  assert.equal(r.status, 1); assert.match(r.stdout, /wykonawca=0\/0/);
});

test('budget.sh: brak pomiaru pamięci (i load) → CZEKAJ, chyba że kontrola wyłączona', () => {
  const fake = mkdtempSync(join(tmpdir(), 'caw-fakebin-'));
  writeFileSync(join(fake, 'memory_pressure'), '#!/bin/sh\necho "brak danych"\n'); chmodSync(join(fake, 'memory_pressure'), 0o755);
  const env = { ...process.env, PATH: `${fake}:${process.env.PATH}`, LOAD_MAX: '100000' };
  let r = run('bash', [join(BIN, 'budget.sh'), 'agent'], { env: { ...env, FREE_MIN: '10' } });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /CZEKAJ:.*brak pomiaru pamięci/); assert.match(r.stderr, /brak pomiaru wolnej pamięci/);
  r = run('bash', [join(BIN, 'budget.sh'), 'agent'], { env: { ...env, FREE_MIN: '0' } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  if (!existsSync('/proc/loadavg')) {   // load z sysctl (macOS) — atrapa bez wyniku
    writeFileSync(join(fake, 'sysctl'), '#!/bin/sh\nexit 1\n'); chmodSync(join(fake, 'sysctl'), 0o755);
    r = run('bash', [join(BIN, 'budget.sh'), 'agent'], { env: { ...env, FREE_MIN: '0' } });
    assert.equal(r.status, 1); assert.match(r.stdout, /brak pomiaru load/);
    r = run('bash', [join(BIN, 'budget.sh'), 'agent'], { env: { ...env, FREE_MIN: '0', LOAD_MAX: 'off' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
});

test('heavy.sh: worktree dzielą katalog slotów głównego repo', () => {
  const d = repo();
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  execFileSync('cp', [join(BIN, 'heavy.sh'), join(d, '.workflow/bin/heavy.sh')]);
  commit(d, 'a.txt', 'a');
  const wt = join(dirname(d), `${d.split('/').pop()}-wt`);
  execFileSync('git', ['-C', d, 'worktree', 'add', '-q', '-b', 'wt', wt]);
  const home = mkdtempSync(join(tmpdir(), 'caw-home-'));
  const env = { ...process.env, HOME: home }; delete env.HEAVY_DIR;
  const r = run('bash', [join(wt, '.workflow/bin/heavy.sh'), 'true'], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(join(home, '.cache')), [`${d.split('/').pop()}-heavy`]);
});

test('heavy.sh: przekazuje kod wyjścia i zwalnia slot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caw-heavy-'));
  const env = { ...process.env, HEAVY_DIR: dir, HEAVY_SLOTS: '1' };
  let r = run('bash', [join(BIN, 'heavy.sh'), 'bash', '-c', 'exit 3'], { env });
  assert.equal(r.status, 3);
  r = run('bash', [join(BIN, 'heavy.sh'), 'true'], { env });
  assert.equal(r.status, 0, 'slot zwolniony po poprzednim poleceniu');
  assert.ok(!existsSync(join(dir, 'slot-1')));
  // osierocony slot (martwy pid) jest sprzątany
  mkdirSync(join(dir, 'slot-1'));
  writeFileSync(join(dir, 'slot-1/pid'), '999999');
  r = run('bash', [join(BIN, 'heavy.sh'), 'true'], { env, timeout: 15000 });
  assert.equal(r.status, 0);
  assert.deepEqual(readdirSync(dir), [], 'przejęcie przez mv — bez pozostałości slot-1.stale.*');
});

test('heavy.sh: slot martwego skryptu z żywym poleceniem (child) nie jest przejmowany', () => {
  const dir = mkdtempSync(join(tmpdir(), 'caw-heavy-'));
  const env = { ...process.env, HEAVY_DIR: dir, HEAVY_SLOTS: '1' };
  const live = spawnSync('sh', ['-c', 'sleep 30 >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).stdout.trim();
  try {
    mkdirSync(join(dir, 'slot-1'));
    writeFileSync(join(dir, 'slot-1/pid'), '999999'); writeFileSync(join(dir, 'slot-1/child'), live);
    const r = run('bash', [join(BIN, 'heavy.sh'), 'true'], { env, timeout: 4000 });
    assert.notEqual(r.status, 0, 'czeka na slot zamiast przejąć go od żywego polecenia');
    assert.equal(readFileSync(join(dir, 'slot-1/child'), 'utf8'), live);
  } finally { try { process.kill(Number(live)); } catch { /* już nie żyje */ } }
  const r = run('bash', [join(BIN, 'heavy.sh'), 'true'], { env, timeout: 15000 });
  assert.equal(r.status, 0, 'po końcu polecenia slot jest sprzątany');
});

test('run-other.sh: placeholdery jako zmienne (spacje w ścieżce, bez wstrzyknięcia), nazwa walidowana', () => {
  const d = mkdtempSync(join(tmpdir(), 'caw ro '));
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  execFileSync('cp', [join(BIN, 'run-other.sh'), join(d, '.workflow/bin/run-other.sh')]);
  const marker = join(d, 'PWNED');
  const env = { ...process.env, OTHER_CLI: `cat >/dev/null; printf '%s|' {worktree} "{model}" > {out}` };
  const ro = (...a) => run('bash', [join(d, '.workflow/bin/run-other.sh'), ...a], { env });
  let r = ro(`/w t;touch ${marker}`, '/b.md', 'n1', 'read-only', 'm x', 'high');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(d, '.workflow/tasks/n1/n1.last.md'), 'utf8'), `/w t;touch ${marker}|m x|`);
  assert.ok(!existsSync(marker), 'wartość placeholdera nie jest wykonywana');
  for (const bad of ['../x', 'a/b', 'a b', '..']) assert.equal(ro('/w', '/b.md', bad, 'read-only', 'm', 'low').status, 2, bad);
});

test('install.sh: poziomy, idempotencja, CLAUDE.md nie jest nadpisywany', () => {
  const install = join(root, 'scripts/install.sh');
  const d = repo();
  let r = run('bash', [install, '--dry-run', '--level', 'full', d]);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(d, '.workflow')), 'dry-run niczego nie zmienia');

  r = run('bash', [install, d]);
  assert.equal(r.status, 0, r.stderr);
  for (const f of ['CLAUDE.md', '.workflow/progress.md', '.workflow/bin/check-secrets.sh', '.githooks/pre-push',
    '.workflow/templates/task/brief.md', '.claude/agents/reviewer.md', 'docs/workflow/lekcje.md']) {
    assert.ok(existsSync(join(d, f)), `minimum: ${f}`);
  }
  assert.ok(!existsSync(join(d, '.workflow/bin/heavy.sh')), 'minimum nie ma heavy.sh');
  assert.match(readFileSync(join(d, '.gitignore'), 'utf8'), /\.worktrees\//);

  writeFileSync(join(d, 'CLAUDE.md'), 'moje zasady\n');
  r = run('bash', [install, '--level', 'full', d]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), 'moje zasady\n');
  assert.ok(existsSync(join(d, 'CLAUDE.workflow.md')));
  for (const f of ['.workflow/bin/heavy.sh', '.workflow/routing/route.mjs', '.claude/agents/security.md',
    '.claude/skills/orkiestracja-agentow/SKILL.md', 'docs/security/przewodnik-bezpieczenstwa.md']) {
    assert.ok(existsSync(join(d, f)), `full: ${f}`);
  }
  assert.match(r.stdout, /Pominięte, bo istnieją \([1-9]/);
  const gi = readFileSync(join(d, '.gitignore'), 'utf8');
  assert.equal(gi.split('\n').filter((l) => l === '.worktrees/').length, 1, '.gitignore bez duplikatów');

  // zainstalowany router działa w projekcie docelowym
  const list = run('node', [join(d, '.workflow/routing/route.mjs'), '--list']);
  assert.equal(list.status, 0, list.stderr);
  assert.match(list.stdout, /implement-lane/);
  // zainstalowany skaner przechodzi na świeżo zainstalowanym kicie (szablony nie wyglądają jak sekrety)
  execFileSync('git', ['-C', d, 'add', '-A']);
  const sec = run('bash', [join(d, '.workflow/bin/check-secrets.sh')], { cwd: d });
  assert.equal(sec.status, 0, sec.stdout + sec.stderr);
});

test('install.sh: zły poziom i brak ścieżki → 2', () => {
  assert.equal(run('bash', [join(root, 'scripts/install.sh'), '--level', 'mega', '/tmp']).status, 2);
  assert.equal(run('bash', [join(root, 'scripts/install.sh')]).status, 2);
});
