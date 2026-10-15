// Worker thread of the trusted candidate client (candidate.mjs): owns the confined candidate child process and
// its pipes, so the client's main thread can wait synchronously (Atomics.wait) for each answer. It forwards one
// request at a time, matches the answer by id, enforces the call timeout (kills the child) and size caps, and
// keeps the child's stdout/stderr for the client: the stored text is capped, but every byte is searched for the
// values the client watches (scan.mjs), and a stream that went past the cap is reported as truncated. It never
// interprets an answer beyond JSON parsing.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parentPort, workerData } from 'node:worker_threads';
import { scanner } from './scan.mjs';

const { sab, spawnSpec, callTimeoutMs, startTimeoutMs, outputCap } = workerData;
const state = new Int32Array(sab, 0, 2);
const payload = new Uint8Array(sab, 8);
const MAX_LINE = 16 * 1024 * 1024;

function deliver(message) {
  let bytes = Buffer.from(JSON.stringify(message));
  if (bytes.length > payload.length) bytes = Buffer.from(JSON.stringify({ failure: 'oversize', detail: `answer of ${bytes.length} bytes` }));
  payload.set(bytes);
  Atomics.store(state, 1, bytes.length);
  Atomics.store(state, 0, 1);
  Atomics.notify(state, 0);
}

const output = { stdout: '', stderr: '' };
const ended = { stdout: false, stderr: false };
let flushing = null;
const truncated = { stdout: false, stderr: false };
let watched = [];
let scanners = { stdout: scanner([]), stderr: scanner([]) };
let exited = null;
let pending = null;
let readyResolve;
let readyReject;
const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
ready.catch(() => {});

let child;
try {
  child = spawn(spawnSpec.command, spawnSpec.args, { cwd: spawnSpec.cwd, env: spawnSpec.env, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
} catch (err) {
  exited = { error: String(err.message) };
}

const fail = (failure, detail) => {
  if (pending) { const p = pending; pending = null; p({ failure, detail }); }
};

if (child) {
  child.on('error', (err) => {
    exited = { error: String(err.message) };
    readyReject(new Error(err.message));
    fail('exit', `candidate process error: ${err.message}`);
  });
  child.stdin.on('error', () => {});
  for (const name of ['stdout', 'stderr']) {
    child[name].setEncoding('utf8');
    child[name].on('end', () => { ended[name] = true; flushing?.check(); });
    child[name].on('data', (chunk) => {
      if (flushing) flushing.see(name, chunk);
      scanners[name].push(chunk);
      if (output[name].length + chunk.length > outputCap) truncated[name] = true;
      if (output[name].length < outputCap) output[name] += chunk.slice(0, outputCap - output[name].length);
    });
  }
  let buffer = '';
  child.stdio[3].setEncoding('utf8');
  child.stdio[3].on('data', (chunk) => {
    buffer += chunk;
    if (buffer.length > MAX_LINE) {
      buffer = '';
      fail('protocol', 'answer line over the size cap');
      child.kill('SIGKILL');
      return;
    }
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at);
      buffer = buffer.slice(at + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message && message.ready === true) readyResolve();
      else if (pending && message && message.id === pending.id) { const p = pending; pending = null; p(message); }
    }
  });
  child.on('exit', (code, signal) => {
    exited = { code, signal };
    readyReject(new Error(`candidate exited (${signal ?? code}) before it was ready`));
    fail('exit', `candidate exited (${signal ?? code})`);
  });
}

let seq = 0;

async function settle() {
  if (!child) return true;
  const marker = `\u0000settle-${randomUUID()}\u0000`;
  const seen = { stdout: ended.stdout, stderr: ended.stderr };
  const tail = { stdout: '', stderr: '' };
  let resolveSeen;
  const allSeen = new Promise((resolve) => { resolveSeen = resolve; });
  flushing = {
    see(name, chunk) {
      if ((tail[name] + chunk).includes(marker)) seen[name] = true;
      tail[name] = (tail[name] + chunk).slice(-marker.length);
      this.check();
    },
    check() {
      if ((seen.stdout || ended.stdout) && (seen.stderr || ended.stderr)) resolveSeen(true);
    },
  };
  flushing.check();
  let answered = Promise.resolve(true);
  if (!exited) {
    const id = ++seq;
    answered = new Promise((resolve) => { pending = resolve; pending.id = id; });
    child.stdin.write(`${JSON.stringify({ op: 'flush', marker, id })}\n`);
  }
  const outcome = await withTimeout(Promise.all([answered, allSeen]).then(() => true), 5000, () => false);
  flushing = null;
  pending = null;
  for (const name of ['stdout', 'stderr']) output[name] = output[name].split(marker).join('');
  return outcome === true;
}
const withTimeout = (promise, ms, onTimeout) => new Promise((resolve) => {
  const timer = setTimeout(() => resolve(onTimeout()), ms);
  promise.then((value) => { clearTimeout(timer); resolve(value); }, (err) => { clearTimeout(timer); resolve({ failure: 'start', detail: String(err.message) }); });
});

parentPort.on('message', async (message) => {
  if (message.op === 'output') {
    // Output is settled first: everything the candidate wrote before this point has been read, or the streams ended.
    // If that cannot be shown in time, the output counts as truncated.
    const settled = await settle();
    for (const name of ['stdout', 'stderr']) if (!settled) truncated[name] = true;
    const hits = Object.fromEntries(watched.map((v) => [v, scanners.stdout.hits()[v] + scanners.stderr.hits()[v]]));
    return deliver({ ok: true, stdout: output.stdout, stderr: output.stderr, truncated: truncated.stdout || truncated.stderr, hits, exited });
  }
  if (message.op === 'watch') {
    // Output already stored is searched again; anything past the cap before this point shows as truncated.
    watched = [...new Set([...watched, ...message.values.map(String)])];
    scanners = { stdout: scanner(watched), stderr: scanner(watched) };
    scanners.stdout.push(output.stdout);
    scanners.stderr.push(output.stderr);
    return deliver({ ok: true });
  }
  if (message.op === 'close') {
    child?.kill('SIGKILL');
    return deliver({ ok: true });
  }
  if (exited) return deliver({ failure: 'exit', detail: `candidate is not running (${JSON.stringify(exited)})` });
  const started = await withTimeout(ready.then(() => ({ ok: true })), startTimeoutMs, () => ({ failure: 'start', detail: 'candidate did not start in time' }));
  if (started.failure) {
    child?.kill('SIGKILL');
    return deliver(started);
  }
  if (exited) return deliver({ failure: 'exit', detail: `candidate is not running (${JSON.stringify(exited)})` });
  const id = ++seq;
  const answer = new Promise((resolve) => { pending = resolve; pending.id = id; });
  child.stdin.write(`${JSON.stringify({ ...message.request, id })}\n`);
  const result = await withTimeout(answer, callTimeoutMs, () => {
    pending = null;
    child.kill('SIGKILL');
    return { failure: 'timeout', detail: `no answer within ${callTimeoutMs} ms` };
  });
  return deliver(result);
});
