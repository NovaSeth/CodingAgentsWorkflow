#!/usr/bin/env bash
# sync-agent-rules.sh — generuje AGENTS.md z CLAUDE.md (wykonawcy innych dostawców czytają AGENTS.md).
# Nie edytuj AGENTS.md ręcznie — ręczna kopia rozjeżdża się z CLAUDE.md.
#   sync-agent-rules.sh          → zapisuje AGENTS.md
#   sync-agent-rules.sh --check  → kod 1, gdy AGENTS.md jest nieaktualny (do bramki / CI)
set -euo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
src="$root/CLAUDE.md"; dst="$root/AGENTS.md"
[ -f "$src" ] || { echo "brak $src" >&2; exit 2; }
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
{
  echo "<!-- GENERATED from CLAUDE.md by .workflow/bin/sync-agent-rules.sh — DO NOT EDIT. Edytuj CLAUDE.md. -->"
  echo
  cat "$src"
} > "$tmp"
if [ "${1:-}" = --check ]; then
  cmp -s "$tmp" "$dst" && { echo "AGENTS.md aktualny"; exit 0; }
  echo "AGENTS.md nieaktualny — uruchom .workflow/bin/sync-agent-rules.sh" >&2; exit 1
fi
cp "$tmp" "$dst"; echo "zapisano $dst"
