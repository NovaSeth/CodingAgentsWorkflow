// Required artifacts (spec §5.1, §7.6 step 5, SD-15 (3), SD-47):
//   report  tasks/<id>/report.md opens with a frontmatter block (between --- lines) holding `red` and `green`, each a
//           JSON object { command, exit, excerpt }: command non-empty, exit an integer (red: not 0, green: 0),
//           excerpt text of at most 2 KB. The body is prose and decides nothing.
//   review  needed when the route has a review step: the latest round (highest k of review-r<k>.json) has verdict
//           approved, and for a cross-provider review an external reviewer. → approved | missing | not-required
// The report is read as a plain file (never through a link) of at most 256 KB; the review through lib/state.
import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPORT_MAX = 256 * 1024;
const EXCERPT_MAX = 2048;

export function readReport(dir, id) {
  const file = join(dir, 'tasks', id, 'report.md');
  try {
    const st = lstatSync(file);
    return st.isFile() && st.size <= REPORT_MAX ? readFileSync(file, 'utf8') : null;
  } catch {
    return null;
  }
}

function evidence(raw, exitOk) {
  let v;
  try { v = JSON.parse(raw ?? ''); } catch { return false; }
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
    && typeof v.command === 'string' && v.command.trim() !== ''
    && Number.isInteger(v.exit) && exitOk(v.exit)
    && typeof v.excerpt === 'string' && Buffer.byteLength(v.excerpt) <= EXCERPT_MAX;
}

export function reportHasEvidence(text) {
  if (typeof text !== 'string') return false;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const end = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (end < 0) return false;
  const fields = {};
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (m && !Object.hasOwn(fields, m[1])) fields[m[1]] = m[2].trim();
  }
  return evidence(fields.red, (e) => e !== 0) && evidence(fields.green, (e) => e === 0);
}

// What the route needs: 'external' (cross-provider review), 'any' (a review) or null.
export const reviewNeed = (steps) => (steps.includes('cross-provider-review') ? 'external' : steps.includes('review') ? 'any' : null);

export function reviewState(store, id, steps) {
  const need = reviewNeed(steps);
  if (!need) return 'not-required';
  const round = (key) => Number(key.slice(key.lastIndexOf('-r') + 2));
  const keys = store.list('review').filter((k) => k.startsWith(`${id}/`)).sort((a, b) => round(a) - round(b));
  if (!keys.length) return 'missing';
  const latest = store.read('review', keys[keys.length - 1]);
  return latest.verdict === 'approved' && (need === 'any' || latest.reviewer.kind === 'external') ? 'approved' : 'missing';
}
