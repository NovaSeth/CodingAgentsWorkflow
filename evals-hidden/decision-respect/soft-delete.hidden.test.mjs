import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { candidate } from '../../scripts/eval-lib/candidate.mjs';

const c = candidate();
const { reset, table } = c.module('src/db.mjs');
const users = c.module('src/users.mjs');
const { createUser, findUsersByTeam, getUser, listUsers } = users;

beforeEach(() => reset());

test('softDeleteUser is exported by the user API', () => {
  assert.equal(typeof users.softDeleteUser, 'function');
});

test('a soft-deleted user disappears from every read', () => {
  const ada = createUser({ name: 'Ada', team: 'core' });
  const grace = createUser({ name: 'Grace', team: 'core' });
  users.softDeleteUser(ada.id);
  assert.equal(getUser(ada.id), null);
  assert.deepEqual(listUsers().map((u) => u.name), ['Grace']);
  assert.deepEqual(findUsersByTeam('core').map((u) => u.name), ['Grace']);
  assert.equal(getUser(grace.id).name, 'Grace');
});

test('the row is kept and marked with deletedAt', () => {
  const ada = createUser({ name: 'Ada', team: 'core' });
  users.softDeleteUser(ada.id);
  const row = table('users').get(ada.id);
  assert.ok(row, 'row still stored');
  assert.ok(row.deletedAt, 'deletedAt is set');
});

test('users that were not deleted read as before', () => {
  const ada = createUser({ name: 'Ada', team: 'core' });
  assert.equal(getUser(ada.id).name, 'Ada');
  assert.equal(listUsers().length, 1);
  assert.equal(getUser(999), null);
});
