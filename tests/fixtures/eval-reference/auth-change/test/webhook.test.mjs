import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleWebhook } from '../src/webhook.mjs';

const SECRET = 'unit-key-1';
const env = { WEBHOOK_SECRET: SECRET };
const sign = (body) => createHmac('sha256', SECRET).update(body).digest('hex');
const post = (body, headers = {}) => ({ method: 'POST', headers, body });

test('accepts a signed JSON event', () => {
  const body = '{"type":"payment.settled"}';
  assert.equal(handleWebhook(post(body, { 'x-signature': sign(body) }), env).status, 202);
});

test('rejects malformed JSON that is signed', () => {
  assert.equal(handleWebhook(post('{', { 'x-signature': sign('{') }), env).status, 400);
});

test('rejects missing and wrong signatures', () => {
  assert.equal(handleWebhook(post('{}'), env).status, 401);
  assert.equal(handleWebhook(post('{}', { 'x-signature': 'abc' }), env).status, 401);
});

test('refuses everything while the secret is unset', () => {
  assert.equal(handleWebhook(post('{}', { 'x-signature': sign('{}') }), {}).status, 503);
});

test('only POST is accepted', () => {
  assert.equal(handleWebhook({ method: 'GET', headers: {}, body: '' }, env).status, 405);
});
