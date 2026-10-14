#!/usr/bin/env node
// Hook PreToolUse (ScheduleWakeup | CronCreate): egzekwuje pętlę sterowaną stanem (PRC-15, PRC-16).
// 1) Prompt wybudzenia MUSI być stałym poleceniem ticku („uruchom `node .workflow/bin/tick.mjs` i wykonaj wskazane kroki”,
//    dopuszczalnie z `--plan <plik>`) albo poleceniem ukośnikowym („/…”) — prompt z dopisanym stanem zadań
//    przeterminuje się przed wybudzeniem.
// 2) Gdy tick zwraca KONIEC (kod 4), NIE WOLNO planować kolejnego wybudzenia — zatrzymaj pętlę.
// Zatrzymanie pętli (ScheduleWakeup z `stop: true`) przechodzi zawsze. Blokada = kod 2 + powód na stderr (widzi go model).
// Przy błędzie wejścia hook przepuszcza (fail-open) — nie blokuje narzędzia z powodu własnej awarii.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

let input = {};
try { input = JSON.parse(readFileSync(0, 'utf8') || '{}'); } catch { process.exit(0); }
const ti = input.tool_input ?? {};
if (ti.stop === true) process.exit(0);
const prompt = String(ti.prompt ?? '').trim();
const root = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
const TICK_PROMPT = 'uruchom `node .workflow/bin/tick.mjs` i wykonaj wskazane kroki';
const block = (msg) => { process.stderr.write(`Zablokowane przez strażnika pętli: ${msg}\n`); process.exit(2); };

// Porównanie po normalizacji (wielkość liter, cudzysłowy, odstępy, kropka na końcu) — dopisek stanu nie przejdzie.
const norm = prompt.toLowerCase().replace(/[`'"„”]/g, '').replace(/\s+/g, ' ').replace(/\.$/, '').trim();
const TICK_RE = /^(uruchom )?node \.workflow\/bin\/tick\.mjs( --plan [^\s;&|]+)?( i wykonaj wskazane kroki)?$/;
if (!prompt.startsWith('/') && !TICK_RE.test(norm)) {
  block(`prompt wybudzenia musi być stały: „${TICK_PROMPT}” — NIE wpisuj do niego stanu zadań ani listy kroków, bo przeterminuje się przed wybudzeniem (PRC-15).`);
}

const tick = join(root, '.workflow', 'bin', 'tick.mjs');
if (existsSync(tick)) {
  const r = spawnSync('node', [tick, '--no-rules'], { cwd: root, encoding: 'utf8', timeout: 15000, env: { ...process.env, WORKFLOW_ROOT: root } });
  if (r.status === 4) block('tick zwraca KONIEC — nie planuj kolejnego wybudzenia; zatrzymaj pętlę i daj raport PO (PRC-16).');
}
process.exit(0);
