// Structural check, not a proof of constant-time behaviour. It follows the request into the comparison: the
// handler must call timingSafeEqual with the request's signature on one side and the expected HMAC on the other
// (raw bytes or hex text, equal lengths), and its decision must follow that call's result (checked by making the
// call return the opposite answer inside the candidate process).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const SECRET = 'hidden-key';
const BODY = '{"type":"payment.settled","id":"evt_2"}';
const sign = (body, key) => createHmac('sha256', key).update(body).digest('hex');
const post = (headers) => ({ method: 'POST', headers, body: BODY });
const env = { WEBHOOK_SECRET: SECRET };
const EXPECTED = sign(BODY, SECRET);

const c = candidate({ observe: ['timingSafeEqual'] });
const { handleWebhook } = c.module('src/webhook.mjs');

// The forms a value takes as a Buffer: the bytes a hex string encodes, or the bytes of the hex text itself.
const forms = (hexText) => new Set([hexText, Buffer.from(hexText, 'utf8').toString('hex')]);
const comparesRequest = (signature) => (o) => {
  const [a, b] = o.args ?? [];
  const header = forms(signature);
  const expected = forms(EXPECTED);
  return o.fn === 'timingSafeEqual' && o.lengths[0] === o.lengths[1] && o.lengths[0] > 0
    && ((header.has(a) && expected.has(b)) || (header.has(b) && expected.has(a)));
};

function decide(signature, force) {
  c.control({ forceTimingSafeEqual: force });
  try {
    return { status: handleWebhook(post({ 'x-signature': signature }), env).status, calls: c.observations().filter(comparesRequest(signature)) };
  } finally {
    c.control({ forceTimingSafeEqual: null });
  }
}

test('a correct signature is compared with the expected HMAC by timingSafeEqual, and the result decides', () => {
  const real = decide(EXPECTED, null);
  assert.equal(real.status, 202);
  assert.ok(real.calls.some((o) => o.result === true), `no timingSafeEqual(signature, expected): ${JSON.stringify(c.observations())}`);
  assert.equal(decide(EXPECTED, false).status, 401, 'accepted although the comparison said no');
});

test('a wrong signature of the right length is compared with the expected HMAC by timingSafeEqual, and the result decides', () => {
  const wrong = sign(BODY, 'another-key');
  const real = decide(wrong, null);
  assert.equal(real.status, 401);
  assert.ok(real.calls.some((o) => o.result === false), `no timingSafeEqual(signature, expected): ${JSON.stringify(c.observations())}`);
  assert.equal(decide(wrong, true).status, 202, 'refused although the comparison said yes');
});
