// Testy kreatora (setup.mjs) i narzędzi zespołowych: ruling.sh, claim.sh, dev-setup.sh, merge=union.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, appendFileSync, mkdirSync, chmodSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SETUP = join(root, 'scripts/setup.mjs');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
const git = (d, ...a) => execFileSync('git', ['-C', d, ...a], { encoding: 'utf8' }).trim();
const tmp = (p = 'caw-') => mkdtempSync(join(tmpdir(), p));
// Atrapa npm na PATH: testy nie sięgają do sieci; `npm install --package-lock-only` zapisuje minimalny lockfile.
const fakeNpm = (body) => { const b = tmp('caw-bin-'); writeFileSync(join(b, 'npm'), `#!/bin/sh\n${body}\n`); chmodSync(join(b, 'npm'), 0o755); return b; };
const NPM_OK = fakeNpm('echo \'{"lockfileVersion":3}\' > package-lock.json');
const envWith = (bin, extra = {}) => ({ ...process.env, PATH: `${bin}:${process.env.PATH}`, ...extra });
const ENV = envWith(NPM_OK);
const setup = (...args) => run('node', [SETUP, '--yes', ...args], { env: ENV });
const update = (d, ...args) => run('node', [SETUP, '--update', '--path', d, ...args], { env: ENV });
const commitAll = (d, m = 'zmiany') => { git(d, 'add', '-A'); git(d, 'commit', '-qm', m); };
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'));

test('setup: nowy projekt TypeScript w zespole — szkielet, konfiguracja, CODEOWNERS, CI, ledger, commit', () => {
  const d = join(tmp(), 'sklep');
  const r = setup('--mode', 'new', '--path', d, '--name', 'Sklep Łódź', '--team', 'zespol', '--stack', 'typescript',
    '--owners', '@arch,@lead', '--areas', 'koszyk,platnosci', '--author', 'AB');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const f of ['CLAUDE.md', 'package.json', 'tsconfig.json', 'tests/architecture.test.ts', 'src/modules/README.md',
    '.workflow/bin/claim.sh', '.workflow/bin/ruling.sh', 'docs/workflow/zespol.md', '.github/CODEOWNERS',
    '.github/workflows/bramki.yml', '.github/pull_request_template.md', '.gitattributes', 'docs/specs/.gitkeep',
    'docs/workflow/metoda/05-jak-kodowac.md', 'docs/workflow/metoda/09-bezpieczenstwo.md', '.workflow/stacks/typescript/README.md']) {
    assert.ok(existsSync(join(d, f)), f);
  }
  const cfg = JSON.parse(readFileSync(join(d, '.workflow/config.json'), 'utf8'));
  assert.equal(cfg.level, 'standard');
  assert.equal(cfg.multiDev, true);
  assert.equal(cfg.path, undefined);
  assert.match(readFileSync(join(d, 'package.json'), 'utf8'), /"name": "sklep-lodz"/);
  const claude = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /^# Sklep Łódź/);
  assert.match(claude, /npm run typecheck && npm run lint && npm test/);
  assert.match(claude, /claim\.sh <pas>/);
  assert.doesNotMatch(claude, /\{\{[A-Z_]+\}\}/, 'wszystkie znaczniki wypełnione');
  assert.match(readFileSync(join(d, 'docs/workflow/zespol.md'), 'utf8'), /\| koszyk \| src\/modules\/koszyk\/ \|/);
  assert.match(readFileSync(join(d, '.github/CODEOWNERS'), 'utf8'), /\/src\/platform\/\s+@arch @lead/);
  const ci = readFileSync(join(d, '.github/workflows/bramki.yml'), 'utf8');
  assert.match(ci, /actions\/setup-node@[0-9a-f]{40}/);
  assert.match(ci, /run: npm run typecheck/);
  assert.match(ci, /check-secrets\.sh --range "origin\/\$BASE_REF\.\.HEAD"/, 'PR: skan commitów zakresu, nie tylko drzewa');
  assert.doesNotMatch(ci, /\{\{[A-Z_]+\}\}/);
  assert.match(readFileSync(join(d, '.workflow/progress.md'), 'utf8'), /Ruling R-AB-1 .*poziom standard, zespół zespol/);
  assert.equal(git(d, 'config', 'workflow.author'), 'AB');
  assert.equal(git(d, 'config', 'core.hooksPath'), '.githooks');
  assert.match(git(d, 'log', '--oneline'), /chore: start projektu Sklep Łódź/);
  assert.equal(git(d, 'status', '--porcelain'), '', 'drzewo czyste po pierwszym commicie');
  const sec = run('bash', [join(d, '.workflow/bin/check-secrets.sh')], { cwd: d });
  assert.equal(sec.status, 0, sec.stdout + sec.stderr);
});

