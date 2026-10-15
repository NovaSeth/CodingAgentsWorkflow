// Where the eval suite lives and how its files are read. The plugin directory is found through
// plugins/*/lib/name.json, so this module holds no plugin name. Case files (case.yaml) are JSON-formatted YAML
// behind leading `#` comment lines; completion definitions live next to the hidden tests (evals-hidden/<case>/
// completion.json), outside the plugin.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CLASSES = ['trivial', 'standard', 'critical'];

export class SuiteError extends Error {}

export function pluginDir(root = REPO) {
  const plugins = join(root, 'plugins');
  const hits = existsSync(plugins) ? readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json'))) : [];
  if (hits.length !== 1) throw new SuiteError(`expected exactly one plugins/*/lib/name.json under ${root}, found ${hits.length}`);
  return join(plugins, hits[0]);
}

export const defaultEvals = () => join(pluginDir(), 'evals');
export const defaultHidden = () => join(REPO, 'evals-hidden');

export function caseNames(evals) {
  return readdirSync(evals, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'results' && existsSync(join(evals, e.name, 'case.yaml')))
    .map((e) => e.name)
    .sort();
}

export function readCase(evals, name) {
  const file = join(evals, name, 'case.yaml');
  const lines = readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => !l.startsWith('#'));
  try {
    return JSON.parse(lines.slice(start).join('\n'));
  } catch (err) {
    throw new SuiteError(`${file}: not JSON-formatted YAML (${err.message})`);
  }
}

export function readCompletion(hidden, name) {
  const file = join(hidden, name, 'completion.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new SuiteError(`${file}: ${err.message}`);
  }
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

// Content hash of a directory tree: sorted relative paths with the hash of each file.
export function treeHash(dir) {
  const files = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === '.git' || e.name === 'results') continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) files.push(relative(dir, p).split(sep).join('/'));
    }
  };
  if (existsSync(dir)) walk(dir);
  return sha256(files.sort().map((f) => `${f}\0${sha256(readFileSync(join(dir, f)))}`).join('\n'));
}

export { sha256 };
