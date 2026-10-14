// Testy routera wykonawców: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'kit/.workflow/routing');
const dir = mkdtempSync(join(tmpdir(), 'route-'));
copyFileSync(join(SRC, 'routing.json'), join(dir, 'routing.json'));
process.env.ROUTING_DIR = dir;
const r = await import(join(SRC, 'route.mjs'));

const row = (type, exec, rounds, missed = 0, diff = 2) => ({ at: 'x', type, exec, rounds, missed, diff });
const normal = () => ({ state: 'normal' });

test('bez historii wybiera pierwszego kandydata', () => {
  const res = r.choose('fix-mechanical', { rows: [], limit: normal });
  assert.equal(res.key, 'claude:implementer');
  assert.deepEqual(res.why, []);
});

test('słaby wynik (średnio > 2 rundy w ostatnich 3) degraduje kandydata', () => {
  const rows = [row('fix-mechanical', 'claude:implementer', 3), row('fix-mechanical', 'claude:implementer', 3)];
  const res = r.choose('fix-mechanical', { rows, limit: normal });
  assert.equal(res.key, 'other:other-main:low');
  assert.match(res.why[0], /słaby wynik/);
});

test('przepuszczone ustalenia (> 1) degradują recenzenta', () => {
  const rows = [row('review-task', 'claude:reviewer', 0, 1), row('review-task', 'claude:reviewer', 0, 1)];
  assert.equal(r.choose('review-task', { rows, limit: normal }).key, 'other:other-frontier:medium');
});

test('ostatni kandydat nie jest pomijany nawet przy słabym wyniku', () => {
  const rows = [row('design', 'claude:designer', 5), row('design', 'claude:designer', 5)];
  assert.equal(r.choose('design', { rows, limit: normal }).key, 'claude:designer');
});

test('zablokowany dostawca jest pomijany, ograniczony nie dostaje drogich modeli', () => {
  const blocked = (p) => (p === 'claude' ? { state: 'blocked', reset: '2099-01-01T00:00:00Z' } : { state: 'normal' });
  assert.equal(r.choose('fix-mechanical', { rows: [], limit: blocked }).key, 'other:other-main:low');
  const tight = (p) => (p === 'claude' ? { state: 'tight' } : { state: 'normal' });
  assert.equal(r.choose('review-concurrency', { rows: [], limit: tight }).key, 'other:other-frontier:high');
  assert.equal(r.choose('fix-mechanical', { rows: [], limit: tight }).key, 'claude:implementer');
});

test('próbkowanie: co 5. zadanie typu idzie do kandydata bez historii, ale nie przy ustaleniach krytycznych', () => {
  const rows = [0, 1, 2, 3].map(() => row('fix-mechanical', 'claude:implementer', 0));
  const res = r.choose('fix-mechanical', { rows, limit: normal });
  assert.equal(res.key, 'other:other-main:low');
  assert.match(res.why[0], /próbkowanie/);
  assert.equal(r.choose('fix-mechanical', { rows, limit: normal, critical: true }).key, 'claude:implementer');
  assert.equal(r.choose('fix-mechanical', { rows: rows.slice(1), limit: normal }).key, 'claude:implementer');
});

test('jakość ważona trudnością: runda na trudnym zadaniu waży mniej', () => {
  const easy = r.quality('fix-judgment', 'a', [row('fix-judgment', 'a', 1, 0, 1)]);
  const hard = r.quality('fix-judgment', 'a', [row('fix-judgment', 'a', 1, 0, 3)]);
  assert.ok(hard.q < easy.q);
});

test('jakość: brak historii dla effortu → historia tego samego modelu z innym effortem', () => {
  const q = r.quality('fix-judgment', 'other:m:high', [row('fix-judgment', 'other:m:low', 1)]);
  assert.equal(q.n, 1);
  assert.equal(r.quality('fix-judgment', 'other:m:high', []), null);
});

test('rebalans: lepszy (po koszcie) awansuje, kandydaci bez historii zostają na miejscu', () => {
  const t = 'fix-judgment';
  const rows = [
    row(t, 'claude:implementer', 2), row(t, 'claude:implementer', 2),
    row(t, 'other:other-frontier:medium', 0), row(t, 'other:other-frontier:medium', 0),
  ];
  const changes = r.rebalance(rows);
  assert.equal(changes.length, 1);
  assert.match(changes[0], /fix-judgment: claude:implementer > other:other-frontier:medium > claude:designer → other:other-frontier:medium > claude:implementer > claude:designer/);
});

