---
name: loop
description: Use when the user asks to keep working unattended through a plan, to resume after a break or a usage limit, or to schedule the next wakeup.
---

# Loop

Rules: `{{bin}} rule FLW-4 FLW-5 FLW-9 ORC-9 ORC-11 MEM-4 MEM-5 MEM-10`.

1. Each tick asks the CLI for the next steps and does them (FLW-4). The wakeup prompt is fixed and carries no task state; after DONE, STALLED or BUDGET, schedule no wakeup (FLW-5).
2. When `{{bin}} --help` lists no `tick` command, this version has no loop: work through the plan task by task and stop when it is done.
3. Every task in progress has a live next step; without one it returns to todo or is marked blocked with what unblocks it (FLW-9).
4. Fill free machine slots with the next independent task (ORC-11); ask an agent that runs long for a 5-line status (ORC-9).
5. Before a break, write a resume note (MEM-4). On resume, inventory worktrees, locks and processes before dispatching again (MEM-5, MEM-10).
