#!/usr/bin/env node
// rules.mjs — treść reguł metody po ID (jedna reguła = jedna linia w docs/workflow/metoda/*.md).
//
//   node .workflow/bin/rules.mjs KOD-3 REV-17 …   → wypisz te reguły (pełne linie)
//   node .workflow/bin/rules.mjs --core            → reguły „zawsze” z .workflow/rules-core.txt (ID i linie własne projektu)
//
// Zamiast czytać dokument w całości (oszczędność kontekstu). Nieznane ID → linia „? ID: brak w metodzie”, kod 1.
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.WORKFLOW_ROOT ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const METODA = join(ROOT, 'docs', 'workflow', 'metoda');

export function loadRules(root = ROOT) {
  const dir = join(root, 'docs', 'workflow', 'metoda');
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      const m = line.match(/^(?:[-*] )?\*\*([A-Z]{3}-\d+)\.\*\*/);
      if (m) map.set(m[1], line.replace(/^[-*] /, '').trim());
    }
  }
  return map;
}
export const idsIn = (text) => [...new Set([...String(text).matchAll(/\b([A-Z]{3}-\d+)\b/g)].map((m) => m[1]))];

function main(argv) {
  const rules = loadRules();
  if (!rules.size) { console.error(`rules: brak metody w ${METODA}`); return 2; }
  let ids = argv.filter((a) => !a.startsWith('--'));
  const own = [];
  if (argv.includes('--core')) {
    const p = join(ROOT, '.workflow', 'rules-core.txt');
    if (!existsSync(p)) { console.error('rules: brak .workflow/rules-core.txt'); return 2; }
    for (const raw of readFileSync(p, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      if (/^[A-Z]{3}-\d+$/.test(line)) ids.push(line); else own.push(`- ${line.replace(/^-\s*/, '')}`);
    }
  }
  let missing = 0;
  for (const id of ids) {
    const r = rules.get(id);
    if (r) console.log(r); else { console.log(`? ${id}: brak w metodzie`); missing++; }
  }
  for (const l of own) console.log(l);
  return missing ? 1 : 0;
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
