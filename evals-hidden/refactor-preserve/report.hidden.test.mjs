import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';
import { buildReport as original } from './original-report.mjs';

// The reference runs here, in the trusted process; the candidate runs in its own process. Each gets an
// independent copy of every input, and the candidate's copy is compared with the input after the call.
const c = candidate();
const refactored = c.module('src/report.mjs');

// Deterministic pseudo-random orders (mulberry32), dense around the discount thresholds and half-cent rounding.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AMOUNTS = [0, 1, 5, 99, 100, 101, 1250, 49999, 50000, 50001, 50010, 99999, 100000, 100005, 250015, 33333];
const CUSTOMERS = ['zeta', 'acme', 'Beta', 'beta', 'mueller', 'ALPHA'];

function orders(next) {
  const count = Math.floor(next() * 8);
  return Array.from({ length: count }, () => ({
    customer: CUSTOMERS[Math.floor(next() * CUSTOMERS.length)],
    amountCents: next() < 0.6 ? AMOUNTS[Math.floor(next() * AMOUNTS.length)] : Math.floor(next() * 150000),
    ...(next() < 0.25 ? { refunded: true } : {}),
  }));
}

function same(input, options, label) {
  const { value, args } = c.observe(refactored.buildReport, structuredClone(input), options);
  assert.equal(value, original(structuredClone(input), options), label);
  assert.deepEqual(args[0], input, `${label}: the candidate changed its input`);
}

test('the exported API is kept', () => {
  assert.equal(typeof refactored.buildReport, 'function');
});

test('output is identical to the original and the input is untouched, for edge inputs', () => {
  const cases = [
    [],
    [{ customer: 'a', amountCents: 50000 }],
    [{ customer: 'a', amountCents: 100000 }],
    [{ customer: 'a', amountCents: 49999 }, { customer: 'a', amountCents: 1 }],
    [{ customer: 'a', amountCents: 100005 }],
    [{ customer: 'a', amountCents: 700, refunded: true }],
    [{ customer: 'b', amountCents: 10 }, { customer: 'b', amountCents: 999, refunded: true }],
    [{ customer: 'zeta', amountCents: 10 }, { customer: 'acme', amountCents: 20 }, { customer: 'zeta', amountCents: 5, refunded: true }],
    [{ customer: 'a', amountCents: 0 }],
  ];
  for (const input of cases) {
    for (const options of [undefined, {}, { currency: 'USD' }, { currency: 'EUR' }, { currency: 'GBP' }]) {
      same(input, options, JSON.stringify({ input, options }));
    }
  }
});

test('output is identical and the input untouched for 400 generated order lists, many with customers out of order', () => {
  const next = rng(424242);
  let unsorted = 0;
  for (let i = 0; i < 400; i += 1) {
    const input = orders(next);
    const names = input.map((o) => o.customer);
    if (names.some((name, k) => k > 0 && name < names[k - 1])) unsorted += 1;
    same(input, [undefined, { currency: 'EUR' }, { currency: 'USD' }][i % 3], `generated #${i}`);
  }
  assert.ok(unsorted >= 100, `only ${unsorted} inputs had customers out of order`);
});
