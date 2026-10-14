#!/usr/bin/env bash
# ruling.sh — dopisuje decyzję (albo zadanie wspólne / ustalenie bezpieczeństwa) do ledgera z numerem bez kolizji.
#
#   ruling.sh "<co>" "<dlaczego>" "<koszt błędu>" [--source "<cytat / korekta Rk>"] [--shared]
#   ruling.sh --kind S   "<opis zadania wspólnego>" [--shared]     → S<n> / S-<AUTOR>-<n>
#   ruling.sh --kind SEC "<opis ustalenia bezpieczeństwa>"         → SEC-<n> / SEC-<AUTOR>-<n>
#   ruling.sh [--kind R|S|SEC] --next     → wypisz następny numer (nic nie zapisuje)
#   --shared dokleja do treści znacznik [wspólne] (decyzja dotyczy innych pasów albo części wspólnych).
#
# Tryb jednoosobowy: R<n>. Tryb zespołowy (".workflow/config.json": "multiDev": true): R-<AUTOR>-<n>,
# AUTOR = `git config workflow.author` (ustawia .workflow/bin/dev-setup.sh). Numer = 1 + największy z: licznika
# wspólnego dla wszystkich worktree repo (<git-common-dir>/workflow-ruling-seq), ledgera bieżącej gałęzi
# i ledgera z origin/main (jeśli ref jest lokalnie). Ledger ma merge=union — dopisy z gałęzi scalają się bez konfliktu.
# Kody: 0 ok · 2 brak ledgera / autora / blokady licznika · 64 złe argumenty.
set -euo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd))"
ledger="${LEDGER:-$root/.workflow/progress.md}"
config="$root/.workflow/config.json"
usage() { sed -n '2,15p' "$0"; exit 64; }

kind=R; next=0; shared=0; source=""; args=()
# Jeden wpis = jedna linia: znak nowej linii w argumencie dopisałby do ledgera drugi, sfałszowany wpis.
nl="$(printf '\n_')"; nl="${nl%_}"; cr="$(printf '\r')"
for a in "$@"; do case "$a" in *"$nl"*|*"$cr"*) echo "argumenty bez znaków nowej linii (jeden wpis = jedna linia ledgera)" >&2; exit 64 ;; esac; done
while [ $# -gt 0 ]; do
  case "$1" in
    --next) next=1; shift ;;
    --shared) shared=1; shift ;;
    --kind) [ $# -ge 2 ] || usage; kind="$2"; shift 2 ;;
    --source) [ $# -ge 2 ] || usage; source=" (źródło: $2)"; shift 2 ;;
    -h|--help) usage ;;
    *) args+=("$1"); shift ;;
  esac
done
case "$kind" in R|S|SEC) ;; *) echo "--kind: R|S|SEC" >&2; exit 64 ;; esac
[ -f "$ledger" ] || { echo "brak ledgera $ledger" >&2; exit 2; }

multi=0
[ -f "$config" ] && grep -Eq '"multiDev"[[:space:]]*:[[:space:]]*true' "$config" && multi=1
author="$(git -C "$root" config workflow.author 2>/dev/null || true)"
if [ "$multi" = 1 ]; then
  [ -n "$author" ] || { echo "tryb zespołowy: brak git config workflow.author — uruchom .workflow/bin/dev-setup.sh" >&2; exit 2; }
  case "$kind" in R) prefix="R-$author-" ;; S) prefix="S-$author-" ;; SEC) prefix="SEC-$author-" ;; esac
else
  case "$kind" in R) prefix="R" ;; S) prefix="S" ;; SEC) prefix="SEC-" ;; esac
fi

# Największy numer serii w tekście ze stdin (korekty z literą też się liczą: R12a → 12).
max_in() { grep -oE "(^|[^A-Za-z0-9-])${prefix}[0-9]+" | grep -oE '[0-9]+$' | sort -n | tail -1 || true; }
common="$(git -C "$root" rev-parse --git-common-dir 2>/dev/null || true)"
if [ -n "$common" ]; then
  case "$common" in /*) ;; *) common="$root/$common" ;; esac
  seq_file="$common/workflow-ruling-seq"
else
  seq_file=""
fi
compute() {
  local a b c
  a="$(max_in < "$ledger")"
  b=""
  if git -C "$root" rev-parse -q --verify refs/remotes/origin/main >/dev/null 2>&1; then
    b="$( (git -C "$root" show origin/main:.workflow/progress.md 2>/dev/null || true) | max_in)"
  fi
  c=""
  [ -n "$seq_file" ] && [ -f "$seq_file" ] && c="$(awk -v p="$prefix" '$1 == p { print $2 }' "$seq_file" | sort -n | tail -1 || true)"
  n=0
  for x in "${a:-0}" "${b:-0}" "${c:-0}"; do [ "$x" -gt "$n" ] && n="$x"; done
  n=$((n + 1))
}

if [ "$next" = 1 ]; then compute; echo "${prefix}${n}"; exit 0; fi
if [ "$kind" = R ]; then [ "${#args[@]}" -ge 3 ] || usage; else [ "${#args[@]}" -ge 1 ] || usage; fi

# Blokada licznika (mkdir jest atomowy) — dwa worktree tej samej osoby nie dostaną tego samego numeru.
lock=""
if [ -n "$seq_file" ]; then
  lock="$seq_file.lock"; tries=0
  until mkdir "$lock" 2>/dev/null; do
    tries=$((tries + 1))
    [ "$tries" -lt 100 ] || { echo "licznik rulingów zablokowany: $lock (usuń katalog, jeśli żaden ruling.sh nie działa)" >&2; exit 2; }
    sleep 0.1
  done
  trap 'rmdir "$lock" 2>/dev/null || true' EXIT
fi
compute
id="${prefix}${n}"
if [ -n "$seq_file" ]; then
  { [ -f "$seq_file" ] && awk -v p="$prefix" '$1 != p' "$seq_file"; printf '%s %s\n' "$prefix" "$n"; } > "$seq_file.tmp"
  mv "$seq_file.tmp" "$seq_file"
fi

who="${author:-$(git -C "$root" config user.name 2>/dev/null || echo '?')}"
tag=""; [ "$shared" = 1 ] && tag="[wspólne] "
when="$(date '+%Y-%m-%d %H:%M')"
if [ "$kind" = R ]; then
  line="- Ruling ${id} (${when} ${who})${source}: ${tag}${args[0]} — ${args[1]} — koszt błędu: ${args[2]}."
else
  line="- ${id} (${when} ${who})${source}: ${tag}${args[*]}"
fi
# Ledger bez końcowego \n skleiłby wpis z ostatnią linią.
if [ -s "$ledger" ] && [ "$(tail -c1 "$ledger" | wc -l | tr -d ' ')" = 0 ]; then printf '\n' >> "$ledger"; fi
printf '%s\n' "$line" >> "$ledger"
echo "$id"
