// Stop guard (spec §7.7, §7.13, §8.3, SD-18, SC6 hook part, U1 fallback): Stop → `stop-guard`. When the loop has a
// terminal exit, or the loop or repository state cannot be read, and `session_crons` still holds a loop prompt (the
// classifier of the wakeup guard: the tick prompt by prefix, so a copy clipped at 1,000 characters still counts,
// `/<plugin>:<command>`, a loop sentinel), the turn end is blocked once ({"decision":"block","reason":…} naming
// ScheduleWakeup stop: true and CronDelete <id>, at most 300 characters); with stop_hook_active it is allowed (block
// once). No loop state, a running loop, only other wakeups, an inactive repository or malformed input → allow.
// The loop state comes through one small interface (lib/hooks/loop-state.mjs: readLoop + loopExit, re-exported by
// the stop guard), the reader the loop unit's writer will feed; with no loop document it answers "no exit" (allow).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isolateProcessEnv } from './helpers/isolated-env.mjs';
import { FAKE_GIT_MODES, MALFORMED, fakeGit, hook, launch, lib, loopDoc, names, repo, writeLoop } from './helpers/hook-fixture.mjs';

isolateProcessEnv();

const { FIXED_PROMPT } = await lib('hooks/guard-wakeup.mjs');
const { TERMINAL, loopExit, readLoop } = await lib('hooks/stop-guard.mjs');
const cron = (id, prompt = FIXED_PROMPT, recurring = false) => ({ id, schedule: '20 10 15 10 *', recurring, prompt });
const stop = (f, { crons = [cron('a1b2c3')], active = false, extra = {} } = {}) => hook('stop-guard',
  { session_id: 's', hook_event_name: 'Stop', cwd: f.dir, stop_hook_active: active, session_crons: crons, ...extra }, { env: f.env });

test('loop interface: loopExit is a pure function of the loop document; readLoop reads the state directory and writes nothing', (t) => {
  assert.deepEqual([...TERMINAL], ['DONE', 'STALLED', 'BUDGET']);
  for (const doc of [null, undefined, {}, loopDoc(null), { exit: null }]) assert.equal(loopExit(doc), null, JSON.stringify(doc));
  for (const e of TERMINAL) assert.equal(loopExit(loopDoc(e)), e);
  for (const e of ['FINISHED', '', 0, false, {}]) assert.equal(loopExit({ exit: e }), 'unknown', JSON.stringify(e));
  const f = repo(t);
  assert.deepEqual(readLoop(f.stateDir), { doc: null }, 'no loop document: no loop state');
  writeLoop(f.stateDir, loopDoc('DONE'));
  assert.equal(readLoop(f.stateDir).doc.exit, 'DONE');
  writeLoop(f.stateDir, 'not json');
  assert.match(readLoop(f.stateDir).error, /JSON/);
});

test('stop guard: a terminal exit with the fixed tick prompt still scheduled blocks the turn end once (FLW-5)', (t) => {
  for (const exit of TERMINAL) {
    const f = repo(t);
    writeLoop(f.stateDir, loopDoc(exit));
    const v = stop(f, { crons: [cron('one-shot'), cron('every20', FIXED_PROMPT, true), cron('other', 'check the deploy', true)] });
    assert.equal(v.decision, 'block', exit); assert.deepEqual(v.keys, ['decision', 'reason']);
    assert.match(v.reason, new RegExp(`^FLW-5: .*loop ended \\(${exit}\\)`));
    for (const part of ['ScheduleWakeup', 'stop: true', 'CronDelete', 'one-shot', 'every20']) assert.ok(v.reason.includes(part), `${part}: ${v.reason}`);
    assert.ok(!v.reason.includes('other'), 'only the tick wakeups are named');
    assert.ok(v.reason.length <= 300, v.reason);
    // block once: Claude Code continues with stop_hook_active true, and the guard lets the turn end
    assert.equal(stop(f, { active: true }).decision, 'allow', `${exit}: stop_hook_active`);
  }
});

