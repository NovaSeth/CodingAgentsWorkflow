// Trusted client for candidate code. Hidden tests (and the evaluator's ports of visible tests) run in a trusted
// process that never loads candidate code: they call the candidate's functions through this client, which
// forwards each call to a confined child process (candidate-host.mjs) and blocks until the answer arrives, so
// the tests stay ordinary synchronous node:test files. Verdicts are made here, by the trusted assertions.
//
//   const c = candidate();                       // a fresh confined child (fresh module state)
//   const { slugify } = c.module('src/slug.mjs'); // exports: functions become synchronous proxies
//   const { value, args } = c.observe(fn, ...args) // also returns the arguments as the candidate left them
//   c.observations()                             // instrumentation records of the last call (see host)
//   c.control({ forceTimingSafeEqual: false })   // make an instrumented call return a fixed result (null: real)
//   c.watch(...values)                           // search all output and written files for these values
//   c.output()                                   // { stdout, stderr (stored, capped), truncated, hits, files }
//   candidateRoot()                              // workspace copy, for reading files (never executing them)
//
// A protocol failure (timeout, child exit, malformed or oversized answer) throws CandidateFailure and sets the
// process exit code to 1, so the file fails even if a test catches the error. Errors the candidate throws are
// rebuilt by name (RangeError, TypeError, ...) and carry `fromCandidate: true`.
// Configuration: candidate({ config }) or the JSON file named by EVAL_CANDIDATE_CONFIG (written by the
// evaluator): { root, scratch?, command, args, env, cwd, hostArgs?, callTimeoutMs?, startTimeoutMs? }.
import { closeSync, existsSync, openSync, readSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { decode, encode } from './codec.mjs';
import { scanner } from './scan.mjs';

const CAPACITY = 32 * 1024 * 1024;
const HANDLE = Symbol('candidate handle');
const BUILTIN_ERRORS = { Error, RangeError, TypeError, SyntaxError, ReferenceError, EvalError, URIError };

export class CandidateFailure extends Error {
  constructor(kind, detail) {
    super(`candidate unavailable (${kind}): ${detail}`);
    this.name = 'CandidateFailure';
    this.kind = kind;
  }
}

let loaded;
function loadConfig() {
  if (loaded) return loaded;
  const file = process.env.EVAL_CANDIDATE_CONFIG;
  if (!file) throw new Error('EVAL_CANDIDATE_CONFIG is not set: hidden tests run under scripts/eval-hidden.mjs');
  loaded = JSON.parse(readFileSync(file, 'utf8'));
  return loaded;
}

export const candidateRoot = (config = loadConfig()) => config.root;

class Session {
  constructor(config, { observe = [] } = {}) {
    this.config = config;
    this.callTimeoutMs = config.callTimeoutMs ?? 10000;
    this.startTimeoutMs = config.startTimeoutMs ?? 15000;
    this.sab = new SharedArrayBuffer(8 + CAPACITY);
    this.state = new Int32Array(this.sab, 0, 2);
    this.functions = new Map();
    this.objects = new Map();
    this.callbacks = new Map();
    this.callbackIds = new WeakMap();
    this.lastObservations = [];
    this.dead = null;
    const hostArgs = [...(config.hostArgs ?? []), ...observe.map((name) => `--observe=${name}`)];
    this.worker = new Worker(new URL('./candidate-worker.mjs', import.meta.url), {
      workerData: {
        sab: this.sab,
        spawnSpec: { command: config.command, args: [...config.args, ...hostArgs], env: config.env, cwd: config.cwd },
        callTimeoutMs: this.callTimeoutMs,
        startTimeoutMs: this.startTimeoutMs,
        outputCap: 1024 * 1024,
      },
    });
    this.worker.unref();
  }

  fail(kind, detail) {
    this.dead = { kind, detail };
    process.exitCode = 1;
    process.stderr.write(`candidate unavailable (${kind}): ${detail}\n`);
    throw new CandidateFailure(kind, detail);
  }

  send(message, timeoutMs) {
    if (this.dead) throw new CandidateFailure(this.dead.kind, this.dead.detail);
    Atomics.store(this.state, 0, 0);
    this.worker.postMessage(message);
    if (Atomics.wait(this.state, 0, 0, timeoutMs) === 'timed-out') this.fail('timeout', 'the evaluator worker did not answer');
    const length = Atomics.load(this.state, 1);
    const text = Buffer.from(new Uint8Array(this.sab, 8, length)).toString('utf8');
    try {
      return JSON.parse(text);
    } catch {
      return this.fail('protocol', 'unreadable answer');
    }
  }

  request(request) {
    const answer = this.send({ op: 'request', request }, this.callTimeoutMs + this.startTimeoutMs + 5000);
    if (answer.failure) this.fail(answer.failure, answer.detail ?? '');
    if (typeof answer.ok !== 'boolean') this.fail('protocol', 'answer without a verdict field');
    this.lastObservations = Array.isArray(answer.observations) ? answer.observations : [];
    let callbacks;
    try {
      callbacks = (Array.isArray(answer.callbacks) ? answer.callbacks : []).map(([id, args]) => [this.callbacks.get(id), this.dec(args)]);
    } catch (err) {
      this.fail('protocol', `malformed callback record: ${err.message}`);
    }
    for (const [fn, args] of callbacks) if (typeof fn === 'function') fn(...(Array.isArray(args) ? args : []));
    if (!answer.ok) throw rebuild(answer.error);
    return answer;
  }

  decoded(answer, key) {
    try {
      return this.dec(answer[key]);
    } catch (err) {
      return this.fail('protocol', `malformed value: ${err.message}`);
    }
  }

  dec(value) {
    return decode(value, {
      handle: (id, kind) => (kind === 'function' ? this.functionProxy(id) : this.objectProxy(id)),
      plainRef: (object, ref) => Object.defineProperty(object, HANDLE, { value: Number(ref), enumerable: false }),
    });
  }

  enc(value) {
    return encode(value, {
      ref: (v) => (v[HANDLE] !== undefined ? ['h', v[HANDLE], 'object'] : undefined),
      fn: (f) => {
        if (f[HANDLE] !== undefined) return ['h', f[HANDLE], 'function'];
        let id = this.callbackIds.get(f);
        if (id === undefined) {
          id = this.callbacks.size + 1;
          this.callbacks.set(id, f);
          this.callbackIds.set(f, id);
        }
        return ['cb', id];
      },
      object: () => { throw new TypeError('only data, Dates, candidate values and functions can be passed to candidate code'); },
    });
  }

  functionProxy(id) {
    if (!this.functions.has(id)) {
      const session = this;
      const proxy = function candidateFunction(...args) {
        return session.decoded(session.request({ op: 'apply', handle: id, args: session.enc(args) }), 'value');
      };
      Object.defineProperty(proxy, HANDLE, { value: id, enumerable: false });
      this.functions.set(id, proxy);
    }
    return this.functions.get(id);
  }

  objectProxy(id) {
    if (!this.objects.has(id)) {
      const session = this;
      const methods = new Map();
      this.objects.set(id, new Proxy(Object.create(null), {
        get(_, prop) {
          if (prop === HANDLE) return id;
          if (typeof prop !== 'string' || prop === 'then' || prop === 'toJSON') return undefined;
          if (!methods.has(prop)) {
            methods.set(prop, (...args) => session.decoded(session.request({ op: 'invoke', handle: id, method: prop, args: session.enc(args) }), 'value'));
          }
          return methods.get(prop);
        },
      }));
    }
    return this.objects.get(id);
  }

  module(path) {
    return this.decoded(this.request({ op: 'module', path: String(path) }), 'value');
  }

  observe(fn, ...args) {
    if (typeof fn !== 'function' || fn[HANDLE] === undefined) throw new TypeError('observe() takes a candidate function');
    const answer = this.request({ op: 'apply', handle: fn[HANDLE], args: this.enc(args), observeArgs: true });
    return { value: this.decoded(answer, 'value'), args: this.decoded(answer, 'args'), observations: this.lastObservations };
  }

  observations() {
    return this.lastObservations;
  }

  watch(...values) {
    this.watched = [...new Set([...(this.watched ?? []), ...values.map(String)])];
    this.send({ op: 'watch', values: this.watched }, 5000);
  }

  control(settings) {
    this.request({ op: 'control', settings });
  }

  // Stored output is capped; hits count every occurrence of a watched value in everything the candidate wrote to
  // stdout, stderr and the files of its writable directory, and truncated says the stored text is incomplete.
  output() {
    const answer = this.send({ op: 'output' }, 5000);
    const hits = { ...(answer.hits ?? {}) };
    const files = [];
    const scratch = this.config.scratch;
    if (scratch && existsSync(scratch) && this.watched?.length) {
      const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.isFile() ? [join(dir, e.name)] : []));
      for (const file of walk(scratch)) {
        files.push(file.slice(scratch.length + 1));
        const scan = scanner(this.watched);
        const fd = openSync(file, 'r');
        const buffer = Buffer.alloc(64 * 1024);
        try {
          for (let n = readSync(fd, buffer); n > 0; n = readSync(fd, buffer)) scan.push(buffer.toString('latin1', 0, n));
        } finally {
          closeSync(fd);
        }
        const found = scan.hits();
        for (const value of this.watched) hits[value] = (hits[value] ?? 0) + (found[value] ?? 0);
      }
    }
    return {
      stdout: String(answer.stdout ?? ''),
      stderr: String(answer.stderr ?? ''),
      truncated: answer.truncated === true,
      hits,
      files,
      exited: answer.exited ?? null,
    };
  }

  close() {
    if (!this.dead) this.send({ op: 'close' }, 5000);
    this.dead = this.dead ?? { kind: 'closed', detail: 'session closed' };
    this.worker.terminate();
  }
}

function rebuild(info = {}) {
  const Ctor = BUILTIN_ERRORS[info.name] ?? Error;
  const err = new Ctor(String(info.message ?? ''));
  if (!BUILTIN_ERRORS[info.name]) err.name = String(info.name ?? 'Error');
  if (info.code !== undefined) err.code = String(info.code);
  err.fromCandidate = true;
  return err;
}

export function candidate({ config, observe } = {}) {
  return new Session(config ?? loadConfig(), { observe });
}
