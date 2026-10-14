// Testy hooków Claude Code z kitu: strażnik poleceń, wstrzykiwanie reguł, scalanie settings.json przez kreator.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = join(root, 'kit/.claude/hooks/guard-bash.mjs');
const CTX = join(root, 'kit/.claude/hooks/workflow-context.mjs');
const SETUP = join(root, 'scripts/setup.mjs');
const hook = (file, input, env = {}) => spawnSync('node', [file], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, ...env } });
const bash = (command, env) => hook(GUARD, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, env);

test('strażnik: blokuje polecenia łamiące reguły (kod 2, powód z ID reguły)', () => {
  for (const [cmd, id] of [
    ['git stash', 'PUL-14'], ['git stash push -m x', 'PUL-14'],
    ['bash .workflow/bin/check-secrets.sh | tail -1', 'BZP-16'],
    ['git push origin HEAD:main', 'PUL-17'],
    ['git push --force origin main', 'PUL-48'], ['git push origin main -f', 'PUL-48'], ['git push --force-with-lease origin master', 'PUL-48'],
    ['git commit -m x --no-verify', 'BZP-46'], ['git push --no-verify', 'BZP-46'],
    ['bash -c "git stash"', 'PUL-14'], ["sh -c 'git push --force origin main'", 'PUL-48'], ['eval "git stash pop"', 'PUL-14'],
    // obejścia: opcje globalne gita, cytowanie, powłoki z opcjami, przekierowania przed potokiem, refspec, hooksPath, -n
    ['git -C /x stash', 'PUL-14'], ['git -c user.name=x stash', 'PUL-14'], ["git 'stash'", 'PUL-14'], ['git st"as"h', 'PUL-14'],
    ["git $'\\x73tash'", 'PUL-14'], ['/usr/bin/git --no-pager --git-dir=.git stash pop', 'PUL-14'], ['FOO=1 env git stash', 'PUL-14'],
    ['bash -lc "git stash"', 'PUL-14'], ['bash --norc -c "git stash"', 'PUL-14'], ['bash -ec "eval \'git stash\'"', 'PUL-14'],
    ['echo $(git stash)', 'PUL-14'], ['( cd x && git stash )', 'PUL-14'], ["bash <<'EOF'\ngit stash\nEOF", 'PUL-14'], ['bash <<< "git stash"', 'PUL-14'],
    ['git commit -F - <<EOF\nzakaz `git stash`\nEOF', 'PUL-14'],
    ['bash .workflow/bin/check-secrets.sh 2>&1 | tail -3', 'BZP-16'], ['.workflow/bin/check-secrets.sh |& tee log', 'BZP-16'],
    ['{ bash .workflow/bin/check-secrets.sh; } | tail -1', 'BZP-16'], ['(bash .workflow/bin/check-secrets.sh) 2>&1 | cat', 'BZP-16'],
    ['git push origin feat/x:main', 'PUL-17'], ['git push origin HEAD:refs/heads/main', 'PUL-17'],
    ['git push origin :master', 'PUL-17'], ['git push origin +main', 'PUL-48'], ['git push origin +feat/x:refs/heads/main', 'PUL-48'],
    ['git push -fu origin main', 'PUL-48'], ['git push --mirror origin', 'PUL-48'],
    ['git -c core.hooksPath=/dev/null push', 'BZP-46'], ['git commit -n -m x', 'BZP-46'], ['git commit -am x -n', 'BZP-46'], ['git commit -nm x', 'BZP-46'],
    ['git commit --no-verif -m x', 'BZP-46'], ['git config core.hooksPath /dev/null', 'BZP-46'], ['git rebase --no-verify main', 'BZP-46'],
  ]) {
    const r = bash(cmd);
    assert.equal(r.status, 2, cmd); assert.match(r.stderr, new RegExp(id), cmd);
  }
});

