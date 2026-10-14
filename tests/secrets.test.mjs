// Testy bramki sekretów: check-secrets.sh (tryby: drzewo, --staged, --range) i hook pre-push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCAN = join(root, 'kit/.workflow/bin/check-secrets.sh');
const HOOKS = join(root, 'kit/.githooks');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const git = (d, ...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' }).trim();
const scan = (d, ...a) => run('bash', [SCAN, ...a], { cwd: d });

// Wartości składane w locie, żeby same nie wyglądały jak sekrety w repo tego kitu.
const ghToken = 'gh' + 'p_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8';
const val = 'Zx81' + 'Qw7Er6Ty5Ui4Op3';

function repo() {
  const d = mkdtempSync(join(tmpdir(), 'caw-sec-'));
  execFileSync('git', ['init', '-q', '-b', 'main', d]);
  git(d, 'config', 'user.email', 't@example.com');
  git(d, 'config', 'user.name', 't');
  return d;
}
const put = (d, file, content) => {
  mkdirSync(dirname(join(d, file)), { recursive: true });
  writeFileSync(join(d, file), content);
};
const commit = (d, file, content) => {
  if (content === null) rmSync(join(d, file)); else put(d, file, content);
  git(d, 'add', '-A');
  git(d, 'commit', '-qm', `zmiana ${file}`);
};
const noLeak = (r, ...values) => {
  for (const v of values) assert.ok(!(r.stdout + r.stderr).includes(v), `wartość sekretu na wyjściu: ${v.slice(0, 4)}…`);
};

// Repo z bare remote i hookiem z kitu; skrypt skanera w .workflow/bin jak w zainstalowanym projekcie.
function pushRepo() {
  const remote = mkdtempSync(join(tmpdir(), 'caw-sec-remote-'));
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const d = repo();
  mkdirSync(join(d, '.workflow/bin'), { recursive: true });
  copyFileSync(SCAN, join(d, '.workflow/bin/check-secrets.sh'));
  git(d, 'remote', 'add', 'origin', remote);
  git(d, 'config', 'core.hooksPath', HOOKS);
  commit(d, 'src/a.ts', 'export const x = 1;\n');
  return { d, remote };
}
const push = (d, ...a) => run('git', ['-C', d, 'push', '-q', 'origin', ...a]);

test('wyjście to tylko plik:linia — bez wartości w cudzysłowie, tokenu Bearer i wiersza tabeli', () => {
  const d = repo();
  commit(d, 'a.env.ts', `API_KEY="${'abcdefghijk' + 'lmnopqrstuv'}"\n`);
  commit(d, 'http.ts', `fetch(u, { headers: { Authorization: 'Bearer ${ghToken}' } });\n`);
  commit(d, 'docs/klucze.md', `| klucz | wartość |\n|---|---|\n| klucz | ${ghToken} |\n`);
  const r = scan(d);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^a\.env\.ts:1$/m);
  assert.match(r.stdout, /^http\.ts:1$/m);
  assert.match(r.stdout, /^docs\/klucze\.md:3$/m);
  noLeak(r, 'abcdefghijklmnopqrstuv', ghToken, ghToken.slice(4, 14), '| klucz |');
});

test('pliki .env w podkatalogach są wykrywane; *.example nie', () => {
  const d = repo();
  commit(d, 'apps/web/.env.example', 'API_URL=\n');
  let r = scan(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  commit(d, 'apps/web/.env', 'PORT=3000\n');
  r = scan(d);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /apps\/web\/\.env$/m);
  assert.match(r.stderr, /pliki kluczy/);
  commit(d, 'apps/web/.env', null);
  commit(d, 'services/api/.env.production', 'PORT=3000\n');
  r = scan(d);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /services\/api\/\.env\.production/);
});

