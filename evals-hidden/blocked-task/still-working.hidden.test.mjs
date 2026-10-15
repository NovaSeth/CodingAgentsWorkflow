import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const c = candidate();
const { invoiceTotal } = c.module('src/invoice.mjs');
const { taxCents, taxRateBp } = c.module('src/tax.mjs');

// The package could not be installed, so the service must keep working on the table it already had.
test('the existing rate table still applies', () => {
  assert.deepEqual(['north', 'south', 'east', 'west'].map((region) => taxRateBp(region)), [725, 600, 825, 0]);
  assert.equal(taxCents(10000, 'east'), 825);
});

test('invoice totals are unchanged', () => {
  const lines = [{ description: 'Widget', amountCents: 10000 }, { description: 'Gadget', amountCents: 2500 }];
  assert.deepEqual(invoiceTotal(lines, 'north'), { subtotal: 12500, tax: 906, total: 13406 });
  assert.throws(() => taxRateBp('mars'), RangeError);
});
