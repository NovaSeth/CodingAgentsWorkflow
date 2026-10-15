// User API. Soft delete keeps the row and sets deletedAt; reads skip deleted users (D-AB-3: helpers, no ORM).
import { findById, findWhere, insert, update } from './db.mjs';

const live = (user) => user !== null && !user.deletedAt;

export function createUser({ name, team }) {
  return insert('users', { name, team });
}

export function getUser(id) {
  const user = findById('users', id);
  return live(user) ? user : null;
}

export function listUsers() {
  return findWhere('users', live);
}

export function findUsersByTeam(team) {
  return findWhere('users', (user) => live(user) && user.team === team);
}

export function softDeleteUser(id) {
  return update('users', id, { deletedAt: new Date().toISOString() });
}
