// Candidate host: runs inside the confined child process and exposes the candidate workspace's modules to the
// trusted supervisor. Requests arrive as JSON lines on stdin, responses leave as JSON lines on fd 3. Nothing
// here is trusted: the supervisor treats every response as data (codec.mjs) and makes every verdict itself;
// candidate code can only answer calls, never report results.
//
// Usage (by candidate-worker.mjs only): node [confinement flags] candidate-host.mjs <workspace> [--observe=timingSafeEqual]
// Requests: {id, op: 'module', path} | {id, op: 'apply', handle, args, observeArgs} | {id, op: 'invoke', handle, method, args, observeArgs}
//           | {id, op: 'control', settings: {forceTimingSafeEqual: true | false | null}}
//           | {id, op: 'flush', marker}: writes the marker to stdout and stderr behind everything written so far
// Response: {id, ok: true, value, args?, callbacks, observations} | {id, ok: false, error: {name, message, code}, callbacks, observations}
import crypto from 'node:crypto';
import { realpathSync, writeSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { decode, encode } from './codec.mjs';

const [root, ...flags] = process.argv.slice(2);
// Taken before any candidate module loads, so a candidate replacing process.stdout.write cannot hide the marker.
const writeOut = process.stdout.write.bind(process.stdout);
const writeErr = process.stderr.write.bind(process.stderr);
const realRoot = realpathSync(root);
const RESPONSE_FD = 3;
const MAX_LINE = 16 * 1024 * 1024;

// Instrumentation is installed before any candidate module loads. It records each call with its operands (hex,
// capped) and, on request, makes the call return a fixed result so the supervisor can see whether the caller's
// decision follows it. It records; the supervisor decides.
const observations = [];
const settings = { forceTimingSafeEqual: null };
const hex = (v) => {
  try {
    const bytes = ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength) : Buffer.from(v);
    return bytes.subarray(0, 4096).toString('hex');
  } catch {
    return null;
  }
};
if (flags.includes('--observe=timingSafeEqual')) {
  const original = crypto.timingSafeEqual;
  crypto.timingSafeEqual = function timingSafeEqual(a, b) {
    const record = { fn: 'timingSafeEqual', lengths: [a?.length ?? null, b?.length ?? null], args: [hex(a), hex(b)] };
    observations.push(record);
    try {
      const result = original.call(this, a, b);
      record.result = result;
      if (settings.forceTimingSafeEqual !== null) {
        record.forced = settings.forceTimingSafeEqual;
        return settings.forceTimingSafeEqual;
      }
      return result;
    } catch (err) {
      record.threw = String(err?.code ?? err?.name ?? 'error');
      throw err;
    }
  };
  syncBuiltinESMExports();
}

const handles = new Map();
const ids = new WeakMap();
let nextId = 1;
const register = (value) => {
  let id = ids.get(value);
  if (id === undefined) {
    id = nextId++;
    ids.set(value, id);
    handles.set(id, value);
  }
  return id;
};

let callbacks = [];
const stubs = new Map();
const stub = (id) => {
  if (!stubs.has(id)) stubs.set(id, (...args) => { callbacks.push([id, enc(args)]); return undefined; });
  return stubs.get(id);
};

const enc = (value) => encode(value, {
  fn: (f) => ['h', register(f), 'function'],
  object: (o) => ['h', register(o), 'object'],
  plainRef: (o, entries) => (entries.some(([, e]) => e[0] === 'h') ? register(o) : undefined),
});
const dec = (value) => decode(value, {
  handle: (id) => {
    if (!handles.has(id)) throw new TypeError(`unknown handle ${id}`);
    return handles.get(id);
  },
  callback: (id) => stub(id),
});

const sleeper = new Int32Array(new SharedArrayBuffer(4));
function respond(message) {
  let line = `${JSON.stringify(message)}\n`;
  if (line.length > MAX_LINE) line = `${JSON.stringify({ id: message.id, ok: false, error: { name: 'RangeError', message: 'response too large' }, callbacks: [], observations: [] })}\n`;
  const buffer = Buffer.from(line);
  let offset = 0;
  while (offset < buffer.length) {
    try {
      offset += writeSync(RESPONSE_FD, buffer, offset);
    } catch (err) {
      if (err.code !== 'EAGAIN') throw err;
      Atomics.wait(sleeper, 0, 0, 2);
    }
  }
}

const inside = (path) => {
  const rel = relative(realRoot, path);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

async function perform(request, args) {
  switch (request.op) {
    case 'module': {
      const file = resolve(realRoot, String(request.path));
      if (!inside(file)) throw new TypeError('module path leaves the workspace');
      const namespace = await import(pathToFileURL(file).href);
      return Object.fromEntries(Object.keys(namespace).map((key) => [key, namespace[key]]));
    }
    case 'apply': {
      const fn = handles.get(request.handle);
      if (typeof fn !== 'function') throw new TypeError(`handle ${request.handle} is not a function`);
      return fn(...args);
    }
    case 'invoke': {
      const target = handles.get(request.handle);
      if (target === undefined || target === null) throw new TypeError(`unknown handle ${request.handle}`);
      const method = target[String(request.method)];
      if (typeof method !== 'function') throw new TypeError(`${String(request.method)} is not a function`);
      return method.apply(target, args);
    }
    case 'flush': {
      const marker = String(request.marker);
      await Promise.all([new Promise((done) => writeOut(marker, done)), new Promise((done) => writeErr(marker, done))]);
      return null;
    }
    case 'control': {
      const force = request.settings?.forceTimingSafeEqual;
      settings.forceTimingSafeEqual = force === true || force === false ? force : null;
      return null;
    }
    default:
      throw new TypeError(`unknown op ${request.op}`);
  }
}

respond({ ready: true });
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of lines) {
  let request;
  try {
    request = JSON.parse(line);
  } catch {
    continue;
  }
  callbacks = [];
  observations.length = 0;
  let response;
  try {
    const args = request.args === undefined ? [] : dec(request.args);
    let value = await perform(request, Array.isArray(args) ? args : []);
    if (value !== null && typeof value === 'object' && typeof value.then === 'function') value = await value;
    response = { id: request.id, ok: true, value: enc(value), ...(request.observeArgs && { args: enc(args) }) };
  } catch (err) {
    response = { id: request.id, ok: false, error: { name: String(err?.name ?? 'Error'), message: String(err?.message ?? err), ...(err?.code !== undefined && { code: String(err.code) }) } };
  }
  response.callbacks = callbacks;
  response.observations = observations.slice();
  respond(response);
}
process.exit(0);