test('CLI: --record waliduje liczby, --limit zapisuje stan, który wygasa po resecie', () => {
  const cli = join(SRC, 'route.mjs');
  const env = { ...process.env, ROUTING_DIR: dir };
  const bad = spawnSync('node', [cli, '--record', 'chore', 'claude:mechanic', 'x', '0'], { env, encoding: 'utf8' });
  assert.equal(bad.status, 2);
  execFileSync('node', [cli, '--record', 'chore', 'claude:mechanic', '0', '0', 't1'], { env });
  assert.match(readFileSync(join(dir, 'scorecard.jsonl'), 'utf8'), /"task":"t1"/);
  execFileSync('node', [cli, '--limit', 'claude', 'blocked', '2000-01-01T00:00:00Z'], { env });
  const out = execFileSync('node', [cli, 'chore'], { env, encoding: 'utf8' });
  assert.match(out, /chore → claude:mechanic/);
  const status = execFileSync('node', [cli, '--status'], { env, encoding: 'utf8' });
  assert.match(status, /claude: normal.*wygasło/);
});

test('CLI: polecenie z szablonu dostawcy', () => {
  writeFileSync(join(dir, 'limits.json'), '{}');
  const out = execFileSync('node', [join(SRC, 'route.mjs'), 'fix-mechanical', '/wt', '/b.md', 'n1'], { env: { ...process.env, ROUTING_DIR: dir }, encoding: 'utf8' });
  assert.match(out, /Agent\(subagent_type: "implementer", prompt: "Przeczytaj brief \/b\.md/);
});

test('wszyscy kandydaci zablokowani → brak wyboru; zablokowany ostatni ustępuje niezablokowanemu', () => {
  const allBlocked = () => ({ state: 'blocked', reset: '2099-01-01T00:00:00Z' });
  const res = r.choose('fix-mechanical', { rows: [], limit: allBlocked });
  assert.equal(res.blocked, true); assert.equal(res.pick, null);
  const rows = [row('fix-mechanical', 'claude:implementer', 5), row('fix-mechanical', 'claude:implementer', 5)];
  const otherBlocked = (p) => (p === 'other' ? { state: 'blocked' } : { state: 'normal' });
  assert.equal(r.choose('fix-mechanical', { rows, limit: otherBlocked }).key, 'claude:implementer');
});

test('CLI: --limit z resetem spoza ISO → 2; wszyscy zablokowani → kod 3 bez polecenia; argumenty cytowane', () => {
  const cli = join(SRC, 'route.mjs');
  const env = { ...process.env, ROUTING_DIR: dir };
  const bad = spawnSync('node', [cli, '--limit', 'claude', 'blocked', 'jutro'], { env, encoding: 'utf8' });
  assert.equal(bad.status, 2); assert.match(bad.stderr, /ISO/);
  writeFileSync(join(dir, 'limits.json'), JSON.stringify({ claude: { state: 'blocked', reset: '2099-01-01T00:00:00Z' }, other: { state: 'blocked', reset: '2099-01-01' } }));
  const blocked = spawnSync('node', [cli, 'fix-mechanical', '/wt', '/b.md', 'n1'], { env, encoding: 'utf8' });
  assert.equal(blocked.status, 3);
  assert.match(blocked.stdout, /wszyscy kandydaci zablokowani/);
  assert.doesNotMatch(blocked.stdout, /Agent\(|run-other/);
  execFileSync('node', [cli, '--limit', 'claude', 'normal'], { env });
  const out = execFileSync('node', [cli, 'fix-mechanical', '/w t/x', "/b'1.md", 'n1'], { env, encoding: 'utf8' });
  assert.match(out, /Przeczytaj brief '\/b'\\''1\.md' i wykonaj go\. Worktree: '\/w t\/x'\./);
  writeFileSync(join(dir, 'limits.json'), JSON.stringify({ claude: { state: 'blocked', reset: '2099-01-01' } }));
  const other = execFileSync('node', [cli, 'fix-mechanical', '/w t/x', '/b.md', 'n1'], { env, encoding: 'utf8' });
  assert.match(other, /run-other\.sh '\/w t\/x' \/b\.md n1 /);
  writeFileSync(join(dir, 'limits.json'), '{}');
});

test('D10: implementacja (implement-lane, implement-shared) bez drugiego dostawcy; poprawki według ustaleń z drugim', () => {
  const cfg = JSON.parse(readFileSync(join(SRC, 'routing.json'), 'utf8'));
  for (const t of ['implement-lane', 'implement-shared']) assert.ok(cfg.types[t].candidates.every((c) => c.provider !== 'other'), t);
  assert.ok(cfg.types['fix-mechanical'].candidates.some((c) => c.provider === 'other'));
});
