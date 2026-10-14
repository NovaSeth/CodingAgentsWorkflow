// Testy spójności metody i tekstów kitu: struktura dla agentów, ID reguł, odwołania „plik §sekcja”, brak historii.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(root, 'docs');
const PREFIX = { '01': 'ZAS', '02': 'PRC', '03': 'DSC', '04': 'SPC', '05': 'KOD', '06': 'ORK', '07': 'RES', '08': 'REV', '09': 'BZP', '10': 'DSN', '11': 'MEM', '12': 'PUL', '13': 'WDR', '14': 'ZES', '16': 'RUN' };
const MAX_BYTES = 16 * 1024;
const RUNTIME = [/^\.workflow\/(config\.json|developers\.txt|budget\.(local\.)?env|budget\.mode|task-map\.json)$/, /^\.workflow\/(runs|tasks)\//,
  /^docs\/(specs|plans)\//, /^docs\/security\/przeglad-/, /^\.claude\/settings\.json$/, /^\.workflow\/routing\/(limits\.json)$/];

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const methodDocs = readdirSync(DOCS).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
const kitTexts = walk(join(root, 'kit')).filter((p) => /\.(md|template|sh|mjs|json|ya?ml|toml|py|ts)$/.test(p) || p.endsWith('pre-push'));

// Ścieżka zainstalowana w projekcie → plik w tym repo.
function toRepo(installed, fromFile) {
  const p = installed.replace(/^\.\//, '');
  if (/^\d\d-[\w-]+\.md$/.test(p)) return join(DOCS, p);
  const map = [
    [/^docs\/workflow\/metoda\//, 'docs/'],
    [/^docs\/workflow\//, 'kit/docs/workflow/'],
    [/^docs\/security\/przewodnik/, 'kit/docs/security/przewodnik'],
    [/^\.workflow\/templates\//, 'kit/templates/'],
    [/^\.workflow\/stacks\//, 'kit/stacks/'],
    [/^\.workflow\//, 'kit/.workflow/'],
    [/^\.claude\//, 'kit/.claude/'],
    [/^\.githooks\//, 'kit/.githooks/'],
  ];
  for (const [re, to] of map) if (re.test(p)) return join(root, p.replace(re, to));
  return null;
}
const headings = (file) => readFileSync(file, 'utf8').split('\n').filter((l) => /^#{1,4} /.test(l)).map((l) => l.replace(/^#+\s*/, '').toLowerCase());

test('metoda: komplet dokumentów 00–14', () => {
  assert.ok(existsSync(join(DOCS, '00-indeks.md')), '00-indeks.md');
  assert.deepEqual(methodDocs.map((f) => f.slice(0, 2)), ['00', ...Object.keys(PREFIX).filter((k) => k !== '16').sort(), '15', '16']);
});

for (const f of methodDocs.filter((x) => PREFIX[x.slice(0, 2)])) {
  test(`${f}: mapa sekcji, ID reguł (jedna linia, ciągłe, bez duplikatów), rozmiar`, () => {
    const s = readFileSync(join(DOCS, f), 'utf8');
    const pre = PREFIX[f.slice(0, 2)];
    assert.match(s, /Mapa sekcji/i, 'brak bloku „Mapa sekcji”');
    assert.match(s, /^# \d\d\. /m, 'nagłówek „# NN. Tytuł”');
    const ids = [...s.matchAll(new RegExp(`^(?:[-*] )?\\*\\*${pre}-(\\d+)\\.\\*\\*`, 'gm'))].map((m) => Number(m[1]));
    assert.ok(ids.length >= 3, `za mało reguł ${pre}-n (${ids.length})`);
    assert.deepEqual(ids, ids.map((_, i) => i + 1), `${pre}: numeracja ciągła od 1 bez duplikatów`);
    const foreign = [...s.matchAll(/^(?:[-*] )?\*\*([A-Z]{3})-\d+\.\*\*/gm)].map((m) => m[1]).filter((p) => p !== pre);
    assert.deepEqual(foreign, [], 'definicje reguł z cudzym prefiksem');
    assert.ok(Buffer.byteLength(s) <= MAX_BYTES, `${Buffer.byteLength(s)} B > ${MAX_BYTES}`);
  });
}

test('brak historii i odwołań do innych projektów (docs, kit, README)', () => {
  const files = [...methodDocs.map((f) => join(DOCS, f)), ...kitTexts, join(root, 'README.md')];
  const bad = [];
  // Nazwy konkretnych projektów trzymaj poza repo: tests/zakazane-nazwy.local.txt (jedna nazwa na linię, plik w .gitignore).
  const local = join(root, 'tests/zakazane-nazwy.local.txt');
  const names = existsSync(local) ? readFileSync(local, 'utf8').split('\n').map((x) => x.trim()).filter((x) => x && !x.startsWith('#')) : [];
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  const re = new RegExp(['projekt(?:u|cie|em)? źródłow', 'w źródle', 'okazało się', ...names.map((x) => `\\b${esc(x)}\\b`)].join('|'), 'i');
  for (const p of files) readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (re.test(l)) bad.push(`${relative(root, p)}:${i + 1}: ${l.trim().slice(0, 100)}`); });
  assert.deepEqual(bad, []);
});

test('odwołania: wskazane pliki istnieją, a „§Sekcja” trafia w nagłówek', () => {
  const files = [...methodDocs.map((f) => join(DOCS, f)), ...kitTexts.filter((p) => /\.(md|template)$/.test(p))];
  const bad = [];
  for (const p of files) {
    const s = readFileSync(p, 'utf8');
    for (const m of s.matchAll(/`((?:docs|\.workflow|\.claude|\.githooks)\/[^`\s*<>{}]+|\d\d-[\w-]+\.md)`(?:\s*§\s*([^`|—\n+(),;<]+))?/g)) {
      // pliki powstające w projekcie w trakcie pracy (kreator, dev-setup, orkiestrator) — nie ma ich w kicie
      if (RUNTIME.some((re) => re.test(m[1]))) continue;
      const target = toRepo(m[1], p);
      if (!target) continue;
      if (/[*<>{}]/.test(m[1]) || m[1].endsWith('/')) continue;
      if (!existsSync(target)) { bad.push(`${relative(root, p)}: brak pliku ${m[1]}`); continue; }
      const sec = (m[2] || '').trim().toLowerCase().replace(/[.:]$/, '').trim();
      if (!sec || statSync(target).isDirectory()) continue;
      // Dokładne trafienie: pełna nazwa nagłówka (bez numeracji „1.”, „A.”); same numer/litera („§0”, „§F”) → nagłówek zaczynający się od „0.”/„F.”.
      const hs = headings(target);
      const plain = (h) => h.replace(/^(\d+|[a-z])\.\s+/, '').trim();
      const ok = /^(\d+|[a-z])$/.test(sec) ? hs.some((h) => h.startsWith(`${sec}.`)) : hs.some((h) => h === sec || plain(h) === sec);
      if (!ok) bad.push(`${relative(root, p)}: ${m[1]} §${m[2].trim()} — brak nagłówka`);
    }
  }
  assert.deepEqual(bad, []);
});

test('00 i 15: dokumenty referencyjne — mapa sekcji i rozmiar (router lekki)', () => {
  for (const [f, max] of [['00-indeks.md', 10 * 1024], ['15-slownik-skrypty-szablony.md', 14 * 1024]]) {
    const s = readFileSync(join(DOCS, f), 'utf8');
    assert.match(s, /Mapa sekcji/i, f);
    assert.ok(Buffer.byteLength(s) <= max, `${f}: ${Buffer.byteLength(s)} B > ${max}`);
  }
});

test('CLAUDE.md.template: mały (ładowany przy każdym starcie) i z mapą wiedzy', () => {
  const s = readFileSync(join(root, 'kit/CLAUDE.md.template'), 'utf8');
  assert.ok(Buffer.byteLength(s) <= 8 * 1024, `${Buffer.byteLength(s)} B (cel: twarde reguły + mapa wiedzy, MEM-42)`);
  assert.match(s, /## Mapa wiedzy/);
  assert.match(s, /00-indeks\.md/);
});