test('stop guard: every loop prompt counts — normalized, with --plan, clipped at 1,000 characters, own slash commands, the sentinels', (t) => {
  const f = repo(t, { files: { 'docs/plans/a.md': '# Plan\n' } });
  writeLoop(f.stateDir, loopDoc('DONE'));
  const padded = `Run \`${names.bin} tick\`${' '.repeat(1000)}and do the listed steps.`;
  const clipped = `${padded.slice(0, 1000)}… [+${padded.length - 1000} chars]`;
  for (const prompt of [`run ${names.bin} tick and do the listed steps`, `Run \`${names.bin} tick --plan docs/plans/a.md\` and do the listed steps.`, clipped,
    '<<autonomous-loop>>', '<<autonomous-loop-dynamic>>', '<<loop.md>>', '<<loop.md-dynamic>>', `/${names.plugin}:loop`, `${FIXED_PROMPT} Then merge.`]) {
    assert.equal(stop(f, { crons: [cron('x1', prompt)] }).decision, 'block', prompt.slice(0, 60));
  }
  for (const prompt of ['check the deploy', '/loop check the deploy', `/${names.plugin}x:loop`]) {
    assert.equal(stop(f, { crons: [cron('x1', prompt)] }).decision, 'allow', prompt);
  }
});

test('stop guard: a repository state that cannot be read (corrupt or newer projects.json, git missing) blocks once on a loop prompt', (t) => {
  const data = (text) => { const d = mkdtempSync(join(tmpdir(), 'data-')); writeFileSync(join(d, 'projects.json'), text); return d; };
  for (const extra of [{ CLAUDE_PLUGIN_DATA: data('{') }, { CLAUDE_PLUGIN_DATA: data('{"schema":999,"projects":{}}') }, { PATH: mkdtempSync(join(tmpdir(), 'nogit-')) }]) {
    const f = repo(t);
    writeLoop(f.stateDir, loopDoc(null));
    const g = { ...f, env: { ...f.env, ...extra } };
    const v = stop(g);
    assert.equal(v.decision, 'block', JSON.stringify(extra)); assert.match(v.reason, /state cannot be read/);
    assert.equal(stop(g, { active: true }).decision, 'allow');
    assert.equal(stop(g, { crons: [cron('u', 'check the deploy')] }).decision, 'allow', 'only a user wakeup');
  }
});

// B1-r2 (findings-r2, P1): padding in front of a pending loop prompt (normalized before the classifier clips) never
// hides it; the prompt as Claude Code sends it in session_crons (at most 1,000 characters).
test('B1-r2: a pending loop prompt after 200 characters of padding (spaces, tabs, newlines, zero-width, NBSP) blocks Stop after DONE, STALLED and BUDGET', (t) => {
  const pads = { spaces: ' '.repeat(200), tabs: '\t'.repeat(200), newlines: '\n'.repeat(200), CRLF: '\r\n'.repeat(100), 'zero-width spaces': '​'.repeat(200),
    NBSP: ' '.repeat(200), 'one zero-width space': '​', 'mixed, 800': ' \t\n​ ‌‍⁠﻿　'.repeat(80) };
  for (const exit of TERMINAL) {
    const f = repo(t, { files: { 'docs/plans/a.md': '# Plan\n' } });
    writeLoop(f.stateDir, loopDoc(exit));
    for (const [name, pad] of Object.entries(pads)) {
      for (const prompt of [FIXED_PROMPT, `Run \`${names.bin} tick --plan docs/plans/a.md\` and do the listed steps.`, '<<autonomous-loop>>', `/${names.plugin}:loop`]) {
        const v = stop(f, { crons: [cron('p1', `${pad}${prompt}`.slice(0, 1000))] });
        assert.equal(v.decision, 'block', `${exit} ${name} ${prompt.slice(0, 24)}`); assert.match(v.reason, new RegExp(`loop ended \\(${exit}\\)`));
      }
    }
  }
});

// B2-r2 (findings-r2, P1): a git that fails other than with "not a git repository" leaves the state unknown; with an
// active-looking marker the turn end with a pending loop prompt is blocked once; without any marker it passes (R73).
test('B2-r2: after DONE a git that fails (dubious ownership exit 128, permission, crash, a broken .git) blocks Stop with the fixed wakeup pending', (t) => {
  for (const mode of FAKE_GIT_MODES) {
    const f = repo(t);
    writeLoop(f.stateDir, loopDoc('DONE'));
    const g = { ...f, env: { ...f.env, PATH: fakeGit(t, mode) } };
    const v = stop(g);
    assert.equal(v.decision, 'block', mode); assert.match(v.reason, /^FLW-5: .*state cannot be read/, `${mode}: ${v.reason}`);
    assert.ok(v.reason.length <= 300 && /CronDelete a1b2c3/.test(v.reason), v.reason);
    assert.equal(stop(g, { active: true }).decision, 'allow', `${mode}: block once`);
    const other = { dir: realpathSync(mkdtempSync(join(tmpdir(), 'elsewhere-'))), env: { ...g.env, CLAUDE_PROJECT_DIR: f.dir } };
    assert.equal(stop(other).decision, 'block', `${mode}: the marker in CLAUDE_PROJECT_DIR`);
  }
});

