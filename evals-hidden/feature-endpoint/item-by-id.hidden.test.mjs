import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const { handle } = candidate().module('src/app.mjs');
const get = (url) => handle({ method: 'GET', url });
const body = (res) => JSON.parse(res.body);

test('a known id answers 200 with that item as JSON', () => {
  const res = get('/items/2');
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/json');
  assert.deepEqual(body(res), { id: 2, name: 'Rope, 20 m', priceCents: 1599 });
});

test('the query string is ignored, as on the other routes', () => {
  const res = get('/items/3?fields=name');
  assert.equal(res.status, 200);
  assert.equal(body(res).id, 3);
});

test('an unknown id answers 404 with the not-found error', () => {
  const res = get('/items/99');
  assert.equal(res.status, 404);
  assert.deepEqual(body(res), { error: 'not found' });
});

for (const id of ['abc', '0', '-1', '1.5', '%20']) {
  test(`id "${id}" is not a positive integer: 400 invalid id`, () => {
    const res = get(`/items/${id}`);
    assert.equal(res.status, 400);
    assert.deepEqual(body(res), { error: 'invalid id' });
  });
}

test('another method on an item answers 405 and allows GET, like the existing routes', () => {
  const res = handle({ method: 'DELETE', url: '/items/2' });
  assert.equal(res.status, 405);
  assert.match(res.headers.allow, /\bGET\b/);
});

test('the existing routes still answer', () => {
  assert.equal(get('/health').status, 200);
  assert.equal(body(get('/items')).length, 3);
  assert.equal(get('/nope').status, 404);
});
