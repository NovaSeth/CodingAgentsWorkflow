---
# Generated from templates/skills/start.md by scripts/gen-names.mjs; do not edit.
name: start
description: Activate process tracking in this repository.
disable-model-invocation: true
---

# Start

The user asked to activate process tracking in this repository.

1. Run `caw doctor --json`. On a non-zero exit, report each error with its hint and stop.
2. Run `caw --help --json`. When `data.commands` lists `init`, run it through the CLI with `--yes --json` and report its one-line result; it creates `.caw/` in the repository.
3. Otherwise tell the user that this version cannot activate tracking yet, and write nothing.
