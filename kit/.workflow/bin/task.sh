#!/usr/bin/env bash
# task.sh — dopisuje do ledgera wpis o stanie zadania w gramatyce czytanej przez tick.mjs (autor i czas zawsze).
#
#   task.sh <id> dispatched --exec <wykonawca> --base <sha> [--pas <pas>]   (--pas wymagany w zespole)
#   task.sh <id> blocked "<co odblokuje>"
#   task.sh <id> cancelled "<powód>"
#   task.sh <id> self-verified [--round k | r<k>] [opis]
#   task.sh <id> status-request [opis]
#   task.sh <id> implementer DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED [opis]   (status z raportu wykonawcy, ORK-24)
#   task.sh <id> fix-round --round k --addressed a --open o [opis]
#   task.sh <id> complete "<opis: commits, PR, SHA na main>"
#   task.sh gate <obszar> [opis]          → Gate <obszar>: done …
#   task.sh release [opis]                → Release: done …
#
# Wpis: „Task <id>: <stan> … by <AUTOR> @ RRRR-MM-DD GG:MM”. AUTOR = git config workflow.author (w zespole wymagany).
# Ledger: .workflow/progress.md (zmienna LEDGER). Kody: 0 ok · 2 brak ledgera / autora · 64 złe argumenty.
set -uo pipefail
root="$(git rev-parse --show-toplevel 2>/dev/null || (cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd))"
ledger="${LEDGER:-$root/.workflow/progress.md}"
usage() { sed -n '2,16p' "$0" >&2; exit 64; }
die() { echo "$1" >&2; exit "${2:-64}"; }
safe() { printf '%s' "$2" | grep -Eq '^[A-Za-z0-9._-]+$' || die "$1: dozwolone litery, cyfry, . _ - („$2”)"; }

[ $# -ge 1 ] || usage
# Jeden wpis = jedna linia: znak nowej linii w argumencie dopisałby do ledgera drugi, sfałszowany wpis stanu.
nl="$(printf '\n_')"; nl="${nl%_}"; cr="$(printf '\r')"
for a in "$@"; do case "$a" in *"$nl"*|*"$cr"*) die "argumenty bez znaków nowej linii (jeden wpis = jedna linia ledgera)" ;; esac; done
[ -f "$ledger" ] || die "brak ledgera $ledger" 2
multi=0
grep -Eq '"multiDev"[[:space:]]*:[[:space:]]*true' "$root/.workflow/config.json" 2>/dev/null && multi=1
author="$(git -C "$root" config workflow.author 2>/dev/null || true)"
if [ -z "$author" ]; then
  [ "$multi" = 1 ] && die "tryb zespołowy: brak git config workflow.author — uruchom .workflow/bin/dev-setup.sh" 2
  author="$(git -C "$root" config user.name 2>/dev/null || echo '?')"
fi
sig="by ${author} @ $(date '+%Y-%m-%d %H:%M')"
paren() { [ -n "$1" ] && printf ' (%s)' "$1"; }

case "$1" in
  gate)
    [ $# -ge 2 ] || usage; safe obszar "$2"; area="$2"; shift 2
    line="Gate ${area}: done$(paren "$*") ${sig}" ;;
  release)
    shift; line="Release: done$(paren "$*") ${sig}" ;;
  -h|--help) usage ;;
  *)
    [ $# -ge 2 ] || usage
    id="$1"; state="$2"; shift 2; safe "ID zadania" "$id"
    case "$id" in *..*) die "ID zadania: bez „..”" ;; esac
    exec_=""; base=""; pas=""; round=""; addressed=""; open=""; rest=""
    while [ $# -gt 0 ]; do
      case "$1" in
        --exec|--base|--pas|--round|--addressed|--open)
          [ $# -ge 2 ] || die "$1 wymaga wartości"
          case "$1" in
            --exec) exec_="$2" ;; --base) base="$2" ;; --pas) pas="$2" ;;
            --round) round="$2" ;; --addressed) addressed="$2" ;; --open) open="$2" ;;
          esac
          shift 2 ;;
        *) rest="${rest:+$rest }$1"; shift ;;
      esac
    done
    num() { printf '%s' "$2" | grep -Eq '^[0-9]+$' || die "$1: liczba („$2”)"; }
    case "$state" in
      dispatched)
        [ -n "$exec_" ] && [ -n "$base" ] || die "dispatched wymaga --exec <wykonawca> --base <sha>"
        if [ -n "$pas" ]; then safe pas "$pas"; elif [ "$multi" = 1 ]; then die "tryb zespołowy: dispatched wymaga --pas <pas>"; fi
        line="Task ${id}: dispatched (BASE ${base}) — ${exec_} ${sig% @ *}${pas:+ pas $pas} @ ${sig##* @ }" ;;
      blocked)
        [ -n "$rest" ] || die "blocked wymaga opisu: co odblokuje zadanie"
        line="Task ${id}: blocked (${rest}) ${sig}" ;;
      cancelled)
        [ -n "$rest" ] || die "cancelled wymaga powodu"
        line="Task ${id}: cancelled (${rest}) ${sig}" ;;
      self-verified)
        # Dopuszczalne też „self-verified r<k> [opis]” (forma z ledgera).
        case "$rest" in r[0-9]*) if [ -z "$round" ]; then round="${rest%% *}"; round="${round#r}"; case "$rest" in *" "*) rest="${rest#* }" ;; *) rest="" ;; esac; fi ;; esac
        round="${round:-1}"; num --round "$round"
        line="Task ${id}: self-verified r${round}$(paren "$rest") ${sig}" ;;
      status-request)
        line="Task ${id}: status-request$(paren "$rest") ${sig}" ;;
      implementer)
        st="${rest%% *}"; case "$rest" in *" "*) rest="${rest#* }" ;; *) rest="" ;; esac
        case "$st" in DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED) ;; *) die "implementer: DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED („${st}”)" ;; esac
        line="Task ${id}: implementer ${st}$(paren "$rest") ${sig}" ;;
      fix-round)
        num --round "$round"; num --addressed "$addressed"; num --open "$open"
        line="Task ${id}: fix round ${round}/2 (${addressed} addressed, ${open} open${rest:+ — $rest}) ${sig}" ;;
      complete)
        [ -n "$rest" ] || die "complete wymaga opisu (commits, PR, SHA na main)"
        line="Task ${id}: complete (${rest}) ${sig}" ;;
      *) die "nieznany stan: $state (dispatched|blocked|cancelled|self-verified|status-request|implementer|fix-round|complete)" ;;
    esac ;;
esac

# Ledger bez końcowego \n skleiłby wpis z ostatnią linią.
if [ -s "$ledger" ] && [ "$(tail -c1 "$ledger" | wc -l | tr -d ' ')" = 0 ]; then printf '\n' >> "$ledger"; fi
printf '%s\n' "$line" >> "$ledger"
echo "$line"
