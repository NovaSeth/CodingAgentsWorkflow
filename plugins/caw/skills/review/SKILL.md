---
# Generated from templates/skills/review.md by scripts/gen-names.mjs; do not edit.
name: review
description: Use when a task's diff or a fix round needs a review, when fixes need a scoped re-review, or when review findings must become a fix brief.
---

# Review

Rules: `caw rule PRI-6 ORC-5 REV-1 REV-2 REV-3 REV-5 REV-6 REV-7 REV-9`.

1. The author never reviews (PRI-6). Dispatch `caw:reviewer`, read-only, with a review brief: commit range, task brief, the author's report, the diff saved to a file, the acceptance points and a risk list (ORC-5).
2. The review follows `${CLAUDE_PLUGIN_ROOT}/templates/task/review.md`; severities per REV-2; every Critical and Important finding carries a reproduction (REV-3).
3. Needs fixes: write the findings file from `${CLAUDE_PLUGIN_ROOT}/templates/task/findings.md` for a fresh implementer (REV-5). The round ends with a scoped re-review from `${CLAUDE_PLUGIN_ROOT}/templates/task/rereview.md` (REV-6).
4. At most two fix rounds; then decide or escalate (REV-7). A disputed finding is decided, not fixed (REV-9).
