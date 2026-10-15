import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const c = candidate();
const { run } = c.module('src/cli.mjs');
const { createStore } = c.module('src/store.mjs');

// Local noon, so the calendar day is the same in UTC and in the local zone (the evaluator sets TZ=UTC).
const NOW = new Date(2026, 5, 15, 12, 0, 0);
const lines = (text) => text.split('\n');

test('add stores a due date given at the end or before the title', () => {
  const store = createStore();
  assert.match(run(['add', 'Pay', 'rent', '--due', '2026-07-01'], store, NOW), /^added /);
  assert.match(run(['add', '--due', '2026-08-02', 'File', 'taxes'], store, NOW), /^added /);
  const listed = run(['list'], store, NOW);
  assert.ok(listed.includes('Pay rent (due 2026-07-01)'), listed);
  assert.ok(listed.includes('File taxes (due 2026-08-02)'), listed);
});

test('tasks without a due date render as before', () => {
  const store = createStore();
  run(['add', 'Buy', 'milk'], store, NOW);
  assert.equal(run(['list'], store, NOW), '[ ] #1 Buy milk');
});

for (const bad of ['2026-02-30', '2026-13-01', '2026-6-1', 'tomorrow', '']) {
  test(`an invalid due date "${bad}" is rejected and adds nothing`, () => {
    const store = createStore();
    const out = run(['add', 'Pay', 'rent', '--due', bad], store, NOW);
    assert.match(out, /^error:/, out);
    assert.equal(run(['list'], store, NOW), 'No tasks.');
  });
}

test('list --overdue shows open tasks due before today, not today or later, not done ones', () => {
  const store = createStore();
  run(['add', 'Old', 'bill', '--due', '2026-01-10'], store, NOW);
  run(['add', 'Due', 'today', '--due', '2026-06-15'], store, NOW);
  run(['add', 'Future', 'trip', '--due', '2026-12-31'], store, NOW);
  run(['add', 'Paid', 'bill', '--due', '2026-02-01'], store, NOW);
  run(['add', 'No', 'date'], store, NOW);
  run(['done', '4'], store, NOW);
  const out = lines(run(['list', '--overdue'], store, NOW));
  assert.equal(out.length, 1, out.join('\n'));
  assert.match(out[0], /#1 Old bill \(due 2026-01-10\)/);
});

test('now defaults to the current date', () => {
  const store = createStore();
  run(['add', 'Ancient', '--due', '2001-01-01'], store);
  run(['add', 'Far', 'future', '--due', '2999-01-01'], store);
  const out = run(['list', '--overdue'], store);
  assert.match(out, /Ancient/);
  assert.doesNotMatch(out, /Far future/);
});

test('done still works with due dates', () => {
  const store = createStore();
  run(['add', 'Pay', 'rent', '--due', '2026-07-01'], store, NOW);
  assert.match(run(['done', '1'], store, NOW), /^completed \[x\] #1 Pay rent/);
});