test('setup: nowy projekt Python solo — pakiet z nazwy, router bez drugiego dostawcy przy poziomie full', () => {
  const d = join(tmp(), 'raporty');
  const r = setup('--mode', 'new', '--path', d, '--name', 'raporty-bi', '--stack', 'python', '--level', 'full', '--no-ui', '--no-discovery');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(existsSync(join(d, 'src/raporty_bi/modules/__init__.py')));
  assert.match(readFileSync(join(d, 'pyproject.toml'), 'utf8'), /root_package = "raporty_bi"/);
  assert.match(readFileSync(join(d, '.workflow/progress.md'), 'utf8'), /Ruling R1 /);
  const routing = JSON.parse(readFileSync(join(d, '.workflow/routing/routing.json'), 'utf8'));
  assert.equal(routing.providers.other, undefined);
  assert.ok(Object.values(routing.types).every((t) => t.candidates.length && t.candidates.every((c) => c.provider !== 'other')));
});

test('setup: dry-run niczego nie zapisuje; istniejący niepusty katalog przy mode=new → błąd', () => {
  const d = join(tmp(), 'x');
  let r = setup('--mode', 'new', '--path', d, '--dry-run');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(d));
  assert.match(r.stdout, /DRY-RUN/);
  const e = tmp(); writeFileSync(join(e, 'plik.txt'), 'x');
  r = setup('--mode', 'new', '--path', e);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /nie jest pusty/);
  r = setup('--mode', 'existing', '--path', e, '--stack', 'rust');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /dozwolone/);
});

test('setup --answers: odpowiedzi z pliku (standard firmy)', () => {
  const d = join(tmp(), 'firmowy');
  const answers = join(tmp(), 'a.json');
  writeFileSync(answers, JSON.stringify({ mode: 'new', path: d, name: 'firmowy', team: 'duzy', stack: 'inny', ci: 'github', owners: '@org/arch', author: 'QA' }));
  const r = run('node', [SETUP, '--yes', '--answers', answers]);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const cfg = JSON.parse(readFileSync(join(d, '.workflow/config.json'), 'utf8'));
  assert.equal(cfg.level, 'full', 'duży zespół → poziom full');
  assert.match(readFileSync(join(d, '.github/workflows/bramki.yml'), 'utf8'), /TODO: polecenia bramki/);
});

test('ruling.sh: solo R<n>, zespół R-<AUTOR>-<n> z osobną serią na osobę; --next nic nie zapisuje', () => {
  const d = join(tmp(), 'z');
  setup('--mode', 'new', '--path', d, '--team', 'zespol', '--author', 'AA', '--stack', 'inny', '--no-commit');
  const rs = join(d, '.workflow/bin/ruling.sh');
  assert.equal(run('bash', [rs, '--next'], { cwd: d }).stdout.trim(), 'R-AA-2');
  assert.equal(run('bash', [rs, 'co', 'dlaczego', 'koszt'], { cwd: d }).stdout.trim(), 'R-AA-2');
  git(d, 'config', 'workflow.author', 'BB');
  assert.equal(run('bash', [rs, 'inna', 'decyzja', 'mały'], { cwd: d }).stdout.trim(), 'R-BB-1');
  assert.match(readFileSync(join(d, '.workflow/progress.md'), 'utf8'), /Ruling R-BB-1 .*: inna — decyzja — koszt błędu: mały\./);
  git(d, 'config', '--unset', 'workflow.author');
  const noAuthor = run('bash', [rs, 'a', 'b', 'c'], { cwd: d });
  assert.equal(noAuthor.status, 2);
  assert.match(noAuthor.stderr, /dev-setup/);
});

test('merge=union: dopisy do ledgera z dwóch gałęzi scalają się bez konfliktu', () => {
  const d = join(tmp(), 'u');
  setup('--mode', 'new', '--path', d, '--team', 'zespol', '--author', 'AA', '--stack', 'inny');
  const ledger = join(d, '.workflow/progress.md');
  git(d, 'checkout', '-q', '-b', 'pas-a'); appendFileSync(ledger, '- Ruling R-AA-2: a — a — a.\n'); git(d, 'commit', '-qam', 'a');
  git(d, 'checkout', '-q', 'main'); git(d, 'checkout', '-q', '-b', 'pas-b'); appendFileSync(ledger, '- Ruling R-BB-1: b — b — b.\n'); git(d, 'commit', '-qam', 'b');
  const m = run('git', ['-C', d, 'merge', '-q', '--no-edit', 'pas-a']);
  assert.equal(m.status, 0, m.stdout + m.stderr);
  const s = readFileSync(ledger, 'utf8');
  assert.match(s, /R-AA-2/); assert.match(s, /R-BB-1/); assert.doesNotMatch(s, /<<<<<<</);
});

