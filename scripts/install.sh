#!/usr/bin/env bash
# install.sh — szybkie wdrożenie kitu w ISTNIEJĄCYM projekcie, bez pytań (nakładka na setup.mjs).
#
#   scripts/install.sh [--level minimum|standard|full] [--team solo|zespol|duzy] [--stack typescript|python|inny]
#                      [--dry-run] [--force] <ścieżka-projektu>
#
# Pełny kreator (nowy projekt, pytania, CI, CODEOWNERS, obszary): node scripts/setup.mjs
# Istniejących plików nie nadpisuje (CLAUDE.md → CLAUDE.workflow.md), chyba że --force.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEVEL=minimum; TEAM=solo; STACK=inny; EXTRA=(); TARGET=""
# Wartość opcji: brak (opcja na końcu) albo kolejna opcja zamiast wartości → kod 2.
need() { if [ $# -lt 2 ] || [ -z "$2" ] || [ "${2#-}" != "$2" ]; then echo "brak wartości dla $1 (--help)" >&2; exit 2; fi; }
while [ $# -gt 0 ]; do
  case "$1" in
    --level) need "$@"; LEVEL="$2"; shift 2 ;;
    --team) need "$@"; TEAM="$2"; shift 2 ;;
    --stack) need "$@"; STACK="$2"; shift 2 ;;
    --level=*) LEVEL="${1#*=}"; shift ;;
    --team=*) TEAM="${1#*=}"; shift ;;
    --stack=*) STACK="${1#*=}"; shift ;;
    --dry-run|--force) EXTRA+=("$1"); shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    -*) echo "nieznana opcja: $1" >&2; exit 2 ;;
    *) TARGET="$1"; shift ;;
  esac
done
case "$LEVEL" in minimum|standard|full) ;; *) echo "poziom: minimum|standard|full" >&2; exit 2 ;; esac
case "$TEAM" in solo|zespol|duzy) ;; *) echo "zespół: solo|zespol|duzy" >&2; exit 2 ;; esac
case "$STACK" in typescript|python|inny) ;; *) echo "stos: typescript|python|inny" >&2; exit 2 ;; esac
[ -n "$TARGET" ] || { echo "podaj ścieżkę projektu (--help)" >&2; exit 2; }
[ -d "$TARGET" ] || { echo "brak katalogu $TARGET" >&2; exit 2; }
ci=brak; [ "$TEAM" != solo ] && ci=github
exec node "$here/setup.mjs" --yes --mode existing --path "$TARGET" --level "$LEVEL" --team "$TEAM" --stack "$STACK" \
  --ci "$ci" --no-discovery --no-second-provider "${EXTRA[@]+"${EXTRA[@]}"}"
