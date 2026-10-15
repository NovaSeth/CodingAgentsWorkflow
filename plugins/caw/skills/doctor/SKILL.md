---
# Generated from templates/skills/doctor.md by scripts/gen-names.mjs; do not edit.
name: doctor
description: Check the plugin's health and context cost.
disable-model-invocation: true
---

# Doctor

1. Run `caw doctor --json`.
2. Report each check from `data.checks` as ok or failed, with its detail, and the always-on cost from `data.alwaysOnTokens`.
3. For each error, give its hint as the next step. Exit 8 means Claude Code is missing or does not run: say so and stop.