test('claim.sh: atomowe zajęcie pasa na zdalnym repo, konflikt, lista, zwolnienie tylko przez właściciela', () => {
  const remote = join(tmp(), 'origin.git');
  execFileSync('git', ['init', '-q', '--bare', remote]);
  const d1 = join(tmp(), 'a'); const d2 = join(tmp(), 'b');
  setup('--mode', 'new', '--path', d1, '--team', 'zespol', '--author', 'AA', '--stack', 'inny');
  git(d1, 'remote', 'add', 'origin', remote); git(d1, 'push', '-q', 'origin', 'main');
  execFileSync('git', ['clone', '-q', remote, d2]);
  git(d2, 'config', 'workflow.author', 'BB');
  const claim = (d, ...a) => run('bash', [join(d, '.workflow/bin/claim.sh'), ...a], { cwd: d });
  let r = claim(d1, 'koszyk', 'start');
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /zajęto pas koszyk \(AA\)/);
  r = claim(d2, 'koszyk');
  assert.equal(r.status, 1); assert.match(r.stderr, /już zajęty: claim koszyk by AA/);
  assert.match(claim(d2, '--list').stdout, /koszyk\s+claim koszyk by AA .* — start/);
  r = claim(d2, '--release', 'koszyk');
  assert.equal(r.status, 1); assert.match(r.stderr, /należy do AA/);
  assert.equal(claim(d1, '--release', 'koszyk').status, 0);
  assert.equal(claim(d2, 'koszyk').status, 0, 'po zwolnieniu pas jest wolny');
  assert.equal(claim(d2, 'Zła Nazwa').status, 2);
});

test('dev-setup.sh: inicjały unikalne w zespole, progi maszyny w pliku lokalnym poza gitem', () => {
  const d = join(tmp(), 'dev');
  setup('--mode', 'new', '--path', d, '--team', 'zespol', '--author', 'AA', '--stack', 'inny');
  assert.ok(existsSync(join(d, '.workflow/budget.local.env')));
  assert.equal(git(d, 'check-ignore', '.workflow/budget.local.env'), '.workflow/budget.local.env');
  assert.match(readFileSync(join(d, '.workflow/developers.txt'), 'utf8'), /^AA /m);
  git(d, 'config', 'user.email', 'inny@example.com');
  const r = run('bash', [join(d, '.workflow/bin/dev-setup.sh'), '--author', 'AA', '--yes'], { cwd: d });
  assert.equal(r.status, 1, 'te same inicjały u innej osoby');
  assert.match(r.stderr, /zajęte/);
  const ok = run('bash', [join(d, '.workflow/bin/dev-setup.sh'), '--author', 'AA2', '--yes'], { cwd: d });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(git(d, 'config', 'workflow.author'), 'AA2');
});

