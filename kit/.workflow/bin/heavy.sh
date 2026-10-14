#!/usr/bin/env bash
# heavy.sh — kolejka ciężkich poleceń (pełne testy, typecheck całego repo, lint, build).
# Najwyżej HEAVY_SLOTS poleceń naraz na całej maszynie, z niskim priorytetem i ograniczoną liczbą wątków.
# Bez kolejki równoległe runnery testów biorą wszystkie rdzenie i zawieszają maszynę.
#
# Użycie (z katalogu worktree):
#   bash .workflow/bin/heavy.sh npm test
#   bash .workflow/bin/heavy.sh pnpm -r typecheck
#   HEAVY_SLOTS=3 bash .workflow/bin/heavy.sh …
#
# Zmienne:
#   HEAVY_SLOTS    liczba slotów (domyślnie 2; 3 przy budget.mode = wysoki)
#   HEAVY_DIR      katalog slotów (domyślnie ~/.cache/<nazwa-projektu>-heavy — poza /tmp, przeżywa restart, a sloty martwych procesów są sprzątane)
#   HEAVY_THREADS  limit wątków runnerów testów (domyślnie 4)
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mode="$(cat "$here/../budget.mode" 2>/dev/null || echo normalny)"
SLOTS="${HEAVY_SLOTS:-$([ "$mode" = wysoki ] && echo 3 || echo 2)}"
# Nazwa projektu z katalogu wspólnego repo (.git głównego klonu), nie z worktree — wszystkie worktree dzielą sloty.
common="$(git -C "$here" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" || common=""
case "$common" in
  /*) ;;
  *) # starszy git bez --path-format: ścieżka może być względna wobec $here
     common="$(c="$(git -C "$here" rev-parse --git-common-dir 2>/dev/null)" && cd "$here" && cd "$c" && pwd)" || common="" ;;
esac
if [ -z "$common" ]; then project=project
elif [ "$(basename "$common")" = .git ]; then project="$(basename "$(dirname "$common")")"
else project="$(basename "$common" .git)"
fi
DIR="${HEAVY_DIR:-$HOME/.cache/${project}-heavy}"
THREADS="${HEAVY_THREADS:-4}"

if [ $# -eq 0 ]; then
  echo "użycie: heavy.sh <polecenie…>" >&2
  exit 64
fi

mkdir -p "$DIR"
# Limity wątków popularnych runnerów (ignorowane przez narzędzia, które ich nie znają).
export VITEST_MAX_THREADS="$THREADS" VITEST_MAX_FORKS="$THREADS" JEST_WORKERS="$THREADS" \
       PYTEST_XDIST_AUTO_NUM_WORKERS="$THREADS" GOMAXPROCS="$THREADS" CARGO_BUILD_JOBS="$THREADS"

slot=""
waited=0
while [ -z "$slot" ]; do
  for i in $(seq 1 "$SLOTS"); do
    L="$DIR/slot-$i"
    if mkdir "$L" 2>/dev/null; then   # mkdir jest atomowy: brak wyścigu o slot
      echo $$ > "$L/pid"
      slot="$L"
      break
    fi
    # Osierocony slot: nie żyje ani skrypt, ani uruchomione polecenie (child) — po zabiciu samego skryptu
    # polecenie dalej obciąża maszynę i trzyma slot. Brak pid i stary slot = osierocony.
    p="$(cat "$L/pid" 2>/dev/null || true)"; c="$(cat "$L/child" 2>/dev/null || true)"
    stale=0
    if [ -n "$p" ] && ! kill -0 "$p" 2>/dev/null && { [ -z "$c" ] || ! kill -0 "$c" 2>/dev/null; }; then stale=1
    elif [ -z "$p" ] && [ -n "$(find "$L" -maxdepth 0 -mmin +2 2>/dev/null)" ]; then stale=1
    fi
    # Przejęcie atomowe: mv udaje się tylko jednemu procesowi; drugi nie skasuje slotu, który pierwszy już założył.
    if [ "$stale" = 1 ] && mv "$L" "$L.stale.$$" 2>/dev/null; then
      if [ "$(cat "$L.stale.$$/pid" 2>/dev/null || true)" != "$p" ]; then
        # przeniesiony slot nie jest tym martwym (ktoś zdążył go przejąć) — oddaj go
        [ -e "$L" ] || mv "$L.stale.$$" "$L" 2>/dev/null
        continue
      fi
      rm -rf "$L.stale.$$"
      if mkdir "$L" 2>/dev/null; then echo $$ > "$L/pid"; slot="$L"; break; fi
    fi
  done
  if [ -z "$slot" ]; then
    [ $((waited % 60)) -eq 0 ] && echo "heavy: czekam na slot ($SLOTS zajęte, ${waited}s)" >&2
    sleep 3
    waited=$((waited + 3))
  fi
done
trap 'rm -rf "$slot"' EXIT INT TERM
echo "heavy: slot $(basename "$slot"), start $(date +%T): $*" >&2
# Uwaga dla Jest: limit workerów podawaj flagą bez '--' (np. `npm test -- --maxWorkers=2` zależnie od menedżera pakietów);
# sprawdź, jak Twoja wersja menedżera przekazuje argumenty — błędnie przekazane dają „No tests found”.
# Polecenie na pierwszym planie (Ctrl-C działa); jego pid trafia do slotu przed exec (nice i polecenie zachowują pid).
bash -c 'echo $$ > "$1/child"; shift; exec nice -n 10 "$@"' heavy "$slot" "$@"
rc=$?
echo "heavy: koniec $(date +%T), kod $rc" >&2
exit $rc
