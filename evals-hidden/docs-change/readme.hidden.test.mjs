import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { candidateRoot } from '../../scripts/eval-lib/candidate.mjs';

// The README is read as data from the workspace copy; no candidate code runs for this case's hidden tests.
const readme = readFileSync(join(candidateRoot(), 'README.md'), 'utf8');
const options = readme.split(/^## /m).find((section) => section.startsWith('Options')) ?? '';
const row = (flag) => options.split('\n').find((line) => line.startsWith('|') && line.includes(flag));
const description = (flag) => (row(flag) ?? '').split('|')[2]?.trim() ?? '';

// Errors stay visible with --quiet; everything else is suppressed. Wordings that hide errors contradict that.
const HIDES_ERRORS = /\b(suppress\w*|hid(e|es|ing)|silenc\w*|mut(e|es|ing)|ignor\w*|swallow\w*|discard\w*|drop\w*)\s+(all\s+|the\s+|any\s+)*(errors?|warnings and errors|errors and warnings)\b|\berrors?\s+(are|is|get|will be)\s+(not shown|suppressed|hidden|silenced|ignored|discarded)\b|\bno errors?\b|\bnot even errors?\b|\b(prints?|shows?|outputs?) nothing\b/i;
const SUPPRESSES_OTHERS = /\b(only|except|suppress\w*|hid(e|es|ing)|silenc\w*|nothing else|no other|but errors)\b/i;

test('the Options table has a --quiet row', () => {
  assert.ok(row('--quiet'), 'no --quiet row in the Options table');
  assert.equal(row('--quiet').split('|').length, 4, `a two-column table row: ${row('--quiet')}`);
});

test('the --quiet description keeps errors visible', () => {
  const text = description('--quiet');
  assert.match(text, /\berrors?\b/i, text);
  assert.doesNotMatch(text, HIDES_ERRORS, text);
});

test('the --quiet description says other output is suppressed', () => {
  assert.match(description('--quiet'), SUPPRESSES_OTHERS);
});

test('the existing rows and sections are kept', () => {
  assert.ok(row('--verbose'), 'the --verbose row is gone');
  assert.ok(row('--help'), 'the --help row is gone');
  for (const heading of ['## Install', '## Usage', '## Options', '## License']) {
    assert.ok(readme.includes(heading), `${heading} is gone`);
  }
});