test('setup --update: zastępuje pliki frameworka, nie rusza plików projektu ani plików zmienionych lokalnie, zapisuje ruling', () => {
  const d = join(tmp(), 'upd');
  assert.equal(setup('--mode', 'new', '--path', d, '--stack', 'typescript', '--level', 'standard', '--author', 'AB').status, 0);
  const kit = readJ(join(d, '.workflow/kit-files.json'));
  assert.match(kit.files['docs/workflow/metoda/05-jak-kodowac.md'], /^[0-9a-f]{64}$/, 'suma SHA-256 pliku frameworka');
  assert.match(kit.templates['CLAUDE.md'], /^[0-9a-f]{64}$/, 'suma szablonu pliku projektu');
  assert.equal(kit.files['CLAUDE.md'], undefined);
  const metoda = join(d, 'docs/workflow/metoda/05-jak-kodowac.md');
  const original = readFileSync(metoda, 'utf8');
  const brief = join(d, '.workflow/bin/brief.sh');
  const briefOriginal = readFileSync(brief, 'utf8');
  writeFileSync(metoda, 'moja wersja\n');
  unlinkSync(brief);
  writeFileSync(join(d, 'docs/workflow/lekcje.md'), 'moje lekcje\n');
  writeFileSync(join(d, 'CLAUDE.md'), 'moje reguły\n');
  commitAll(d);
  const created = readJ(join(d, '.workflow/config.json')).created;
  const r = update(d);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(readFileSync(metoda, 'utf8'), 'moja wersja\n', 'plik frameworka zmieniony lokalnie zostaje');
  assert.equal(readFileSync(metoda + '.kit-new', 'utf8'), original, 'nowa wersja obok jako .kit-new');
  assert.match(r.stdout, /Zmienione lokalnie[\s\S]*05-jak-kodowac\.md → .*05-jak-kodowac\.md\.kit-new/);
  assert.equal(readFileSync(brief, 'utf8'), briefOriginal, 'usunięty plik frameworka wraca');
  assert.equal(readFileSync(join(d, 'docs/workflow/lekcje.md'), 'utf8'), 'moje lekcje\n');
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), 'moje reguły\n');
  assert.ok(!existsSync(join(d, 'CLAUDE.workflow.md')));
  assert.ok(!existsSync(join(d, 'CLAUDE.md.kit-new')), 'szablon bez zmian → bez .kit-new');
  assert.doesNotMatch(r.stdout, /Następne kroki/, 'aktualizacja drukuje podsumowanie, nie kroki świeżej instalacji');
  assert.match(r.stdout, /Do zrobienia: .*kit-new/);
  const cfg = readJ(join(d, '.workflow/config.json'));
  assert.equal(cfg.created, created); assert.ok(cfg.updated); assert.equal(cfg.stack, 'typescript'); assert.equal(cfg.level, 'standard');
  assert.match(readFileSync(join(d, '.workflow/progress.md'), 'utf8'), /Ruling R2 .*Aktualizacja CodingAgentsWorkflow/);
  commitAll(d, 'aktualizacja');
  const again = update(d);
  assert.equal(again.status, 0, again.stderr);
  assert.doesNotMatch(readFileSync(join(d, '.workflow/progress.md'), 'utf8'), /Ruling R3 /, 'bez zmian → bez rulingu');
  assert.equal(git(d, 'status', '--porcelain', '--untracked-files=no'), '', 'aktualizacja bez zmian niczego nie zapisuje');
  assert.equal(run('node', [SETUP, '--update', '--path', tmp()]).status, 2, 'projekt bez config.json');
});

test('setup --update: brudne drzewo → kod 2 (chyba że --force); przestarzałe pliki; nowszy szablon pliku projektu; ruling przy zmianie wersji', () => {
  const d = join(tmp(), 'upd2');
  assert.equal(setup('--mode', 'new', '--path', d, '--stack', 'typescript', '--team', 'zespol', '--author', 'AB', '--owners', '@o').status, 0);
  appendFileSync(join(d, 'README.md'), 'zmiana\n');
  let r = update(d);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /niezacommitowane zmiany.*--force/s);
  assert.equal(update(d, '--force').status, 0, '--force pozwala na brudne drzewo');
  commitAll(d);
  // przestarzały plik frameworka i zmienione szablony plików projektu (CLAUDE.md, bramki.yml)
  writeFileSync(join(d, '.workflow/bin/stary.sh'), 'echo stary\n');
  const kp = join(d, '.workflow/kit-files.json');
  const kit = readJ(kp);
  kit.files['.workflow/bin/stary.sh'] = 'f'.repeat(64);
  kit.files['.workflow/bin/usuniety.sh'] = 'e'.repeat(64);
  kit.templates['CLAUDE.md'] = '0'.repeat(64);
  kit.templates['.github/workflows/bramki.yml'] = '0'.repeat(64);
  kit.kitVersion = '0.0.1';
  writeFileSync(kp, JSON.stringify(kit));
  writeFileSync(join(d, 'CLAUDE.md'), 'moje reguły\n');
  writeFileSync(join(d, '.github/workflows/bramki.yml'), 'name: moje\n');
  commitAll(d);
  r = update(d);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /Przestarzałe — nie ma ich w kicie, usuń ręcznie \(1\):\n  \.workflow\/bin\/stary\.sh/);
  assert.ok(existsSync(join(d, '.workflow/bin/stary.sh')), 'przestarzały plik nie jest usuwany');
  assert.match(r.stdout, /nowsza wersja szablonu: CLAUDE\.md\.kit-new, porównaj z CLAUDE\.md/);
  assert.match(r.stdout, /nowsza wersja szablonu: \.github\/workflows\/bramki\.yml\.kit-new, porównaj z \.github\/workflows\/bramki\.yml/);
  assert.match(readFileSync(join(d, 'CLAUDE.md.kit-new'), 'utf8'), /^# upd2/);
  assert.match(readFileSync(join(d, '.github/workflows/bramki.yml.kit-new'), 'utf8'), /check-ledger\.mjs/);
  assert.equal(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), 'moje reguły\n');
  assert.equal(readFileSync(join(d, '.github/workflows/bramki.yml'), 'utf8'), 'name: moje\n');
  assert.match(readFileSync(join(d, '.workflow/progress.md'), 'utf8'), /Ruling R-AB-2 .*Aktualizacja CodingAgentsWorkflow 0\.0\.1 → /);
  const after = readJ(kp);
  assert.notEqual(after.kitVersion, '0.0.1');
  assert.equal(after.files['.workflow/bin/usuniety.sh'], undefined, 'nieistniejący przestarzały plik znika z rejestru');
});

