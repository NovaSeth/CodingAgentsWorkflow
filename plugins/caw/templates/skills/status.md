---
name: status
description: Show this repository's process state.
disable-model-invocation: true
---

# Status

Report the state in at most 10 lines; read summaries, never whole logs.

1. Run `{{bin}} --help --json`. When `data.commands` lists `status`, run it through the CLI with `--json` and report the tier, tasks in progress with their next step, the loop and running agents.
2. Otherwise this version keeps no repository state: run `{{bin}} doctor --json` and report plugin health instead, and say that nothing is tracked yet.
