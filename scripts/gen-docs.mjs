#!/usr/bin/env node
// Generates docs/cli.md from the command table (plugins/<plugin>/lib/cli/commands.mjs) with the renderer that
// also prints `--help` (lib/cli/help.mjs), so the reference cannot drift from the CLI (spec §8.2, REV-54).
//
// Usage: node scripts/gen-docs.mjs [--check] [--root <dir>]
//   --check       write nothing; report docs/cli.md when it is stale
//   --root <dir>  repository root (default: the repository holding this script)
// Exit: 0 up to date or written · 1 stale (--check) · 2 usage error or plugin tree not found · 70 internal error
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const USAGE = 'usage: node scripts/gen-docs.mjs [--check] [--root <dir>]\n';
const TARGET = 'docs/cli.md';

class Invalid extends Error {}

function parseArgs(argv) {
  const opts = { check: false, help: false, root: resolve(dirname(fileURLToPath(import.meta.url)), '..') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') opts.check = true;
    else if (argv[i] === '--help' || argv[i] === '-h') opts.help = true;
    else if (argv[i] === '--root' && i + 1 < argv.length) opts.root = resolve(argv[++i]);
    else throw new Invalid(`unknown or incomplete argument: ${argv[i]}\n${USAGE}`);
  }
  return opts;
}

// The plugin is found through its name.json, so this script holds no plugin name.
function locate(root) {
  const plugins = join(root, 'plugins');
  const dirs = existsSync(plugins) ? readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json'))) : [];
  if (dirs.length !== 1) throw new Invalid(`expected exactly one plugins/*/lib/name.json under ${root}, found ${dirs.length}`);
  const pluginRel = `plugins/${dirs[0]}`;
  for (const f of ['lib/cli/commands.mjs', 'lib/cli/help.mjs']) {
    if (!existsSync(join(root, pluginRel, f))) throw new Invalid(`${pluginRel}/${f} not found`);
  }
  return { pluginRel, names: JSON.parse(readFileSync(join(root, pluginRel, 'lib', 'name.json'), 'utf8')) };
}

async function render(root) {
  const { pluginRel, names } = locate(root);
  const load = (f) => import(pathToFileURL(join(root, pluginRel, 'lib', 'cli', f)).href);
  const { COMMANDS, EXIT_CODES, GLOBAL_FLAGS } = await load('commands.mjs');
  const { renderDocs } = await load('help.mjs');
  return renderDocs({ names, commands: COMMANDS, globalFlags: GLOBAL_FLAGS, exitCodes: EXIT_CODES }, { source: `${pluginRel}/lib/cli/commands.mjs` });
}

async function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) { process.stdout.write(USAGE); return 0; }
  const content = await render(opts.root);
  const file = join(opts.root, TARGET);
  const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
  if (opts.check) {
    if (current === content) return 0;
    process.stdout.write(`stale: regenerate ${TARGET}\nrun: node scripts/gen-docs.mjs\n`);
    return 1;
  }
  if (current !== content) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    process.stdout.write(`wrote ${TARGET}\n`);
  }
  return 0;
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (err) => {
  process.stderr.write(err instanceof Invalid ? `gen-docs: ${err.message}\n` : `gen-docs: internal error: ${err.stack}\n`);
  process.exitCode = err instanceof Invalid ? 2 : 70;
});