test('setup: linie warunkowe szablonów (poziom, UI) — brak odwołań do nieinstalowanych narzędzi', () => {
  const min = join(tmp(), 'min');
  assert.equal(setup('--mode', 'new', '--path', min, '--level', 'minimum', '--no-ui', '--stack', 'typescript', '--no-commit').status, 0);
  const c = readFileSync(join(min, 'CLAUDE.md'), 'utf8');
  const h = readFileSync(join(min, 'docs/workflow/podrecznik-orkiestratora.md'), 'utf8');
  for (const s of [c, h]) { assert.doesNotMatch(s, /<!--if:/); assert.doesNotMatch(s, /budget\.sh|route\.mjs|heavy\.sh/); }
  assert.doesNotMatch(c, /Platformy i urządzenie|screen-<id/);
  assert.match(h, /tabeli ról w `CLAUDE\.md`/);
  const full = join(tmp(), 'full');
  assert.equal(setup('--mode', 'new', '--path', full, '--level', 'full', '--ui', '--stack', 'typescript', '--no-commit').status, 0);
  const cf = readFileSync(join(full, 'CLAUDE.md'), 'utf8');
  assert.match(cf, /route\.mjs <typ>/); assert.match(cf, /budget\.sh/); assert.match(cf, /Platformy i urządzenie/);
  assert.doesNotMatch(readFileSync(join(full, 'docs/workflow/podrecznik-orkiestratora.md'), 'utf8'), /tabeli ról w `CLAUDE\.md`/);
});

