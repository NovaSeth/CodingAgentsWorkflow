// State boundary (spec §4.2, §4.3, KOD-19, KOD-39), next to tests/architecture.test.mjs (which already limits
// the `stateDir` name to lib/state and atomic/O_EXCL calls to lib/fsx):
//   1. lib/state writes file content only through lib/fsx (atomic replace, exclusive create, locks): no direct
//      write, append, copy, rename, delete, truncate or link call, and no open() with a write flag; creating
//      directories is allowed. So every state write is crash-safe.
//   2. Other units reach lib/state only through its public interface lib/state/index.mjs.
// The checker runs on the real plugin (no finding) and on planted violations (each must be found, REV-45).
// Limits: a call through an alias (`const w = writeFileSync; w(p)`) is not traced.
// This file holds no plugin name or path: both come from lib/name.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pluginDir = (() => {
  const plugins = join(root, 'plugins');
  const hits = readdirSync(plugins).filter((d) => existsSync(join(plugins, d, 'lib', 'name.json')));
  assert.equal(hits.length, 1, 'exactly one plugins/*/lib/name.json');
  return join(plugins, hits[0]);
})();

const walk = (d) => (existsSync(d) ? readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; }) : []);
// Comments removed (good enough for this code base: no comment markers inside string literals that matter).
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const DIRECT_WRITE = /(?<![\w$])(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|copyFile|copyFileSync|cp|cpSync|rename|renameSync|rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|truncate|truncateSync|ftruncate|ftruncateSync|symlink|symlinkSync|link|linkSync|writeSync)\s*\(/;
const OPEN_FOR_WRITE = /(?<![\w$])open(?:Sync)?\s*\([^;]*?,\s*['"`](?:[wa]|r\+)/;
const IMPORT = /\b(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function scan(pluginRoot) {
  const findings = [];
  const libDir = join(pluginRoot, 'lib');
  for (const file of walk(libDir).filter((f) => /\.(mjs|js|cjs)$/.test(f))) {
    const rel = relative(pluginRoot, file).split(sep).join('/');
    const unit = rel.split('/')[1];
    const src = code(readFileSync(file, 'utf8'));
    if (unit === 'state') {
      const m = DIRECT_WRITE.exec(src) ?? OPEN_FOR_WRITE.exec(src);
      if (m) findings.push(`state-writes-through-fsx: ${rel}: ${m[0].trim()}`);
      continue;
    }
    for (const m of src.matchAll(IMPORT)) {
      const spec = m[1] ?? m[2];
      if (!spec.startsWith('.')) continue;
      const target = relative(libDir, resolve(dirname(file), spec)).split(sep).join('/');
      if (target.startsWith('state/') && target !== 'state/index.mjs') findings.push(`state-public-interface: ${rel}: imports ${target}`);
    }
  }
  return findings;
}

test('lib/state writes only through lib/fsx; other units use only lib/state/index.mjs', () => {
  assert.deepEqual(scan(pluginDir), []);
  const stateFiles = walk(join(pluginDir, 'lib', 'state')).filter((f) => f.endsWith('.mjs'));
  assert.ok(stateFiles.length >= 5, 'lib/state scanned');
  assert.ok(stateFiles.some((f) => /\bfrom '\.\.\/fsx\/index\.mjs'/.test(readFileSync(f, 'utf8'))), 'lib/state writes through lib/fsx');
});

const PLANTED = [
  ['state-writes-through-fsx', 'lib/state/a.mjs', "writeFileSync(p, 'x');\n"],
  ['state-writes-through-fsx', 'lib/state/a.mjs', "appendFileSync(p, 'x');\n"],
  ['state-writes-through-fsx', 'lib/state/a.mjs', "import * as fs from 'node:fs';\nfs.writeFileSync(p, 'x');\n"],
  ['state-writes-through-fsx', 'lib/state/a.mjs', 'rmSync(p, { force: true });\n'],
  ['state-writes-through-fsx', 'lib/state/a.mjs', "const fd = openSync(p, 'a');\n"],
  ['state-writes-through-fsx', 'lib/state/sub/b.mjs', 'renameSync(a, b);\n'],
  ['state-writes-through-fsx', 'lib/state/a.mjs', 'copyFileSync(a, b);\n'],
  ['state-public-interface', 'lib/verify/a.mjs', "import { open } from '../state/store.mjs';\n"],
  ['state-public-interface', 'lib/hooks/a.mjs', "const m = await import('../state/resolve.mjs');\n"],
  ['state-public-interface', 'lib/cli/a.mjs', "export { x } from '../state/kinds.mjs';\n"],
];

test('the boundary checker finds each planted violation and accepts the allowed shapes (REV-45)', () => {
  const plant = (files) => {
    const fixture = mkdtempSync(join(tmpdir(), 'state-boundary-'));
    try {
      for (const [rel, content] of Object.entries(files)) {
        mkdirSync(dirname(join(fixture, rel)), { recursive: true });
        writeFileSync(join(fixture, rel), content);
      }
      return scan(fixture);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  };
  for (const [rule, rel, content] of PLANTED) {
    const found = plant({ [rel]: content });
    assert.equal(found.length, 1, `${rule} in ${rel}: ${JSON.stringify(found)}`);
    assert.ok(found[0].startsWith(`${rule}: `), found[0]);
  }
  assert.deepEqual(plant({
    'lib/state/a.mjs': "// writeFileSync(p) in a comment\nimport { writeAtomic } from '../fsx/index.mjs';\nmkdirSync(d, { recursive: true });\nwriteAtomic(p, t);\nconst text = readFileSync(p, 'utf8');\nconst fd = openSync(d, 'r');\nstore.writeText(rel, t);\n",
    'lib/verify/a.mjs': "import { open } from '../state/index.mjs';\n",
  }), []);
});
