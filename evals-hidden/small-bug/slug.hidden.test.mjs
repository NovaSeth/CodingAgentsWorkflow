import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const { slugify } = candidate().module('src/slug.mjs');

test('runs of punctuation and spaces become one dash', () => {
  assert.equal(slugify('Hello,  World!'), 'hello-world');
  assert.equal(slugify('a---b'), 'a-b');
  assert.equal(slugify('C++ & Rust'), 'c-rust');
});

test('no leading or trailing dashes, however many separators', () => {
  assert.equal(slugify('Wow!!!'), 'wow');
  assert.equal(slugify('--a--b--'), 'a-b');
  assert.equal(slugify('  Top 10   Tips  '), 'top-10-tips');
});

test('behaviour that already worked is kept', () => {
  assert.equal(slugify('Simple Title'), 'simple-title');
  assert.equal(slugify('already-slugged'), 'already-slugged');
  assert.equal(slugify(''), '');
});
