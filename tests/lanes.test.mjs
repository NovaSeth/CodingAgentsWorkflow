// Team lanes (spec §7.9, SD-20, N8): `lane claim|renew|release|list|takeover` against a local bare remote.
// A claim is the ref refs/heads/<claimRefPrefix><lane> on origin (prefix from lib/name.json), pointing at an
// empty-tree root commit whose message is the JSON claim {lane, handle, at, expires}. Every write is a
// compare-and-swap on origin (--force-with-lease with the value seen, empty for a create), so of two racing writers
// exactly one wins. A network error is never a free lane: it exits 8 (ENV), except offline in a solo project
// (exit 0, nothing claimed).
// Commands run through the real command table (lib/cli/main.mjs) in throwaway repositories and HOME; the
// concurrency cases through the launcher in child processes; the stale-view races call lib/lanes with the view.
// This file holds no plugin name or path: both come from lib/name.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isolatedEnv, isolateProcessEnv } from './helpers/isolated-env.mjs';

// Every child of this file (and git run by the code under test) gets a throwaway HOME and environment (S1).
isolateProcessEnv();

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = (() => {
  const plugins = join(root, 'plugins');
  const hits = readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json')));
  assert.equal(hits.length, 1, 'exactly one plugins/*/lib/name.json');
  return join(plugins, hits[0]);
})();
const names = JSON.parse(readFileSync(join(pluginDir, 'lib', 'name.json'), 'utf8'));
const LAUNCHER = join(pluginDir, 'bin', names.bin);
const lib = (rel) => import(pathToFileURL(join(pluginDir, 'lib', rel)).href);
const lanes = await lib('lanes/index.mjs');
const { main } = await lib('cli/main.mjs');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const PREFIX = `refs/heads/${names.claimRefPrefix}`;
const iso = (ms) => new Date(ms).toISOString();

const git = (cwd, env, args, { ok = true } = {}) => {
  const r = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
  if (ok) assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r;
};

async function cli(args, { cwd, env }, { yes = true } = {}) {
  const out = [];
  const err = [];
  const io = { out: (s) => out.push(s), err: (s) => err.push(s), stdinIsTTY: false, env, cwd, stdin: null };
  const code = await main(['--json', ...(yes ? ['--yes'] : []), ...args], { io }); // global flags first: args may hold `--`
  return { code, out: JSON.parse(out.join('')), stderr: err.join('') };
}
const show = (r) => JSON.stringify(r.out ?? r);

const launch = (env, cwd, args) => new Promise((resolveRun, reject) => {
  const child = spawn(process.execPath, [LAUNCHER, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`deadline: ${args.join(' ')}\n${stderr}`)); }, 60000);
  child.on('close', (code) => { clearTimeout(timer); resolveRun({ code, stdout, stderr, out: stdout ? JSON.parse(stdout) : null }); });
});

const PEOPLE = { AB: ['Ann Bell', 'ann@example.com'], CD: ['Carl Dorn', 'carl@example.com'], EF: ['Eve Fox', 'eve@example.com'], GH: ['Gus Hale', 'gus@example.com'] };