test('wzorce: apiKey (YAML/camelCase), JSON, DB_PASSWORD z dwukropkiem; bez fałszywych trafień', () => {
  const cases = [
    ['config.yml', `apiKey: "${val}"\n`],
    ['config.json', `{"apiKey": "${val}"}\n`],
    ['compose.yml', `  DB_PASSWORD: "${val}"\n`],
    ['client.ts', `const clientSecret = '${val}';\n`],
  ];
  for (const [file, content] of cases) {
    const d = repo();
    commit(d, file, content);
    const r = scan(d);
    assert.equal(r.status, 1, `${file}: ${content}`);
    assert.match(r.stdout, new RegExp(`^${file.replace('.', '\\.')}:1$`, 'm'));
    noLeak(r, val);
  }
  const d = repo();
  commit(d, 'ok.ts', [
    'const cfg = { apiKey: process.env.X, password: "" };',
    'apiKey: process.env.API_KEY',
    'password: ""',
    'DB_PASSWORD: ${DB_PASSWORD}',
    'const tokenizer = "bert-base-uncased-model";',
    'Authorization: Bearer <token>',
  ].join('\n') + '\n');
  const r = scan(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('znacznik SYNTH w ścieżce pliku nie wycisza trafień; w treści linii — tak', () => {
  const d = repo();
  commit(d, 'tests/SYNTH-fixtures/a.ts', `const t = "${ghToken}";\n`);
  let r = scan(d);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /SYNTH-fixtures\/a\.ts:1/);
  commit(d, 'tests/SYNTH-fixtures/a.ts', `const t = "${ghToken}"; // SYNTH\n`);
  r = scan(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('tryb domyślny: indeks i drzewo robocze (sekret w indeksie poprawiony tylko w drzewie też jest trafieniem)', () => {
  const d = repo();
  commit(d, 'a.ts', 'ok\n');
  put(d, 'a.ts', `const t = "${ghToken}";\n`);
  git(d, 'add', 'a.ts');
  put(d, 'a.ts', 'ok\n');
  let r = scan(d);
  assert.equal(r.status, 1, 'indeks idzie do commita');
  git(d, 'add', 'a.ts');
  put(d, 'new.ts', `const t = "${ghToken}";\n`);
  r = scan(d);
  assert.equal(r.status, 1, 'nieśledzony, nieignorowany plik trafi do repo przez git add -A');
  assert.match(r.stdout, /^new\.ts:1$/m);
  writeFileSync(join(d, '.gitignore'), 'new.ts\n');
  r = scan(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test('--staged: tylko linie dodane w indeksie; --range: sekret dodany i usunięty w zakresie', () => {
  const d = repo();
  commit(d, 'a.ts', 'ok\n');
  put(d, 'a.ts', `ok\nconst t = "${ghToken}";\n`);
  git(d, 'add', 'a.ts');
  let r = scan(d, '--staged');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^a\.ts:2$/m);
  noLeak(r, ghToken);
  git(d, 'commit', '-qm', 'sekret');
  commit(d, 'a.ts', 'ok\n');
  assert.equal(scan(d).status, 0, 'drzewo czyste');
  assert.equal(scan(d, '--staged').status, 0);
  r = scan(d, '--range', 'HEAD~2..HEAD');
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^[0-9a-f]{12}:a\.ts:2$/m);
  assert.equal(scan(d, '--range', 'HEAD~1..HEAD').status, 0);
  assert.equal(scan(d, '--range', 'nie-ma-takiej-rewizji').status, 2, 'błąd narzędzia ≠ czysto');
});

test('wzorce projektu z .workflow/secrets-patterns.txt działają w trybie --range i --staged', () => {
  const d = repo();
  commit(d, '.workflow/secrets-patterns.txt', 'zz_[A-Za-z0-9]{20,}\n');
  put(d, 'src.txt', 'x = ' + 'zz_' + 'A1b2C3d4E5f6G7h8I9j0K1\n');
  git(d, 'add', '-A');
  assert.equal(scan(d, '--staged').status, 1);
  git(d, 'commit', '-qm', 'token');
  assert.equal(scan(d, '--range', 'HEAD~1..HEAD').status, 1);
});

test('pre-push: sekret dodany i usunięty kolejnym commitem blokuje push; czysty push przechodzi', () => {
  const { d, remote } = pushRepo();
  let r = push(d, 'main');
  assert.equal(r.status, 0, 'czysty push: ' + r.stderr);

  commit(d, 'src/b.ts', `const t = "${ghToken}";\n`);
  commit(d, 'src/b.ts', null);
  r = push(d, 'main');
  assert.notEqual(r.status, 0, 'sekret w historii zakresu');
  assert.match(r.stderr, /push zablokowany/);
  assert.match(r.stdout + r.stderr, /src\/b\.ts:1/);
  noLeak(r, ghToken);
  assert.notEqual(git(remote, 'rev-parse', 'main'), git(d, 'rev-parse', 'main'), 'remote bez zmian');

  git(d, 'reset', '-q', '--hard', 'origin/main');
  commit(d, 'src/c.ts', 'export const y = 2;\n');
  r = push(d, 'main');
  assert.equal(r.status, 0, r.stderr);
});

test('pre-push: sekret w commicie poprawiony tylko w drzewie roboczym blokuje push', () => {
  const { d } = pushRepo();
  assert.equal(push(d, 'main').status, 0);
  commit(d, 'src/b.ts', `const t = "${ghToken}";\n`);
  put(d, 'src/b.ts', 'ok\n');
  const r = push(d, 'main');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /src\/b\.ts:1/);
});

test('pre-push: nowa gałąź skanuje tylko commity spoza remote; usunięcie gałęzi przechodzi', () => {
  const { d } = pushRepo();
  assert.equal(push(d, 'main').status, 0);
  git(d, 'checkout', '-qb', 'feat');
  commit(d, 'apps/web/.env', 'PORT=1\n');
  let r = push(d, 'feat');
  assert.notEqual(r.status, 0, 'plik env dodany w nowej gałęzi');
  assert.match(r.stdout, /apps\/web\/\.env/);
  git(d, 'reset', '-q', '--hard', 'main');
  commit(d, 'src/d.ts', 'export const z = 3;\n');
  r = push(d, 'feat');
  assert.equal(r.status, 0, r.stderr);
  r = push(d, '--delete', 'feat');
  assert.equal(r.status, 0, r.stderr);
});

test('wzorce: hasło ze znakami specjalnymi w cudzysłowie, YAML bez cudzysłowu, token w lockfile; placeholdery i adresy czyste', () => {
  const pw = 'correct' + '-horse!battery@staple';
  for (const [file, content] of [
    ['config/a.yml', `db:\n  password: "${pw}"\n`],
    ['config/b.yml', `service:\n  api_key: ${val}abcd\n`],
    ['config/c.yml', `db:\n  password: "correct.${pw}"\n`],
    ['config/d.yml', `service:\n  api_key: ${val}abcd # production\n`],
    ['config/e.yml', `db:\n  password: "correct:${pw}"\n`],
    ['package-lock.json', `{"resolved": "https://registry.example.com/x.tgz", "auth": "${ghToken}"}\n`],
  ]) {
    const d = repo(); commit(d, file, content);
    const r = scan(d);
    assert.equal(r.status, 1, `${file}: ${r.stdout}${r.stderr}`); noLeak(r, pw, val, ghToken);
  }
  const d = repo();
  commit(d, 'config/ok.yml', [
    'password: "${DB_PASSWORD}"', 'api_key: "<twój-klucz-api>"', 'secret: "****************"',
    'token: "https://auth.example.com/oauth/token"', "token: 'user:alice/co-a'", 'password: "https://user@host.example.com/x"', 'apiKey: process.env.API_KEY', 'password: ""', 'token_url: https://example.com/a/b/c',
  ].join('\n') + '\n');
  const r = scan(d);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
