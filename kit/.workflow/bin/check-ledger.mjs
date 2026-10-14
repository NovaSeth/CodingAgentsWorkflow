#!/usr/bin/env node
// check-ledger.mjs — kontrola spójności plików zespołu (do CI i przed scaleniem).
//
//   node .workflow/bin/check-ledger.mjs [katalog-projektu]
//
// Sprawdza:
//   .workflow/progress.md   — każde ID rulingu (R<n>, R-<AUTOR>-<n>), zadania wspólnego (S…) i ustalenia
//                             bezpieczeństwa (SEC…) zdefiniowane najwyżej raz (merge=union nie wykrywa duplikatów);
//   .workflow/developers.txt — te same inicjały tylko u jednej osoby (jeden e-mail).
// Kody: 0 ok · 1 duplikaty (wypisane) · 2 brak ledgera, brak developers.txt w trybie zespołowym, błąd odczytu.
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..'));
const LEDGER = join(root, '.workflow/progress.md');
const DEVS = join(root, '.workflow/developers.txt');
const CONFIG = join(root, '.workflow/config.json');

const ID = String.raw`(R\d+[a-z]?|R-[A-Z0-9]+-\d+[a-z]?|SEC-\d+|SEC-[A-Z0-9]+-\d+|S\d+|S-[A-Z0-9]+-\d+)`;
const RULING = new RegExp(String.raw`^(?:[-*]\s+)?(?:\*\*)?Ruling\s+${ID}(?![\w-])`);
const ENTRY = new RegExp(String.raw`^[-*]\s+(?:\*\*)?${ID}(?![\w-])\s*\(`);

// Definicje ID w ledgerze: linia „- Ruling <ID> …” albo „- <S…|SEC…> (…)”; odwołania w treści się nie liczą.
export function ledgerDuplicates(text) {
  const seen = new Map();
  let inComment = false, inFence = false;
  text.split('\n').forEach((raw, i) => {
    let line = raw;
    if (/^```/.test(line)) { inFence = !inFence; return; }
    if (inFence) return;
    if (inComment) { const end = line.indexOf('-->'); if (end < 0) return; inComment = false; line = line.slice(end + 3); }
    line = line.replace(/<!--.*?-->/g, '');
    const open = line.indexOf('<!--');
    if (open >= 0) { inComment = true; line = line.slice(0, open); }
    const m = RULING.exec(line.trim()) ?? ENTRY.exec(line.trim());
    if (m) (seen.get(m[1]) ?? seen.set(m[1], []).get(m[1])).push(i + 1);
  });
  return [...seen].filter(([, lines]) => lines.length > 1).map(([id, lines]) => ({ id, lines }));
}

// Inicjały u więcej niż jednej osoby (różne e-maile). Powtórzony identyczny wpis (scalenie) nie jest błędem.
export function developerDuplicates(text) {
  const by = new Map();
  for (const line of text.split('\n')) {
    const m = /^([A-Z]{2,4}[0-9]?)\s.*<([^>]*)>/.exec(line.trim());
    if (!m) continue;
    (by.get(m[1]) ?? by.set(m[1], new Set()).get(m[1])).add(m[2].toLowerCase());
  }
  return [...by].filter(([, emails]) => emails.size > 1).map(([author, emails]) => ({ author, emails: [...emails] }));
}

function main() {
  if (!existsSync(LEDGER)) { console.error(`brak ledgera ${LEDGER}`); return 2; }
  let bad = 0;
  for (const d of ledgerDuplicates(readFileSync(LEDGER, 'utf8'))) {
    console.log(`duplikat ID ${d.id} w .workflow/progress.md (linie ${d.lines.join(', ')}) — nadaj nowy numer: .workflow/bin/ruling.sh`);
    bad++;
  }
  const multi = existsSync(CONFIG) && /"multiDev"\s*:\s*true/.test(readFileSync(CONFIG, 'utf8'));
  if (existsSync(DEVS)) {
    for (const d of developerDuplicates(readFileSync(DEVS, 'utf8'))) {
      console.log(`duplikat inicjałów ${d.author} w .workflow/developers.txt: ${d.emails.join(', ')} — jedna osoba wybiera inne (dev-setup.sh --author XY2)`);
      bad++;
    }
  } else if (multi) { console.error(`tryb zespołowy: brak ${DEVS}`); return 2; }
  if (bad) return 1;
  console.log('check-ledger: bez duplikatów');
  return 0;
}

// Uruchomiony jako skrypt (nie import w testach). realpath: na macOS /var → /private/var.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  try { process.exitCode = main(); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