// A bare origin and one clone per developer (each active, its handle registered); `remote` helpers read and plant
// claims on origin directly, as another machine would have pushed them.
async function team(t, handles = ['AB', 'CD']) {
  const box = isolatedEnv({ prefix: 'lanes-' });
  t.after(box.cleanup);
  const env = box.env;
  const remote = join(box.base, 'origin.git');
  git(box.base, env, ['init', '-q', '--bare', remote]);
  const dev = {};
  for (const h of handles) {
    const cwd = join(box.base, h.toLowerCase());
    mkdirSync(cwd);
    git(cwd, env, ['-c', 'init.defaultBranch=main', 'init', '-q']);
    git(cwd, env, ['config', 'user.name', PEOPLE[h][0]]);
    git(cwd, env, ['config', 'user.email', PEOPLE[h][1]]);
    git(cwd, env, ['remote', 'add', 'origin', remote]);
    const r = await cli(['init'], { cwd, env });
    assert.equal(r.code, 0, show(r));
    assert.equal(r.out.data.handle, h);
    dev[h] = { cwd, env, handle: h, run: (args, opts) => cli(args, { cwd, env }, opts), ctx: (now = iso(Date.now())) => ({ repo: cwd, env, names, handle: h, now }) };
  }
  const sha = (lane) => {
    const r = git(remote, env, ['rev-parse', '--verify', '-q', `${PREFIX}${lane}`], { ok: false });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  const commit = (lane) => git(remote, env, ['cat-file', 'commit', sha(lane)]).stdout;
  const claim = (lane) => JSON.parse(commit(lane).split('\n\n').slice(1).join('\n\n'));
  // A claim as another machine would have pushed it: at, expires as given.
  const plant = (lane, doc) => {
    const tree = git(remote, env, ['mktree']).stdout.trim();
    const c = git(remote, env, ['commit-tree', tree, '-m', JSON.stringify({ lane, ...doc })]).stdout.trim();
    git(remote, env, ['update-ref', `${PREFIX}${lane}`, c]);
    return c;
  };
  return { base: box.base, env, remote, dev, sha, commit, claim, plant };
}

const expiredBy = (ms, handle = 'AB') => {
  const expires = Date.now() - ms;
  return { handle, at: iso(expires - 7 * DAY), expires: iso(expires) };
};

// ---- claim, list ----

test('claim on a free lane pushes an empty-tree root commit holding the JSON claim; list shows it to everyone from origin', async (t) => {
  const r = await team(t);
  const { AB, CD } = r.dev;
  const before = Date.now();
  const c = await AB.run(['lane', 'claim', 'api']);
  assert.equal(c.code, 0, show(c));
  assert.equal(c.out.data.action, 'claimed');
  assert.equal(c.out.data.claim.handle, 'AB');
  assert.equal(c.out.data.claim.sha, r.sha('api'));

  const commit = r.commit('api');
  assert.match(commit, new RegExp(`^tree ${EMPTY_TREE}\n`), 'the claim commit carries no files');
  assert.doesNotMatch(commit, /^parent /m, 'a root commit');
  assert.doesNotMatch(commit, /ann@example\.com/, 'the claim publishes the handle, never the email');
  const doc = r.claim('api');
  assert.deepEqual(Object.keys(doc).sort(), ['at', 'expires', 'handle', 'lane']);
  assert.equal(doc.lane, 'api');
  assert.equal(doc.handle, 'AB');
  assert.ok(Date.parse(doc.at) >= before - 1000 && Date.parse(doc.at) <= Date.now() + 1000, doc.at);
  assert.equal(Date.parse(doc.expires) - Date.parse(doc.at), 7 * DAY, 'TTL 7 days');

  const theirs = await CD.run(['lane', 'list'], { yes: false });
  assert.equal(theirs.code, 0, show(theirs));
  assert.deepEqual(theirs.out.data.lanes.map((l) => [l.lane, l.handle, l.state, l.own]), [['api', 'AB', 'live', false]]);
  const mine = await AB.run(['lane', 'list', 'api'], { yes: false });
  assert.deepEqual(mine.out.data.lanes.map((l) => [l.lane, l.handle, l.own]), [['api', 'AB', true]]);
  const none = await CD.run(['lane', 'list', 'web'], { yes: false });
  assert.equal(none.code, 0, show(none));
  assert.deepEqual(none.out.data.lanes, []);
});

test('a claim push is neither signed nor gated: push.gpgSign and a failing pre-push hook do not block it', async (t) => {
  const r = await team(t, ['AB']);
  const { AB } = r.dev;
  for (const [k, v] of [['commit.gpgSign', 'true'], ['push.gpgSign', 'true'], ['gpg.program', 'false']]) git(AB.cwd, AB.env, ['config', k, v]);
  const hook = join(AB.cwd, '.git', 'hooks', 'pre-push');
  writeFileSync(hook, '#!/bin/sh\nexit 1\n');
  chmodSync(hook, 0o755);
  const c = await AB.run(['lane', 'claim', 'api']);
  assert.equal(c.code, 0, show(c));
  assert.equal(r.claim('api').handle, 'AB');
});

test('list is derived from origin and stored nowhere: no local ref, no FETCH_HEAD, nothing in the state directory', async (t) => {
  const r = await team(t);
  const { AB, CD } = r.dev;
  assert.equal((await AB.run(['lane', 'claim', 'api'])).code, 0);
  const stateDir = join(CD.cwd, names.stateDir);
  const files = (d) => readdirSync(d, { recursive: true }).map(String).sort();
  const before = files(stateDir);
  const l = await CD.run(['lane', 'list'], { yes: false });
  assert.equal(l.code, 0, show(l));
  assert.equal(l.out.data.lanes.length, 1);
  assert.equal(git(CD.cwd, CD.env, ['for-each-ref']).stdout, '', 'no local ref holds a claim');
  assert.ok(!existsSync(join(CD.cwd, '.git', 'FETCH_HEAD')), 'FETCH_HEAD untouched');
  assert.deepEqual(files(stateDir), before);
  // Released on origin: the next list shows it gone, with no local copy to go stale.
  assert.equal((await AB.run(['lane', 'release', 'api'])).code, 0);
  assert.deepEqual((await CD.run(['lane', 'list'], { yes: false })).out.data.lanes, []);
});

test('a live claim of another developer: claim, takeover, renew and release exit 1 with the owner; origin unchanged', async (t) => {
  const r = await team(t);
  const { AB, CD } = r.dev;
  const c = await AB.run(['lane', 'claim', 'api']);
  const seen = r.sha('api');
  const held = await CD.run(['lane', 'claim', 'api']);
  assert.equal(held.code, 1, show(held));
  assert.equal(held.out.errors[0].code, 'lane-held');
  assert.match(held.out.errors[0].message, /AB/);
  assert.equal(held.out.data.owner, 'AB');
  assert.equal(held.out.data.expires, c.out.data.claim.expires);
  assert.equal(held.out.data.takeoverAfter, iso(Date.parse(c.out.data.claim.expires) + DAY));
  for (const [cmd, code] of [['takeover', 'lane-held'], ['renew', 'not-owner'], ['release', 'not-owner']]) {
    const x = await CD.run(['lane', cmd, 'api']);
    assert.equal(x.code, 1, `${cmd}: ${show(x)}`);
    assert.equal(x.out.errors[0].code, code, cmd);
    assert.equal(x.out.data.owner, 'AB', cmd);
  }
  assert.equal(r.sha('api'), seen, 'nothing changed on origin');
});

// ---- races ----

test('create race: a claim decided on a stale "free" view is rejected by origin and names the winner', async (t) => {
  const r = await team(t);
  const { AB, CD } = r.dev;
  assert.equal((await AB.run(['lane', 'claim', 'api'])).code, 0);
  const won = r.sha('api');
  // CD saw the lane free before AB's push landed.
  assert.throws(() => lanes.claimLane(CD.ctx(), 'api', { seen: null }), (e) => {
    assert.equal(e.code, 'lane-held');
    assert.equal(e.exit, 'FAIL');
    assert.equal(e.details.owner, 'AB');
    return true;
  });
  assert.equal(r.sha('api'), won, 'the winner\'s claim stays');
});

test('concurrent claimers (processes): exactly one wins each lane, the others exit 1 naming the winner', async (t) => {
  const r = await team(t, ['AB', 'CD', 'EF']);
  const devs = Object.values(r.dev);
  for (const lane of ['l1', 'l2', 'l3']) {
    const runs = await Promise.all(devs.map((d) => launch(r.env, d.cwd, ['lane', 'claim', lane, '--yes', '--json'])));
    const winners = runs.filter((x) => x.code === 0);
    assert.equal(winners.length, 1, `${lane}: ${runs.map((x) => x.stdout + x.stderr).join('\n')}`);
    const owner = winners[0].out.data.claim.handle;
    assert.equal(r.claim(lane).handle, owner);
    for (const x of runs.filter((y) => y.code !== 0)) {
      assert.equal(x.code, 1, x.stdout + x.stderr);
      assert.equal(x.out.data.owner, owner);
    }
  }
});

// ---- renew ----

test('renew: debounced within a day; after a day a new claim replaces the seen one and the expiry moves', async (t) => {
  const r = await team(t);
  const { AB, CD } = r.dev;
  const old = r.plant('api', { handle: 'AB', at: iso(Date.now() - 2 * DAY), expires: iso(Date.now() + 5 * DAY) });
  const n = await AB.run(['lane', 'renew', 'api']);
  assert.equal(n.code, 0, show(n));
  assert.equal(n.out.data.action, 'renewed');
  const renewed = r.sha('api');
  assert.notEqual(renewed, old);
  const doc = r.claim('api');
  assert.equal(doc.handle, 'AB');
  assert.ok(Date.now() - Date.parse(doc.at) < 60000, doc.at);
  assert.equal(Date.parse(doc.expires) - Date.parse(doc.at), 7 * DAY);

  for (const cmd of ['renew', 'claim']) {
    const again = await AB.run(['lane', cmd, 'api']);
    assert.equal(again.code, 0, show(again));
    assert.equal(again.out.data.action, 'debounced', `${cmd} of an own lane renewed less than a day ago`);
    assert.equal(r.sha('api'), renewed, 'nothing pushed');
  }
  const free = await CD.run(['lane', 'renew', 'web']);
  assert.equal(free.code, 1, show(free));
  assert.equal(free.out.errors[0].code, 'not-claimed');
});

test('renew with the lease: a claim that changed since it was seen is not overwritten', async (t) => {
  const r = await team(t);
  const { AB } = r.dev;
  r.plant('api', { handle: 'AB', at: iso(Date.now() - 2 * DAY), expires: iso(Date.now() + 5 * DAY) });
  const seen = lanes.readLane(AB.ctx(), 'api');
  const other = r.plant('api', { handle: 'AB', at: iso(Date.now() - 30 * HOUR), expires: iso(Date.now() + 6 * DAY) }); // AB's other machine
  assert.throws(() => lanes.renewLane(AB.ctx(), 'api', { seen }), (e) => e.code === 'lane-changed' && e.exit === 'FAIL');
  assert.equal(r.sha('api'), other);
});

// ---- TTL and takeover ----

test('TTL: an expired claim is held for 24 h of grace; list shows the state and when takeover opens', async (t) => {
  const r = await team(t);
  const { CD } = r.dev;
  const doc = expiredBy(HOUR);
  const seen = r.plant('api', doc);
  for (const cmd of ['claim', 'takeover']) {
    const x = await CD.run(['lane', cmd, 'api']);
    assert.equal(x.code, 1, `${cmd}: ${show(x)}`);
    assert.equal(x.out.errors[0].code, 'lane-held');
    assert.equal(x.out.data.state, 'expired');
    assert.equal(x.out.data.takeoverAfter, iso(Date.parse(doc.expires) + DAY));
  }
  assert.equal(r.sha('api'), seen);
  r.plant('web', expiredBy(25 * HOUR));
  const l = await CD.run(['lane', 'list'], { yes: false });
  assert.deepEqual(l.out.data.lanes.map((x) => [x.lane, x.state]), [['api', 'expired'], ['web', 'takeover']]);
});

test('takeover after expiry + 24 h: claim and takeover replace the seen claim and record the takeover in the new claim', async (t) => {
  const r = await team(t);
  const { CD } = r.dev;
  for (const [lane, cmd] of [['web', 'takeover'], ['db', 'claim']]) {
    const doc = expiredBy(25 * HOUR);
    const old = r.plant(lane, doc);
    const x = await CD.run(['lane', cmd, lane]);
    assert.equal(x.code, 0, `${cmd}: ${show(x)}`);
    assert.equal(x.out.data.action, 'taken-over');
    const now = r.claim(lane);
    assert.equal(now.handle, 'CD');
    assert.deepEqual(now.takeover, { from: 'AB', claim: old, expires: doc.expires });
    assert.equal(Date.parse(now.expires) - Date.parse(now.at), 7 * DAY);
  }
  const free = await CD.run(['lane', 'takeover', 'api']);
  assert.equal(free.code, 1, show(free));
  assert.equal(free.out.errors[0].code, 'not-claimed');
  const own = await CD.run(['lane', 'takeover', 'web']);
  assert.equal(own.code, 1, show(own));
  assert.equal(own.out.errors[0].code, 'own-lane');
});

test('takeover boundary: allowed only once now is past expires + 24 h', () => {
  const claim = { lane: 'api', handle: 'AB', at: '2026-01-01T00:00:00.000Z', expires: '2026-01-08T00:00:00.000Z' };
  assert.equal(lanes.laneState(claim, '2026-01-08T00:00:00.000Z'), 'live');
  assert.equal(lanes.laneState(claim, '2026-01-08T00:00:00.001Z'), 'expired');
  assert.equal(lanes.laneState(claim, '2026-01-09T00:00:00.000Z'), 'expired');
  assert.equal(lanes.laneState(claim, '2026-01-09T00:00:00.001Z'), 'takeover');
  assert.equal(lanes.takeoverAfter(claim), '2026-01-09T00:00:00.000Z');
});

test('takeover races: of two takers with the same view one wins; a renew by the owner after the view defeats a takeover', async (t) => {
  const r = await team(t, ['AB', 'CD', 'EF']);
  const { AB, CD, EF } = r.dev;
  r.plant('api', expiredBy(25 * HOUR));
  const seen = lanes.readLane(CD.ctx(), 'api');
  assert.equal(lanes.claimLane(EF.ctx(), 'api', { seen, takeover: true }).action, 'taken-over');
  const taken = r.sha('api');
  assert.throws(() => lanes.claimLane(CD.ctx(), 'api', { seen, takeover: true }), (e) => e.code === 'lane-held' && e.details.owner === 'EF');
  assert.equal(r.sha('api'), taken);

  r.plant('web', expiredBy(25 * HOUR));
  const view = lanes.readLane(CD.ctx(), 'web');
  const n = await AB.run(['lane', 'renew', 'web']);
  assert.equal(n.out.data.action, 'renewed', show(n));
  const renewed = r.sha('web');
  assert.throws(() => lanes.claimLane(CD.ctx(), 'web', { seen: view, takeover: true }), (e) => e.code === 'lane-held' && e.details.owner === 'AB');
  assert.equal(r.sha('web'), renewed);
});

test('concurrent takeovers (processes): exactly one taker wins', async (t) => {
  const r = await team(t, ['AB', 'CD', 'EF', 'GH']);
  r.plant('api', expiredBy(25 * HOUR));
  const takers = [r.dev.CD, r.dev.EF, r.dev.GH];
  const runs = await Promise.all(takers.map((d) => launch(r.env, d.cwd, ['lane', 'takeover', 'api', '--yes', '--json'])));
  const winners = runs.filter((x) => x.code === 0);
  assert.equal(winners.length, 1, runs.map((x) => x.stdout + x.stderr).join('\n'));
  assert.equal(r.claim('api').handle, winners[0].out.data.claim.handle);
  for (const x of runs.filter((y) => y.code !== 0)) assert.equal(x.code, 1, x.stdout + x.stderr);
});

// ---- release ----

test('release deletes the own claim with the lease; another developer\'s claim and a changed claim stay', async (t) => {
  const r = await team(t);
  const { AB, CD } = r.dev;
  assert.equal((await AB.run(['lane', 'claim', 'api'])).code, 0);
  const theirs = await CD.run(['lane', 'release', 'api']);
  assert.equal(theirs.code, 1, show(theirs));
  assert.ok(r.sha('api'));
  const mine = await AB.run(['lane', 'release', 'api']);
  assert.equal(mine.code, 0, show(mine));
  assert.equal(mine.out.data.action, 'released');
  assert.equal(r.sha('api'), null);
  const again = await AB.run(['lane', 'release', 'api']);
  assert.equal(again.code, 0, show(again));
  assert.equal(again.out.data.action, 'not-claimed');

  r.plant('web', { handle: 'AB', at: iso(Date.now() - HOUR), expires: iso(Date.now() + 6 * DAY) });
  const seen = lanes.readLane(AB.ctx(), 'web');
  const newer = r.plant('web', { handle: 'AB', at: iso(Date.now() - 1000), expires: iso(Date.now() + 7 * DAY) });
  assert.throws(() => lanes.releaseLane(AB.ctx(), 'web', { seen }), (e) => e.code === 'lane-changed');
  assert.equal(r.sha('web'), newer);
});

// ---- network errors are never a free lane ----

const WRITERS = [['claim'], ['renew'], ['release'], ['takeover']];

test('an unreachable or missing origin exits 8 for every lane command; nothing is reported free', async (t) => {
  const r = await team(t);
  const { AB } = r.dev;
  git(AB.cwd, AB.env, ['remote', 'set-url', 'origin', join(r.base, 'gone.git')]);
  for (const [cmd] of [...WRITERS, ['list']]) {
    const x = await AB.run(['lane', cmd, 'api'], { yes: cmd !== 'list' });
    assert.equal(x.code, 8, `${cmd}: ${show(x)}`);
    assert.equal(x.out.ok, false);
    assert.equal(x.out.errors[0].code, 'remote-unreachable', cmd);
    assert.equal(x.out.data.lanes, undefined, cmd);
    assert.equal(x.out.data.action, undefined, cmd);
  }
  git(AB.cwd, AB.env, ['remote', 'remove', 'origin']);
  const none = await AB.run(['lane', 'claim', 'api']);
  assert.equal(none.code, 8, show(none));
});

test('a fetch that fails after the claim was seen exits 8: an unreadable claim is not a free lane', async (t) => {
  const r = await team(t);
  const { CD } = r.dev;
  r.plant('api', { handle: 'AB', at: iso(Date.now() - HOUR), expires: iso(Date.now() + 6 * DAY) });
  // Every second upload-pack fails: ls-remote sees the claim, the fetch of its commit fails.
  const script = join(r.base, 'flaky-upload-pack');
  const count = join(r.base, 'upload-count');
  writeFileSync(script, `#!/bin/sh\nn=$(cat '${count}' 2>/dev/null || echo 0); n=$((n+1)); echo $n > '${count}'\nif [ $((n % 2)) -eq 0 ]; then echo 'connection reset' >&2; exit 1; fi\nexec git upload-pack "$@"\n`);
  chmodSync(script, 0o755);
  git(CD.cwd, CD.env, ['config', 'remote.origin.uploadpack', script]);
  for (const cmd of ['list', 'claim']) {
    const x = await CD.run(['lane', cmd, 'api'], { yes: cmd !== 'list' });
    assert.equal(x.code, 8, `${cmd}: ${show(x)}`);
    assert.equal(x.out.errors[0].code, 'remote-unreachable');
  }
  assert.equal(r.claim('api').handle, 'AB');
});

test('a push that fails without a rejection exits 8; a server rule rejecting claim refs exits 8, never "held"', async (t) => {
  const r = await team(t);
  const { AB, CD } = r.dev;
  const broken = join(r.base, 'broken-receive-pack');
  writeFileSync(broken, '#!/bin/sh\necho "network down" >&2\nexit 1\n');
  chmodSync(broken, 0o755);
  git(AB.cwd, AB.env, ['config', 'remote.origin.receivepack', broken]);
  const x = await AB.run(['lane', 'claim', 'api']);
  assert.equal(x.code, 8, show(x));
  assert.equal(x.out.errors[0].code, 'remote-unreachable');
  assert.equal(r.sha('api'), null);

  const hook = join(r.remote, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho "protected" >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  const y = await CD.run(['lane', 'claim', 'api']);
  assert.equal(y.code, 8, show(y));
  assert.equal(y.out.errors[0].code, 'push-rejected');
  assert.ok(y.out.errors[0].hint.includes(names.claimRefPrefix), y.out.errors[0].hint);
  assert.equal(r.sha('api'), null);
});

test('offline in a solo project (SD-20): exit 0, nothing claimed, said in a warning; a team project exits 8', async (t) => {
  const r = await team(t, ['AB']);
  const { AB } = r.dev;
  git(AB.cwd, AB.env, ['remote', 'set-url', 'origin', join(r.base, 'gone.git')]);
  assert.equal((await AB.run(['lane', 'claim', 'api'])).code, 8);
  const said = await AB.run(['profile', 'set', 'people', 'solo', '--source', 'said', '--evidence', 'only me works here']);
  assert.equal(said.code, 0, show(said));
  for (const [cmd] of [...WRITERS, ['list']]) {
    const x = await AB.run(['lane', cmd, 'api'], { yes: cmd !== 'list' });
    assert.equal(x.code, 0, `${cmd}: ${show(x)}`);
    assert.equal(x.out.data.offline, true, cmd);
    assert.equal(x.out.data.action, undefined, cmd);
    assert.equal(x.out.data.lanes, undefined, cmd);
  }
  const text = spawnSync(process.execPath, [LAUNCHER, 'lane', 'claim', 'api', '--yes'], { cwd: AB.cwd, env: r.env, encoding: 'utf8' });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stderr, /warning: .*solo/);
});

// ---- input, activation, consent ----

test('lane names are checked before any git call: invalid or not refname-safe exits 2', async (t) => {
  const r = await team(t, ['AB']);
  const { AB } = r.dev;
  git(AB.cwd, AB.env, ['remote', 'set-url', 'origin', join(r.base, 'gone.git')]); // a git call would exit 8
  for (const lane of ['Api', 'a..b', 'x.lock', 'x.', '.x', '-x', 'a/b', 'a b', 'a'.repeat(41), 'x@{1}']) {
    for (const cmd of ['claim', 'list']) {
      const x = await AB.run(['lane', cmd, '--', lane], { yes: cmd !== 'list' });
      assert.equal(x.code, 2, `${cmd} ${JSON.stringify(lane)}: ${show(x)}`);
      assert.equal(x.out.errors[0].code, 'invalid-lane');
    }
  }
  assert.throws(() => lanes.checkLane('a..b'), (e) => e.exit === 'USAGE');
  assert.equal(lanes.checkLane('api-v2.next_1'), 'api-v2.next_1');
});

test('an inactive repository: the writers refuse (7) before touching origin; list works read-only', async (t) => {
  const r = await team(t, ['AB']);
  assert.equal((await r.dev.AB.run(['lane', 'claim', 'api'])).code, 0);
  const cwd = join(r.base, 'plain');
  mkdirSync(cwd);
  git(cwd, r.env, ['-c', 'init.defaultBranch=main', 'init', '-q']);
  git(cwd, r.env, ['remote', 'add', 'origin', r.remote]);
  for (const [cmd] of WRITERS) {
    const x = await cli(['lane', cmd, 'web'], { cwd, env: r.env });
    assert.equal(x.code, 7, `${cmd}: ${show(x)}`);
  }
  assert.equal(r.sha('web'), null);
  const l = await cli(['lane', 'list'], { cwd, env: r.env }, { yes: false });
  assert.equal(l.code, 0, show(l));
  assert.deepEqual(l.out.data.lanes.map((x) => [x.lane, x.handle, x.own]), [['api', 'AB', false]]);
  assert.ok(!existsSync(join(cwd, names.stateDir)), 'nothing written');
});

test('the lane commands are command table rows: help lists them; a writer without a terminal needs --yes', async (t) => {
  const r = await team(t, ['AB']);
  const { AB } = r.dev;
  const help = await AB.run(['--help'], { yes: false });
  for (const name of ['lane claim', 'lane list', 'lane release', 'lane renew', 'lane takeover']) assert.ok(help.out.data.commands.includes(name), name);
  const x = await AB.run(['lane', 'claim', 'api'], { yes: false });
  assert.equal(x.code, 7, show(x));
  assert.equal(x.out.errors[0].code, 'consent-required');
  assert.equal(r.sha('api'), null);
});
