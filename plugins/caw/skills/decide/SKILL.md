---
# Generated from templates/skills/decide.md by scripts/gen-names.mjs; do not edit.
name: decide
description: Use when making or changing a technical, scope or process decision that later work must follow, or when the user states a preference about how to work.
---

# Decide

Rules: `caw rule PRI-8 PRI-10 PRI-16 PRI-17 MEM-2 MEM-3 COD-12 SPC-15`.

1. Decide technical scope, variants, spec and plan conflicts yourself and record each (PRI-16); ask the human only in the cases PRI-17 lists.
2. A record holds what, why and the cost if wrong; quote the human's words verbatim (PRI-8, MEM-2). A stated preference also goes into the collaboration rules with its reason (MEM-3).
3. Records are append-only: a change is a new decision that supersedes the old one, and decided behavior changes only that way (MEM-2, PRI-8, SPC-15).
4. A number in the method is a default: record the project's own value as a decision (PRI-10).
5. Cite the decision next to the code it constrains (COD-12).
6. When `caw --help` lists no `decide` command, append the record to the project's decision log and tell the user where it is.