test('setup: każda ścieżka wskazana w CLAUDE.md i podręczniku istnieje w projekcie (każdy poziom i cechy)', () => {
  const RUNTIME = /^\.workflow\/(config\.json|developers\.txt|budget\.|runs\/|tasks\/)|^docs\/(specs|plans)\//;
  for (const [level, team, ui] of [['minimum', 'solo', '--no-ui'], ['standard', 'zespol', '--ui'], ['full', 'duzy', '--ui']]) {
    const d = join(tmp(), level);
    assert.equal(setup('--mode', 'new', '--path', d, '--level', level, '--team', team, ui, '--stack', 'typescript', '--author', 'AB', '--no-commit').status, 0);
    for (const f of ['CLAUDE.md', 'docs/workflow/podrecznik-orkiestratora.md', '.workflow/briefs/wspolny-implementer.md']) {
      if (!existsSync(join(d, f))) continue;
      const missing = [...readFileSync(join(d, f), 'utf8').matchAll(/`((?:\.workflow|\.claude|\.githooks|docs)\/[^`\s*<>{}]+?)`/g)]
        .map((m) => m[1].replace(/\s.*$/, '')).filter((p) => !RUNTIME.test(p) && !p.endsWith('/') && !existsSync(join(d, p)));
      assert.deepEqual(missing, [], `${level}: ${f}`);
    }
  }
});

test('check-secrets: wzorce projektu z .workflow/secrets-patterns.txt; plik przetrwa setup --update', () => {
  const d = join(tmp(), 'pat');
  assert.equal(setup('--mode', 'new', '--path', d, '--stack', 'inny', '--author', 'AB').status, 0);
  appendFileSync(join(d, '.workflow/secrets-patterns.txt'), 'zz_[A-Za-z0-9]{20,}   # tokeny projektu\n');
  writeFileSync(join(d, 'src.txt'), 'token = ' + 'zz_' + 'A1b2C3d4E5f6G7h8I9j0K1\n');
  execFileSync('git', ['-C', d, 'add', '-A']);
  const r = run('bash', [join(d, '.workflow/bin/check-secrets.sh')], { cwd: d });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /src\.txt/);
  commitAll(d);
  assert.equal(update(d).status, 0);
  assert.match(readFileSync(join(d, '.workflow/secrets-patterns.txt'), 'utf8'), /zz_/, 'wzorce projektu zachowane');
});

test('tick.mjs instalowany od minimum; świeży projekt bez planu i zadań → AKCJA START (kod 0)', () => {
  const d = join(tmp(), 'tick');
  assert.equal(setup('--mode', 'new', '--path', d, '--level', 'minimum', '--stack', 'inny', '--no-commit').status, 0);
  const r = run('node', [join(d, '.workflow/bin/tick.mjs')], { cwd: d });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /START/);
  assert.match(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), /tick\.mjs/);
});

test('setup: nieczytelne .claude/settings.json (null, hooks nie-obiekt, zdarzenie nie-tablica, grupa bez hooks) → ostrzeżenie i settings.workflow.json', () => {
  const bad = ['null', '{"hooks": []}', '{"hooks": "x"}', '{"hooks": {"PreToolUse": {}}}', '{"hooks": {"SessionStart": [{"matcher": ""}]}}', '{"hooks": {"SessionStart": [null]}}', '{ zepsuty'];
  for (const content of bad) {
    const d = tmp(); git(d, 'init', '-q');
    mkdirSync(join(d, '.claude')); writeFileSync(join(d, '.claude/settings.json'), content);
    const r = setup('--mode', 'existing', '--path', d, '--stack', 'inny', '--author', 'AB', '--level', 'minimum');
    assert.equal(r.status, 0, `${content}: ${r.stderr}`);
    assert.match(r.stdout, /\.claude\/settings\.json: .*settings\.workflow\.json, scal ręcznie/, content);
    assert.equal(readFileSync(join(d, '.claude/settings.json'), 'utf8'), content, 'plik zespołu nietknięty');
    assert.ok(readJ(join(d, '.claude/settings.workflow.json')).hooks.PreToolUse, content);
    assert.ok(existsSync(join(d, '.workflow/bin/ruling.sh')), 'reszta instalacji przeszła');
  }
  const ok = tmp(); git(ok, 'init', '-q');
  mkdirSync(join(ok, '.claude')); writeFileSync(join(ok, '.claude/settings.json'), '{"model": "x", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "echo"}]}]}}');
  assert.equal(setup('--mode', 'existing', '--path', ok, '--stack', 'inny', '--author', 'AB', '--level', 'minimum').status, 0);
  const merged = readJ(join(ok, '.claude/settings.json'));
  assert.equal(merged.model, 'x'); assert.ok(merged.hooks.Stop); assert.ok(merged.hooks.SessionStart);
  assert.ok(!existsSync(join(ok, '.claude/settings.workflow.json')));
});

test('setup: config.json bez inicjałów; istniejący projekt bierze workflow.author z gita; PO bez wartości z gita', () => {
  const d = join(tmp(), 'cfg');
  assert.equal(setup('--mode', 'new', '--path', d, '--team', 'zespol', '--stack', 'inny', '--author', 'AB', '--owners', '@o').status, 0);
  const cfg = readJ(join(d, '.workflow/config.json'));
  assert.equal(cfg.author, undefined, 'config.json jest wspólny — bez inicjałów');
  assert.equal(cfg.po, '<PO>');
  git(d, 'config', 'workflow.author', 'CD');
  writeFileSync(join(d, '.workflow/config.json'), JSON.stringify({ ...cfg, author: 'ZZ' }, null, 2));
  commitAll(d);
  const r = setup('--mode', 'existing', '--path', d, '--team', 'zespol', '--stack', 'inny', '--level', 'full');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(git(d, 'config', 'workflow.author'), 'CD', 'inicjały z git config workflow.author, nie z config.json');
  assert.match(r.stdout, /dev-setup: CD/);
  commitAll(d);
  const u = update(d);
  assert.equal(u.status, 0, u.stderr);
  assert.equal(readJ(join(d, '.workflow/config.json')).author, undefined, '--update usuwa stary klucz author');
  assert.equal(git(d, 'config', 'workflow.author'), 'CD');
});

test('setup: inicjały domyślne z transliteracją i z jednego członu; błędne inicjały → kod 2 bez instalacji', () => {
  const name = (n) => {
    const g = join(tmp(), 'gitconfig');
    writeFileSync(g, `[user]\n\tname = ${n}\n\temail = x@example.com\n`);
    return { ...ENV, GIT_CONFIG_GLOBAL: g };
  };
  for (const [n, want] of [['Łukasz Żak', 'LZ'], ['Michał', 'MI'], ['Ewa Maria Śliwa-Ćwik', 'EMSC']]) {
    const d = join(tmp(), 'ini');
    const r = run('node', [SETUP, '--yes', '--mode', 'new', '--path', d, '--stack', 'inny', '--no-commit'], { env: name(n) });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(git(d, 'config', 'workflow.author'), want, n);
  }
  for (const bad of ['Ł', 'A', 'ABCDE', 'A1B']) {
    const d = join(tmp(), 'zle');
    const r = setup('--mode', 'new', '--path', d, '--stack', 'inny', '--author', bad);
    assert.equal(r.status, 2, bad);
    assert.match(r.stderr, /inicjały .* są nieprawidłowe/);
    assert.ok(!existsSync(d), 'nic nie zainstalowano');
  }
});

test('setup: flagi tak/nie nie pobierają następnego argumentu; --ui=nie; zła wartość → kod 2', () => {
  const d = join(tmp(), 'flagi');
  let r = setup('--mode', 'new', '--stack', 'inny', '--author', 'AB', '--no-commit', '--ui', d);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readJ(join(d, '.workflow/config.json')).ui, true, '--ui /ścieżka: ścieżka zostaje ścieżką');
  const e = join(tmp(), 'flagi2');
  r = setup('--mode', 'new', '--path', e, '--stack', 'inny', '--author', 'AB', '--ui=nie', '--discovery', '--commit=nie');
  assert.equal(r.status, 0, r.stderr);
  const cfg = readJ(join(e, '.workflow/config.json'));
  assert.equal(cfg.ui, false); assert.equal(cfg.discovery, true);
  assert.equal(run('git', ['-C', e, 'log']).status, 128, '--commit=nie → bez commitu');
  r = setup('--mode', 'new', '--path', join(tmp(), 'f3'), '--ui=moze');
  assert.equal(r.status, 2); assert.match(r.stderr, /ui: „moze” — dozwolone: tak, nie/);
});

test('setup: brak gita → kod 2 z komunikatem', () => {
  const r = run(process.execPath, [SETUP, '--yes', '--mode', 'new', '--path', join(tmp(), 'g')], { env: { ...process.env, PATH: tmp('caw-empty-') } });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /brak gita/);
});

test('install.sh: opcja bez wartości → kod 2 (bez zawieszenia)', () => {
  const sh = join(root, 'scripts/install.sh');
  for (const args of [['--level'], [tmp(), '--team'], ['--stack', '--force', tmp()]]) {
    const r = run('bash', [sh, ...args], { timeout: 10000 });
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /brak wartości/);
  }
});

test('setup: TypeScript — package-lock.json, CI z warunkowym npm ci/cache, ledger w CI, nazwy jobów, eslint ignoruje .claude', () => {
  const d = join(tmp(), 'ts');
  assert.equal(setup('--mode', 'new', '--path', d, '--stack', 'typescript', '--team', 'zespol', '--author', 'AB', '--owners', '@o').status, 0);
  assert.ok(existsSync(join(d, 'package-lock.json')), 'lockfile od pierwszego commitu');
  assert.match(git(d, 'ls-files'), /^package-lock\.json$/m);
  const ci = readFileSync(join(d, '.github/workflows/bramki.yml'), 'utf8');
  assert.match(ci, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
  assert.match(ci, /run: node \.workflow\/bin\/check-ledger\.mjs/);
  for (const job of ['bramki / proces', 'bramki / jakosc', 'bramki / wynik']) assert.match(ci, new RegExp(`name: ${job}\\n`), job);
  assert.match(ci, /if: \$\{\{ hashFiles\('package-lock\.json'\) != '' \}\}[\s\S]*cache: npm/);
  assert.match(ci, /if: \$\{\{ hashFiles\('package-lock\.json'\) == '' \}\}/);
  assert.match(ci, /if \[ -f package-lock\.json \]; then npm ci; else npm install/);
  assert.match(ci, /needs: \[proces, jakosc\]/);
  assert.match(readFileSync(join(d, 'eslint.config.mjs'), 'utf8'), /ignores: \[[^\]]*'\.claude'[^\]]*'\.workflow'|ignores: \[[^\]]*'\.workflow'[^\]]*'\.claude'/);
  assert.ok(existsSync(join(d, '.workflow/bin/check-ledger.mjs')), 'skrypt z kroku CI jest zainstalowany');
  // npm niedostępny / bez sieci → ostrzeżenie, instalacja przechodzi
  const e = join(tmp(), 'ts2');
  const r = run('node', [SETUP, '--yes', '--mode', 'new', '--path', e, '--stack', 'typescript', '--author', 'AB'], { env: envWith(fakeNpm('exit 1')) });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!existsSync(join(e, 'package-lock.json')));
  assert.match(r.stdout, /package-lock\.json nie powstał/);
});

test('setup: Python — cache pip z pyproject.toml', () => {
  const d = join(tmp(), 'py');
  assert.equal(setup('--mode', 'new', '--path', d, '--stack', 'python', '--ci', 'github', '--author', 'AB', '--no-commit').status, 0);
  const ci = readFileSync(join(d, '.github/workflows/bramki.yml'), 'utf8');
  assert.match(ci, /cache: pip\n\s+cache-dependency-path: pyproject\.toml/);
  assert.match(ci, /check-ledger\.mjs/);
});

test('setup: CODEOWNERS obejmuje konfigurację agentów i metodę; CLAUDE.md zespołu bez limitu agentów z jednej maszyny', () => {
  const d = join(tmp(), 'own');
  assert.equal(setup('--mode', 'new', '--path', d, '--stack', 'inny', '--team', 'zespol', '--level', 'standard', '--author', 'AB', '--owners', '@arch', '--no-commit').status, 0);
  const co = readFileSync(join(d, '.github/CODEOWNERS'), 'utf8');
  for (const p of ['/.claude/', '/.gitattributes', '/.workflow/rules-core.txt', '/.workflow/guard-extra.txt', '/.workflow/secrets-patterns.txt', '/docs/workflow/metoda/', '/.workflow/config.json']) {
    assert.match(co, new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}\\s+@arch$`, 'm'), p);
  }
  const claude = readFileSync(join(d, 'CLAUDE.md'), 'utf8');
  assert.match(claude, /limit z `\.workflow\/budget\.local\.env` \(AGENT_MAX\) tej maszyny/);
  assert.doesNotMatch(claude, /najwyżej \d agentów|: najwyżej \d;/);
  const solo = join(tmp(), 'solo');
  assert.equal(setup('--mode', 'new', '--path', solo, '--stack', 'inny', '--level', 'standard', '--author', 'AB', '--no-commit').status, 0);
  assert.match(readFileSync(join(solo, 'CLAUDE.md'), 'utf8'), /Agenci z testami naraz na maszynę: najwyżej \d;/);
});

