---
name: work
description: Use when the user asks for a change to code in a repository, such as a feature, a fix, a refactor or tests, new or continued.
---

# Work

Fit the process to the size of the change. Read rules by ID with `{{bin}} rule <ID…>`, never whole method files; start with `{{bin}} rule PRI-2 FLW-1 COD-1 COD-3 PRI-15`.

1. Class the change (PRI-2): trivial (a few lines, no risk path such as auth, payments, migrations, CI or a public API), standard, or critical (shared parts, data, security, concurrency, many files).
2. Trivial: make the change directly and run the project's tests before you report.
3. Standard: write the test first, run it and show the failure and its reason, then make it pass (COD-1, COD-2); plan inside the task.
4. Critical: spec and plan first with the `{{plugin}}:plan` skill, then hand slices to agents with the `{{plugin}}:dispatch` skill.
5. Every class: never remove, skip or weaken a test without a decision (COD-3). Done means the gate commands pass when re-run, the report carries RED/GREEN evidence and the tree is clean (PRI-15, FLW-6).
6. A decision or a stated preference that later work must follow: the `{{plugin}}:decide` skill.
