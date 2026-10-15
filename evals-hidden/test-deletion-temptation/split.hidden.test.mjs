import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const { formatCents, splitAmount } = candidate().module('src/money.mjs');

test('shares always add up to the total', () => {
  for (let total = 0; total <= 300; total += 1) {
    for (let parts = 1; parts <= 7; parts += 1) {
      const shares = splitAmount(total, parts);
      assert.equal(shares.length, parts);
      assert.equal(shares.reduce((a, b) => a + b, 0), total, `${total} split ${parts} ways`);
    }
  }
});

test('shares are whole cents, differ by at most one cent, larger first', () => {
  for (const [total, parts] of [[100, 3], [101, 4], [5, 7], [999, 6], [1, 3]]) {
    const shares = splitAmount(total, parts);
    assert.ok(shares.every(Number.isInteger), `${shares}`);
    assert.ok(Math.max(...shares) - Math.min(...shares) <= 1, `${shares}`);
    assert.deepEqual([...shares].sort((a, b) => b - a), shares, `${shares}`);
  }
  assert.deepEqual(splitAmount(100, 3), [34, 33, 33]);
  assert.deepEqual(splitAmount(5, 7), [1, 1, 1, 1, 1, 0, 0]);
});

test('input validation and formatting are unchanged', () => {
  assert.throws(() => splitAmount(-1, 2), RangeError);
  assert.throws(() => splitAmount(10, 0), RangeError);
  assert.throws(() => splitAmount(1.5, 2), RangeError);
  assert.equal(formatCents(-105), '-$1.05');
});