test('setup: szablony design-system i discovery tylko z cechą ui / discovery', () => {
  const d = join(tmp(), 'bez');
  assert.equal(setup('--mode', 'new', '--path', d, '--stack', 'inny', '--level', 'standard', '--no-ui', '--no-discovery', '--author', 'AB', '--no-commit').status, 0);
  assert.ok(!existsSync(join(d, '.workflow/templates/design-system')));
  assert.ok(!existsSync(join(d, '.workflow/templates/discovery')));
  assert.doesNotMatch(readFileSync(join(d, 'CLAUDE.md'), 'utf8'), /templates\/discovery/);
  const z = join(tmp(), 'z');
  assert.equal(setup('--mode', 'new', '--path', z, '--stack', 'inny', '--level', 'minimum', '--ui', '--discovery', '--author', 'AB', '--no-commit').status, 0);
  assert.ok(existsSync(join(z, '.workflow/templates/design-system')));
  assert.ok(existsSync(join(z, '.workflow/templates/discovery')));
});

test('cecha backend: reguły idempotencji i dzierżawców w CLAUDE.md tylko z backendem', () => {
  const withB = join(tmp(), 'b1'); const without = join(tmp(), 'b2');
  assert.equal(setup('--mode', 'new', '--path', withB, '--stack', 'typescript', '--backend', '--author', 'AB', '--no-commit').status, 0);
  assert.equal(setup('--mode', 'new', '--path', without, '--stack', 'inny', '--no-backend', '--author', 'AB', '--no-commit').status, 0);
  assert.match(readFileSync(join(withB, 'CLAUDE.md'), 'utf8'), /Idempotency-Key/);
  const c = readFileSync(join(without, 'CLAUDE.md'), 'utf8');
  assert.doesNotMatch(c, /Idempotency-Key|dzierżawca i aktor/); assert.doesNotMatch(c, /<!--if:/);
});

test('setup: pliki systemowe z lokalnego klonu (.DS_Store, *.swp) nie trafiają do projektu; --no-lockfile bez npm', () => {
  const junk = [join(root, 'kit/templates/task/.DS_Store'), join(root, 'kit/templates/task/.brief.md.swp')];
  for (const j of junk) writeFileSync(j, 'x');
  try {
    const d = join(tmp(), 'p');
    const r = setup('--mode', 'new', '--path', d, '--name', 'p', '--stack', 'typescript', '--no-lockfile', '--no-commit', '--author', 'AB');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(!existsSync(join(d, '.workflow/templates/task/.DS_Store')) && !existsSync(join(d, '.workflow/templates/task/.brief.md.swp')));
    assert.ok(!existsSync(join(d, 'package-lock.json')), '--no-lockfile: bez npm install --package-lock-only');
    assert.doesNotMatch(readFileSync(join(d, '.workflow/kit-files.json'), 'utf8'), /DS_Store|\.swp/);
  } finally { for (const j of junk) unlinkSync(j); }
});