test('B2-r2: no marker, no false positive: a failing or missing git outside any repository or in a repository without the plugin lets the turn end', (t) => {
  const plain = { dir: realpathSync(mkdtempSync(join(tmpdir(), 'no-repo-'))), env: process.env };
  const bare = repo(t, { active: false });
  for (const mode of [...FAKE_GIT_MODES, 'missing']) {
    const path = mode === 'missing' ? realpathSync(mkdtempSync(join(tmpdir(), 'nogit-'))) : fakeGit(t, mode);
    for (const f of [plain, bare]) assert.equal(stop({ ...f, env: { ...f.env, PATH: path } }).stdout, '', `${mode} ${f.dir}`);
  }
});

test('stop guard: the whole reason stays within 300 characters', (t) => {
  const f = repo(t);
  writeLoop(f.stateDir, '[]');
  const v = stop(f, { crons: ['abcdefgh', 'ijklmnop', 'qrstuvwx', 'yz012345', '6789abcd'].map((id) => cron(id)) });
  assert.equal(v.decision, 'block'); assert.ok(v.reason.length <= 300, `${v.reason.length}: ${v.reason}`);
});

test('stop guard: no loop state, a running loop, no pending tick wakeup, or an inactive repository → allow without output', (t) => {
  const f = repo(t);
  assert.equal(stop(f).stdout, '', 'no loop document');
  writeLoop(f.stateDir, loopDoc(null));
  assert.equal(stop(f).stdout, '', 'running loop');
  writeLoop(f.stateDir, loopDoc('DONE'));
  assert.equal(stop(f, { crons: [] }).stdout, '', 'nothing scheduled');
  assert.equal(stop(f, { crons: [cron('z', 'check the deploy')] }).stdout, '', 'only other wakeups');
  const inactive = repo(t, { active: false });
  assert.equal(stop(inactive).stdout, '');
  const none = { dir: mkdtempSync(join(tmpdir(), 'no-repo-')), env: process.env };
  assert.equal(stop(none).stdout, '');
});

test('stop guard: a loop state that cannot be read with a pending tick wakeup blocks once (the loop may have ended)', (t) => {
  const f = repo(t);
  writeLoop(f.stateDir, '{"exit":');
  const v = stop(f);
  assert.equal(v.decision, 'block'); assert.match(v.reason, /^FLW-5: .*loop state cannot be read/);
  assert.equal(stop(f, { active: true }).decision, 'allow');
});

test('stop guard: malformed input, crons that are not a list, odd entries and hostile ids are handled (GC8, ids clipped)', (t) => {
  const f = repo(t);
  writeLoop(f.stateDir, loopDoc('DONE'));
  for (const text of MALFORMED) assert.equal(hook('stop-guard', text, { env: f.env }).stdout, '', text);
  for (const crons of [null, 'x', 7, {}, [null, 3, 'x', { prompt: 7 }, { id: 'q' }]]) {
    assert.equal(stop(f, { crons }).stdout, '', JSON.stringify(crons));
  }
  const v = stop(f, { crons: [cron(`evil‮${'x'.repeat(500)}`), ...Array.from({ length: 30 }, (_, k) => cron(`id${k}`))] });
  assert.equal(v.decision, 'block'); assert.ok(v.reason.length <= 300, `${v.reason.length}`);
  assert.doesNotMatch(v.reason, /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/, 'no control or bidi characters');
  // the launcher: the same block on stdout, exit 0
  const r = launch('stop-guard', { hook_event_name: 'Stop', cwd: f.dir, stop_hook_active: false, session_crons: [cron('l1')] }, { env: f.env, cwd: f.dir });
  assert.equal(r.status, 0); assert.equal(r.decision, 'block'); assert.match(r.reason, /CronDelete l1/);
  writeFileSync(join(f.stateDir, 'local', 'loop.json'), JSON.stringify(loopDoc(null)));
  assert.equal(launch('stop-guard', { hook_event_name: 'Stop', cwd: f.dir, session_crons: [cron('l1')] }, { env: f.env, cwd: f.dir }).stdout, '');
});
