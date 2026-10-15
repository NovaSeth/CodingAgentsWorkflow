// Forward migrations (spec SD-10, GC9): one module per step in this directory, named `NNN-<kind>-<name>.mjs`
// (NNN = 001, 002, … across all kinds), each with a default export
//   { id: 'NNN-<kind>-<name>', kind, from, to: from + 1, up(doc) → doc }
// `up` is pure (no I/O, gets a copy, may not drop data the new schema can hold) and the engine stamps the new
// schema. Import every module here and list it in NNN order: tests/state-migrate.test.mjs checks this list
// against the directory and each kind's chain from 1 to its version (lib/state/kinds.mjs).
// Every kind is at schema 1, so there is no step yet.
export const MIGRATIONS = Object.freeze([]);
