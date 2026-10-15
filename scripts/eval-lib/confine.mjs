// Confinement for candidate code (agent-written code from an eval run) executed by the evaluator.
// Required: Node's permission model (--permission, Node >= 22.13): reads limited to the workspace copy and the
// evaluator's host files, writes to one scratch directory, no child processes, workers or addons. Added where
// the platform has one: an OS sandbox (macOS sandbox-exec, Linux bwrap) denying network and writes outside the
// scratch directory. The child environment is empty except PATH and TZ. Without the permission model the
// evaluator refuses to run candidate code unless the operator passes --allow-unconfined, and records it.
import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export const CHILD_ENV_KEYS = ['PATH', 'TZ'];

const onPath = (name, path = process.env.PATH ?? '') => path.split(delimiter).some((dir) => dir && existsSync(join(dir, name)));

export function detect({ flags = process.allowedNodeEnvironmentFlags, platform = process.platform, exists = existsSync, which = onPath } = {}) {
  let os_sandbox = null;
  if (platform === 'darwin' && exists('/usr/bin/sandbox-exec')) os_sandbox = 'sandbox-exec';
  else if (platform === 'linux' && which('bwrap')) os_sandbox = 'bwrap';
  let test_isolation = null;
  if (flags.has('--test-isolation')) test_isolation = '--test-isolation=none';
  else if (flags.has('--experimental-test-isolation')) test_isolation = '--experimental-test-isolation=none';
  return { node_permission: flags.has('--permission'), test_isolation, os_sandbox };
}

export class Refused extends Error {}

// The confinement a run gets, or Refused. allowUnconfined only lifts the refusal; it never weakens what exists.
export function decide(detected, { allowUnconfined = false } = {}) {
  if (!detected.node_permission && !allowUnconfined) {
    throw new Refused('candidate code would run without Node\'s permission model (needs Node >= 22.13); refusing. '
      + 'Pass --allow-unconfined to run it anyway (recorded in the report).');
  }
  return { ...detected, unconfined: !detected.node_permission, unconfined_allowed: allowUnconfined };
}

const sbQuote = (path) => `"${path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

export function sandboxProfile(writable) {
  return [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(deny file-write*)',
    ...writable.map((p) => `(allow file-write* (subpath ${sbQuote(p)}))`),
    '(allow file-write* (literal "/dev/null"))',
  ].join('\n');
}

// Command line for a Node script run as candidate code: [wrapper...] node [permission flags] script args.
export function command(conf, { node = process.execPath, script, args = [], read = [], write = [], cwd, extraNodeArgs = [] }) {
  const nodeArgs = [
    ...(conf.node_permission ? ['--permission', ...read.map((p) => `--allow-fs-read=${p}`), ...write.map((p) => `--allow-fs-write=${p}`)] : []),
    '--max-old-space-size=512',
    ...extraNodeArgs,
  ];
  const inner = [node, ...nodeArgs, ...(script ? [script] : []), ...args];
  const env = { PATH: process.env.PATH ?? '', TZ: 'UTC' };
  if (conf.os_sandbox === 'sandbox-exec') {
    return { command: '/usr/bin/sandbox-exec', args: ['-p', sandboxProfile(write), ...inner], env, cwd };
  }
  if (conf.os_sandbox === 'bwrap') {
    const binds = [
      ...read.flatMap((p) => ['--ro-bind', p, p]),
      ...write.flatMap((p) => ['--bind', p, p]),
    ];
    return {
      command: 'bwrap',
      args: ['--die-with-parent', '--new-session', '--unshare-all', '--ro-bind', '/', '/', '--dev', '/dev', '--proc', '/proc',
        '--tmpfs', '/tmp', ...binds, ...(cwd ? ['--chdir', cwd] : []), ...inner],
      env,
      cwd,
    };
  }
  return { command: inner[0], args: inner.slice(1), env, cwd };
}
