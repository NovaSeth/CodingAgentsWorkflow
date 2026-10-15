// `receipt` command (spec §5.1, §7.11, §8.1, §8.2, ruling R70): the receipt of a task (--task) or of one external run
// (--run). --task in an active repository saves receipts/<task>.json through lib/state (saveReceipt: no write when
// unchanged, never fewer tokens than the saved one); in an inactive repository it prints only and writes nothing
// (GC2). Data that could not be read or priced: exit 1 with the numbers found and data.receipt.partial (spec §8.1).
// --json carries the integer fields (micro-dollars, milliseconds); the text derives USD and seconds from them.
// Errors from lib/state (unknown task, not a repository, held lock) reach the CLI unchanged.
// Printed text holds labels and numbers only (model, agent type, provider, run ID), never transcript text.
import { EXIT } from '../cli/commands.mjs';
import { forTerminal } from '../text/clean.mjs';
import { runReceipt, saveReceipt, taskReceipt } from './index.mjs';

const fail = (code, message, hint) => ({ code: EXIT.USAGE, errors: [{ code, message, hint }] });
const usd = (micro) => (micro === null ? '-' : (micro / 1e6).toFixed(6));
const seconds = (ms) => (ms === null ? '-' : String(ms / 1000));
const COLUMNS = ['input', 'output', 'cacheRead', 'cacheWrite'];
const HEAD = ['input', 'output', 'cache read', 'cache write'];

function table(rows) {
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((c, i) => (i < 2 ? c.padEnd(widths[i]) : c.padStart(widths[i]))).join('  ').trimEnd()).join('\n');
}

function taskText(r, file) {
  const head = `receipt ${r.task} · class ${r.class ?? '-'} · rounds ${r.rounds ?? '-'} · ${r.startedAt ?? '-'} → ${r.endedAt ?? '-'}${r.wallMs === null ? '' : ` (${seconds(r.wallMs)} s)`}`;
  const rows = [['agent', 'model', ...HEAD, 'USD (estimate)']];
  for (const a of r.byAgent) rows.push([a.agentType, a.model, ...COLUMNS.map((k) => String(a.tokens[k])), usd(a.costMicroUsd)]);
  rows.push(['total', '', ...COLUMNS.map((k) => String(r.tokens[k])), usd(r.costMicroUsd)]);
  const lines = [head, table(rows)];
  if (r.external.length) {
    lines.push('external runs:');
    for (const e of r.external) {
      const tokens = e.tokens ? COLUMNS.map((k, i) => `${HEAD[i]} ${e.tokens[k]}`).join(' · ') : `tokens: ${e.tokensReason}`;
      lines.push(`  ${e.runId}  ${e.provider}  ${e.model ?? '-'}  ${tokens}  USD ${usd(e.costMicroUsd)}  ${seconds(e.wallMs)} s  exit ${e.exit ?? '-'}`);
    }
  }
  lines.push(`prices of ${r.priceTable} (estimate) · source ${r.source}${r.partial ? ' · PARTIAL: a lower bound' : ''}${file ? ` · saved: ${file}` : ''}`);
  return `${forTerminal(lines.join('\n'))}\n`;
}

function runText(r) {
  const tokens = r.tokens ? COLUMNS.map((k, i) => `${HEAD[i]} ${r.tokens[k]}`).join(' · ') : `tokens: ${r.tokensReason}`;
  return `${forTerminal(`run ${r.runId} · task ${r.task} · ${r.provider} · ${r.model ?? '-'} · ${r.status}\n${tokens} · USD ${usd(r.costMicroUsd)} (estimate) · ${seconds(r.wallMs)} s · exit ${r.exit ?? '-'}`)}\n`;
}

export function receipt({ flags, names, io }) {
  const ctx = { cwd: io.cwd, env: io.env, names };
  const given = ['task', 'run'].filter((k) => flags[k] !== undefined);
  if (given.length === 0) return fail('missing-flag', 'give --task <id> or --run <id>', `${names.bin} receipt --task T-AB-1`);
  if (given.length > 1) return fail('conflicting-flags', '--task and --run exclude each other', 'ask for one receipt at a time');
  if (flags.run !== undefined) {
    const { run } = runReceipt(flags.run, ctx);
    return { data: { run }, text: runText(run) };
  }
  const { receipt: r, problems, warnings, where } = taskReceipt(flags.task, ctx);
  let saved = false;
  let file = null;
  if (where.active) {
    const out = saveReceipt(r, { where, names });
    ({ saved, file } = out);
    if (out.kept) warnings.push({ code: 'receipt-kept', message: `the saved receipt of ${r.task} counts more tokens; it was kept`, hint: 'its transcripts are gone from this machine or were never here' });
  } else {
    warnings.push({ code: 'not-saved', message: 'this repository is not activated: the receipt is printed, not saved', hint: `${names.bin} init activates it` });
  }
  return { code: r.partial ? EXIT.FAIL : EXIT.OK, data: { receipt: r, saved, file, warnings }, errors: problems, text: taskText(r, saved ? file : null), warnings: warnings.map((w) => w.message) };
}
