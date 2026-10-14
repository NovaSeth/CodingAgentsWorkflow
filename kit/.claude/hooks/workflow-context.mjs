#!/usr/bin/env node
// Hook SessionStart (startup | resume | compact) i SubagentStart: wstrzykuje do kontekstu przypomnienie procesu.
// - sesja główna: reguły „zawsze” (.workflow/rules-core.txt) + aktualny stan i następne kroki (tick.mjs) + co zrobić po kompakcji;
// - subagent: krótkie reguły wykonawcy (brief, reguły po ID, bez subagentów, bez git stash, raport do pliku).
// Wyjście: JSON hookSpecificOutput.additionalContext (Claude Code dokłada go jako przypomnienie systemowe).
// Rozmiar ograniczony (domyślnie 6000 znaków, CONTEXT_MAX), bo to stały koszt kontekstu.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const MAX = Number(process.env.CONTEXT_MAX ?? 6000);
let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { /* brak wejścia = sesja główna */ }
const event = input.hook_event_name ?? 'SessionStart';
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const bin = (f) => join(root, '.workflow', 'bin', f);
// Błąd uruchomienia albo przekroczony czas → pusty tekst (stdout bywa wtedy null); hook nie może się wywrócić.
const run = (f, args) => (existsSync(bin(f)) ? String(spawnSync('node', [bin(f), ...args], { cwd: root, encoding: 'utf8', timeout: 8000, env: { ...process.env, WORKFLOW_ROOT: root } }).stdout ?? '').trim() : '');

let text;
if (event === 'SubagentStart') {
  // Role tylko do odczytu (recenzja, bezpieczeństwo, QA) nie dostają reguł implementera (TDD, commity).
  const role = String(input.agent_type ?? '').toLowerCase();
  const readOnly = ['reviewer', 'security', 'qa'].includes(role);
  text = [
    `## Przypomnienie dla wykonawcy (CodingAgentsWorkflow)${role ? ` — ${role}` : ''}`,
    '- Najpierw przeczytaj swoją definicję roli (`.claude/agents/<rola>.md`) i brief ze zlecenia; wartości z briefu bierz dosłownie.',
    '- Reguły metody czytaj po ID z briefu: `node .workflow/bin/rules.mjs KOD-3 REV-17` — nie ładuj całych dokumentów.',
    ...(readOnly ? [
      '- Tylko odczyt: nie zmieniasz plików poza plikiem wyniku z briefu, nie commitujesz; każde ustalenie z wagą, miejscem `plik:linia` i dowodem.',
      '- Bez `git stash`; nie uruchamiasz subagentów.',
    ] : [
      '- Zmieniasz tylko pliki z zakresu briefu; brak we wspólnym kontrakcie / platformie = status NEEDS_CONTEXT, nie łatka.',
      '- TDD: test czerwony przed zmianą; commit na krok; `check-secrets.sh` bez potoku; bez `git stash`; nie uruchamiasz subagentów.',
    ]),
    '- Wynik do pliku z briefu (z sekcją „Kontekst”); w odpowiedzi tylko 5 linii statusu.',
  ].join('\n');
} else {
  const source = input.source ?? 'startup';
  const parts = [`## Przypomnienie procesu (CodingAgentsWorkflow) — ${source}`];
  if (source === 'compact' || source === 'resume') {
    parts.push('Kontekst był skompresowany albo sesja wznowiona: zanim zlecisz cokolwiek, wykonaj `docs/workflow/podrecznik-orkiestratora.md` §0 (procedura wznowienia) i zapisz w ledgerze, jak wznowiono.');
  }
  const core = run('rules.mjs', ['--core']);
  if (core) parts.push('### Reguły zawsze\n' + core);
  const tick = run('tick.mjs', []);
  if (tick) parts.push('### Stan i następne kroki (`node .workflow/bin/tick.mjs`)\n' + tick);
  parts.push('Reguła po ID: `node .workflow/bin/rules.mjs <ID>`; mapa wiedzy: `CLAUDE.md` §Mapa wiedzy.');
  text = parts.join('\n\n');
}
if (text.length > MAX) text = text.slice(0, MAX) + '\n… (ucięte — pełny stan: `node .workflow/bin/tick.mjs`)';
process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));
