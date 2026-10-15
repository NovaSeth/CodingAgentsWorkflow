---
name: start
description: Activate process tracking in this repository.
disable-model-invocation: true
---

# Start

The user asked to activate process tracking in this repository.

1. Run `{{bin}} doctor --json`. On a non-zero exit, report each error with its hint and stop.
2. Run `{{bin}} --help --json`. When `data.commands` lists `init`, run it through the CLI with `--yes --json` and report its one-line result; it creates `{{stateDir}}/` in the repository.
3. Otherwise tell the user that this version cannot activate tracking yet, and write nothing.