test('strażnik: przepuszcza dozwolone polecenia (kod 0)', () => {
  for (const cmd of ['git stash list', 'bash .workflow/bin/check-secrets.sh; echo $?', 'git push -u origin HEAD', 'git push origin feat/x --force',
    'git commit -m "opis --no-verify w treści?"', 'npm test', 'git merge --no-ff feat/x',
    // fałszywe alarmy: dane (wiadomość, heredoc, wzorzec) i operatory inne niż potok
    'git commit -m "docs: opis eval, zakaz git stash"', "git commit -F - <<'EOF'\nfix: zakaz git stash; git push --force origin main\nEOF",
    "git commit -m \"$(cat <<'EOF'\nfix: don't use git stash (PUL-14)\nEOF\n)\"", 'git log --grep stash', 'git stash show -p',
    'git commit -m -n', 'git push -u origin HEAD', 'git push origin feat/main-menu', 'git push origin main:feat/x',
    'bash .workflow/bin/check-secrets.sh || echo blad', 'bash .workflow/bin/check-secrets.sh && git push -u origin HEAD',
    'bash .workflow/bin/check-secrets.sh > out.txt 2>&1; tail -3 out.txt', 'grep -n x .workflow/bin/check-secrets.sh | head',
    'git config core.hooksPath .githooks', 'echo "git stash" | wc -l', 'bash -c "echo \'git stash\'"']) {
    const r = bash(cmd);
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`);
  }
});

test('strażnik: wzorce projektu z .workflow/guard-extra.txt', () => {
  const d = mkdtempSync(join(tmpdir(), 'guard-')); mkdirSync(join(d, '.workflow'));
  writeFileSync(join(d, '.workflow/guard-extra.txt'), '# komentarz\n\\bnpm\\s+publish\\b\tPublikacja wymaga decyzji człowieka (ZAS-20).\n');
  const r = bash('npm publish', { CLAUDE_PROJECT_DIR: d });
  assert.equal(r.status, 2); assert.match(r.stderr, /ZAS-20/);
  assert.equal(bash('npm test', { CLAUDE_PROJECT_DIR: d }).status, 0);
});

test('strażnik: błąd parsowania → przepuszcza bez wywrócenia procesu', () => {
  for (const cmd of ['echo "niedomknięte', "git commit -m 'x", 'echo $(niedomknięte', 'cat <<EOF\nbez końca', ')))((']) {
    const r = bash(cmd);
    assert.equal(r.status, 0, `${cmd}: ${r.stderr}`); assert.equal(r.stderr, '');
  }
  assert.equal(spawnSync('node', [GUARD], { input: 'nie-json', encoding: 'utf8' }).status, 0);
});

function project() {
  const d = join(mkdtempSync(join(tmpdir(), 'ctx-')), 'p');
  const r = spawnSync('node', [SETUP, '--yes', '--mode', 'new', '--path', d, '--stack', 'inny', '--author', 'AB', '--no-commit'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return d;
}

test('kontekst: kompakcja → JSON additionalContext z procedurą wznowienia, regułami „zawsze” i stanem z tick', () => {
  const d = project();
  const r = hook(join(d, '.claude/hooks/workflow-context.mjs'), { hook_event_name: 'SessionStart', source: 'compact', cwd: d }, { CLAUDE_PROJECT_DIR: d });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SessionStart');
  assert.match(out.additionalContext, /procedura wznowienia/);
  assert.match(out.additionalContext, /^\*\*ZAS-6\.\*\*/m);
  assert.match(out.additionalContext, /TICK .* — AKCJA/); assert.match(out.additionalContext, /START/);
  assert.ok(out.additionalContext.length <= 6200);
  const start = JSON.parse(hook(join(d, '.claude/hooks/workflow-context.mjs'), { hook_event_name: 'SessionStart', source: 'startup' }, { CLAUDE_PROJECT_DIR: d }).stdout).hookSpecificOutput;
  assert.doesNotMatch(start.additionalContext, /procedura wznowienia\)/);
});

test('kontekst: subagent → krótkie reguły wykonawcy', () => {
  const r = hook(CTX, { hook_event_name: 'SubagentStart', agent_type: 'implementer' });
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'SubagentStart');
  assert.match(out.additionalContext, /NEEDS_CONTEXT/); assert.match(out.additionalContext, /rules\.mjs/);
  assert.ok(out.additionalContext.length < 1200);
  const rv = JSON.parse(hook(CTX, { hook_event_name: 'SubagentStart', agent_type: 'reviewer' }).stdout).hookSpecificOutput.additionalContext;
  assert.match(rv, /Tylko odczyt/); assert.doesNotMatch(rv, /TDD|commit na krok/, 'recenzent nie dostaje reguł implementera');
});

test('kreator: hooki dołączone do istniejącego .claude/settings.json bez utraty ustawień; ponownie — bez duplikatów', () => {
  const d = join(mkdtempSync(join(tmpdir(), 'set-')), 'p'); mkdirSync(join(d, '.claude'), { recursive: true });
  spawnSync('git', ['init', '-q', d]);
  writeFileSync(join(d, '.claude/settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm test)'] }, hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'echo mój' }] }] } }));
  const run = () => spawnSync('node', [SETUP, '--yes', '--mode', 'existing', '--path', d, '--stack', 'inny', '--author', 'AB'], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  let s = JSON.parse(readFileSync(join(d, '.claude/settings.json'), 'utf8'));
  assert.deepEqual(s.permissions, { allow: ['Bash(npm test)'] });
  assert.equal(s.hooks.PreToolUse.length, 3); // grupa użytkownika + Bash + ScheduleWakeup|CronCreate
  assert.ok(s.hooks.SessionStart && s.hooks.SubagentStart);
  assert.equal(run().status, 0);
  s = JSON.parse(readFileSync(join(d, '.claude/settings.json'), 'utf8'));
  assert.equal(s.hooks.PreToolUse.length, 3, 'bez duplikatów');
  assert.equal(s.hooks.SessionStart.length, 1);
});

test('strażnik: zwykły push main → main przechodzi w trybie solo (ZAS-2), w zespole blokowany (PUL-17)', () => {
  const solo = mkdtempSync(join(tmpdir(), 'g-solo-')); mkdirSync(join(solo, '.workflow'));
  writeFileSync(join(solo, '.workflow/config.json'), '{"multiDev": false}');
  assert.equal(bash('git push origin main', { CLAUDE_PROJECT_DIR: solo }).status, 0);
  assert.equal(bash('git push origin HEAD:main', { CLAUDE_PROJECT_DIR: solo }).status, 2, 'inna gałąź na main zawsze blokowana');
  const team = mkdtempSync(join(tmpdir(), 'g-team-')); mkdirSync(join(team, '.workflow'));
  writeFileSync(join(team, '.workflow/config.json'), '{"multiDev": true}');
  const r = bash('git push origin main', { CLAUDE_PROJECT_DIR: team });
  assert.equal(r.status, 2); assert.match(r.stderr, /PUL-17/);
});

test('strażnik: push bez refspec / z HEAD liczy bieżącą gałąź; git config set|unset; find -exec', () => {
  const repo = mkdtempSync(join(tmpdir(), 'g-branch-'));
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: repo });
  const at = (command, env) => hook(GUARD, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: repo }, env);
  for (const [cmd, id] of [['git push -f', 'PUL-48'], ['git push --force origin', 'PUL-48'], ['git push origin +HEAD', 'PUL-48'],
    ['git push --force-with-lease', 'PUL-48'], ['git push -f origin @', 'PUL-48'], ['git push --all --force origin', 'PUL-48'],
    ['git config set core.hooksPath /dev/null', 'BZP-46'], ['git config unset core.hooksPath', 'BZP-46'],
    ['find . -name x -exec git stash \\;', 'PUL-14'], ['find . -execdir git push --force origin main {} +', 'PUL-48']]) {
    const r = at(cmd); assert.equal(r.status, 2, cmd); assert.match(r.stderr, new RegExp(id), cmd);
  }
  // solo: zwykły push main → main dozwolony (ZAS-2); zespół: blokowany
  for (const cmd of ['git push', 'git push origin HEAD', 'git push -u origin HEAD', 'git config set core.hooksPath .githooks', 'find . -exec echo {} +']) {
    assert.equal(at(cmd).status, 0, cmd);
  }
  const team = mkdtempSync(join(tmpdir(), 'g-team2-')); mkdirSync(join(team, '.workflow'));
  writeFileSync(join(team, '.workflow/config.json'), '{"multiDev": true}');
  for (const cmd of ['git push', 'git push origin HEAD', 'git push --all origin']) {
    const r = at(cmd, { CLAUDE_PROJECT_DIR: team }); assert.equal(r.status, 2, cmd); assert.match(r.stderr, /PUL-17/, cmd);
  }
  // aliasy gita (z -c i z konfiguracji repo), -c doklejone, nazwa polecenia ze zmiennej
  spawnSync('git', ['config', 'alias.pub', 'push --force origin main'], { cwd: repo });
  spawnSync('git', ['config', 'alias.sst', '!git stash'], { cwd: repo });
  for (const [cmd, id] of [['git -c alias.p="push --force origin main" p', 'PUL-48'], ['git pub', 'PUL-48'], ['git sst', 'PUL-14'],
    ['git -ccore.hooksPath=/dev/null commit -m ok', 'BZP-46'], ['g=git; "$g" push --force origin main', 'PUL-48'], ['G="git stash"; $G', 'PUL-14']]) {
    const r = at(cmd); assert.equal(r.status, 2, cmd); assert.match(r.stderr, new RegExp(id), cmd);
  }
  for (const cmd of ['git -c alias.lg="log --oneline" lg', 'x=1; echo $x', `sh -c 'echo "check-secrets.sh"' | cat`]) assert.equal(at(cmd).status, 0, cmd);
  assert.equal(at(`sh -c 'bash .workflow/bin/check-secrets.sh' | cat`).status, 2);
  // łańcuch poleceń: gałąź i katalog zmienione wcześniej w tym samym poleceniu; alias powłokowy w repo z -C
  const feat = mkdtempSync(join(tmpdir(), 'g-feat-'));
  spawnSync('git', ['init', '-q', '-b', 'feat', feat]);
  const fromFeat = (command) => hook(GUARD, { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, cwd: feat });
  // po zmianie stanu w łańcuchu (cd, switch, nieudany switch, alias, podpowłoka) gałąź jest niepewna → jak main
  spawnSync('git', ['config', 'alias.sw', 'switch'], { cwd: feat });
  for (const cmd of ['git switch main && git push -f', 'git checkout main; git push --force', `cd ${repo} && git push -f`,
    'cd "$X" && git push -f', 'git switch missing; git push -f',
    'cd "/tmp/$DEST" && git push -f', 'git sw main && git push -f', 'git switch -c feat/y && git push -f']) {
    const r = fromFeat(cmd); assert.equal(r.status, 2, cmd); assert.match(r.stderr, /jawny refspec/, cmd);
  }
  assert.match(fromFeat(`git -C ${repo} sst`).stderr, /PUL-14/, 'alias powłokowy w repo z -C');
  // z main: cd w powłoce potomnej / podpowłoce nie przenosi rodzica; nieudany switch nie zmienia gałęzi
  for (const cmd of ["sh -c 'cd /tmp'; git push -f", `(cd ${feat}); git push -f`, 'git switch missing; git push -f', `cd ${feat} && cd ${repo} && git push -f`]) {
    assert.equal(at(cmd).status, 2, cmd);
  }
  assert.equal(at(`cd ${feat} && git push -f`).status, 0, 'cd do repo na gałęzi roboczej — push tej gałęzi');
  for (const cmd of ['git push -f', 'git switch -c feat/y && git push -f origin feat/y', "g=git; '$g' stash", 'g=git; "\\$g" stash',
    'npm test && git push -f', 'bash -c "npm test" && git push -f', 'git checkout -- main.c && git push -f',
    'git -c alias.lg="log --oneline" lg && git push -f', 'cd . && git push -f', "sh -c 'cd /tmp' && git push -f"]) {
    assert.equal(fromFeat(cmd).status, 0, cmd);
  }
  // gałąź robocza: push bez refspec i wymuszony push własnej gałęzi przechodzą
  spawnSync('git', ['switch', '-q', '-c', 'feat/x'], { cwd: repo });
  for (const cmd of ['git push', 'git push -f', 'git push -u origin HEAD']) assert.equal(at(cmd, { CLAUDE_PROJECT_DIR: team }).status, 0, cmd);
});

const SCHED = join(root, 'kit/.claude/hooks/guard-schedule.mjs');
const sched = (tool, tool_input, env) => hook(SCHED, { hook_event_name: 'PreToolUse', tool_name: tool, tool_input }, env);

test('strażnik pętli: prompt wybudzenia stały (tick.mjs) albo polecenie /… — prompt ze stanem blokowany (PRC-15)', () => {
  const d = project(); // świeży projekt → tick START (nie KONIEC)
  const env = { CLAUDE_PROJECT_DIR: d };
  assert.equal(sched('ScheduleWakeup', { delaySeconds: 1200, prompt: 'uruchom `node .workflow/bin/tick.mjs` i wykonaj wskazane kroki' }, env).status, 0);
  assert.equal(sched('CronCreate', { cron: '7 * * * *', prompt: '/loop' }, env).status, 0);
  for (const prompt of ['node .workflow/bin/tick.mjs', 'Uruchom node .workflow/bin/tick.mjs i wykonaj wskazane kroki.',
    'uruchom `node .workflow/bin/tick.mjs --plan docs/plans/a.md` i wykonaj wskazane kroki']) {
    assert.equal(sched('ScheduleWakeup', { delaySeconds: 1200, prompt }, env).status, 0, prompt);
  }
  for (const [tool, input] of [
    ['ScheduleWakeup', { delaySeconds: 1200, prompt: 'Sprawdź agentów P2; jeśli skończyli — recenzja, scalenie, push' }],
    ['CronCreate', { cron: '7 * * * *', prompt: 'sprawdź czy implementer skończył zadanie P1' }],
    ['ScheduleWakeup', { delaySeconds: 1200, prompt: 'uruchom node .workflow/bin/tick.mjs; potem zrób P5 i P6, bo recenzja r2 przeszła' }],
  ]) {
    const r = sched(tool, input, env);
    assert.equal(r.status, 2, tool); assert.match(r.stderr, /PRC-15/);
  }
  assert.equal(sched('ScheduleWakeup', { stop: true }, env).status, 0, 'zatrzymanie pętli zawsze dozwolone');
});

test('strażnik pętli: gdy tick zwraca KONIEC, kolejne wybudzenie blokowane (PRC-16)', () => {
  const d = project();
  writeFileSync(join(d, 'docs/plans/plan.md'), '# Plan\n### Zadanie P1: a\n');
  mkdirSync(join(d, '.workflow/tasks/P1'), { recursive: true });
  writeFileSync(join(d, '.workflow/tasks/P1/brief.md'), 'x');
  writeFileSync(join(d, '.workflow/progress.md'), '# L\nTask P1: dispatched\nTask P1: complete (ok)\nGate rdzen: done by AB @ 2026-10-13 10:00\n');
  writeFileSync(join(d, 'CLAUDE.md'), '# P\n');
  const env = { CLAUDE_PROJECT_DIR: d };
  const tickR = spawnSync('node', [join(d, '.workflow/bin/tick.mjs'), '--no-rules'], { cwd: d, encoding: 'utf8', env: { ...process.env, WORKFLOW_ROOT: d } });
  assert.equal(tickR.status, 4, tickR.stdout);
  const r = sched('ScheduleWakeup', { delaySeconds: 1200, prompt: 'uruchom `node .workflow/bin/tick.mjs` i wykonaj wskazane kroki' }, env);
  assert.equal(r.status, 2); assert.match(r.stderr, /KONIEC.*PRC-16/);
  assert.equal(sched('ScheduleWakeup', { stop: true }, env).status, 0);
});
