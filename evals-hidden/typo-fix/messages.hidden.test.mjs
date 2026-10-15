import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const { emptyInbox, unreadCount, welcome } = candidate().module('src/messages.mjs');

test('the welcome message is spelled correctly and otherwise unchanged', () => {
  assert.equal(welcome('Ada'), 'Welcome back, Ada! Your received messages are below.');
});

test('the other messages are untouched', () => {
  assert.equal(emptyInbox(), 'Your inbox is empty.');
  assert.equal(unreadCount(1), 'You have 1 unread message.');
  assert.equal(unreadCount(0), 'You have 0 unread messages.');
});
