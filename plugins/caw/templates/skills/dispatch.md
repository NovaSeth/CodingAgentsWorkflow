---
name: dispatch
description: Use when handing a task to a subagent or to another provider's CLI, from writing its brief and choosing the agent to accepting or rejecting its report.
---

# Dispatch

Rules: `{{bin}} rule PRI-3 PRI-4 PRI-18 ORC-1 ORC-2 ORC-3 ORC-4 ORC-7 ORC-8`.

1. Write the brief to a file before dispatching (PRI-18), from `${CLAUDE_PLUGIN_ROOT}/templates/task/brief.md`: executor and class, worktree, branch and base SHA, file scope, numbered acceptance points, RED tests, gate commands with worker limits, rule IDs and the report path, every path absolute (ORC-4, ORC-15).
2. Pick the agent by role (ORC-1): `{{plugin}}:implementer` for code and fix rounds, `{{plugin}}:reviewer` for reviews, `{{plugin}}:designer` for specs, shared parts and concurrent code. Pass the brief path and rule IDs, never the session history (PRI-3, ORC-3).
3. One task = one fresh agent = one branch and worktree (PRI-4).
4. Accept a report only after checking it yourself: commits, a clean tree, the scope of the diff, RED/GREEN evidence, gate exit codes and result counts (ORC-8, FLW-6). Its status decides the next step (ORC-7).
