// Test architektury: granice modułów (rozstrzygający; ESLint to obrona w głąb).
// 1) moduł importuje inny moduł tylko przez jego index.ts, 2) src/platform nie importuje src/modules.
// Ma kontrolę samego siebie: znane naruszenia muszą zostać wykryte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const MODULES = join(SRC, 'modules');

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx|mts)$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

const IMPORT = /(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
export function specifiers(code: string): string[] {
  return [...code.matchAll(IMPORT)].map((m) => m[1] ?? m[2] ?? m[3] ?? '');
}

const moduleOf = (p: string) => {
  const rel = relative(MODULES, p);
  return rel.startsWith('..') ? null : rel.split(sep)[0] ?? null;
};

export function violation(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const target = resolve(dirname(fromFile), spec);
  const fromModule = moduleOf(fromFile);
  const toModule = moduleOf(target);
  if (relative(join(SRC, 'platform'), fromFile).startsWith('..') === false && toModule) return 'platforma importuje moduł';
  if (fromModule && toModule && fromModule !== toModule) {
    const inside = relative(join(MODULES, toModule), target);
    // '' = import katalogu (rozwiązuje się do index)
    if (inside !== '' && !/^index(\.ts)?$/.test(inside)) return `moduł ${fromModule} importuje wnętrze modułu ${toModule}`;
  }
  return null;
}

test('reguły wykrywają naruszenia (kontrola samego testu)', () => {
  const a = join(MODULES, 'a', 'service.ts');
  assert.match(violation(a, '../b/repo.ts') ?? '', /wnętrze modułu b/);
  assert.equal(violation(a, '../b/index.ts'), null);
  assert.equal(violation(a, '../b'), null);
  assert.equal(violation(a, './repo.ts'), null);
  assert.match(violation(join(SRC, 'platform', 'http.ts'), '../modules/a/index.ts') ?? '', /platforma/);
  assert.deepEqual(specifiers("import { x } from '../b/repo.ts';\nconst y = await import('./z.ts');"), ['../b/repo.ts', './z.ts']);
});

test('granice modułów są zachowane', () => {
  const bad = files(SRC).flatMap((f) =>
    specifiers(readFileSync(f, 'utf8')).map((s) => violation(f, s)).filter(Boolean).map((v) => `${relative(ROOT, f)}: ${v}`));
  assert.deepEqual(bad, []);
});
