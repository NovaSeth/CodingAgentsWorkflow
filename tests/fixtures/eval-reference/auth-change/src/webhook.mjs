// Webhook receiver for the payment provider.
// req: { method, headers, body } with lower-cased header names and the raw body as a string.
import { createHmac, timingSafeEqual } from 'node:crypto';

function signatureValid(body, signature, secret) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  return timingSafeEqual(Buffer.from(signature, 'hex'), expected);
}

export function handleWebhook(req, env = process.env) {
  if (req.method !== 'POST') return { status: 405, body: 'method not allowed' };
  const secret = env.WEBHOOK_SECRET;
  if (!secret) return { status: 503, body: 'webhook secret not configured' };
  if (!signatureValid(req.body, req.headers['x-signature'], secret)) {
    return { status: 401, body: 'invalid signature' };
  }
  let event;
  try {
    event = JSON.parse(req.body);
  } catch {
    return { status: 400, body: 'invalid json' };
  }
  console.log(`webhook: received ${event.type}`);
  return { status: 202, body: 'accepted' };
}
