#!/usr/bin/env bash
# claim.sh — atomowe zajmowanie pasa (obszaru) przez jednego orkiestratora w zespole wielu deweloperów.
#
#   claim.sh <pas> [opis]        zajmij pas na CLAIM_DAYS dni: tworzy na zdalnym repo gałąź claim/<pas>
#   claim.sh --renew <pas>       przedłuż SWOJE zajęcie o CLAIM_DAYS dni
#   claim.sh --release <pas>     zwolnij swój pas (--force: cudzy albo wygasły, po uzgodnieniu)
#   claim.sh --list              kto ma które pasy (przeterminowane: WYGASŁO)
#
# Atomowość daje serwer gita: gałąź claim/<pas> wskazuje na pusty commit „claim <pas> by <AUTOR> <data> do <RRRR-MM-DD>”.
# Drugi push na istniejącą gałąź jest odrzucany (non-fast-forward), więc dwie osoby nie zajmą pasa jednocześnie.
# Wygasłe zajęcie NIE przechodzi samo: przejęcie wymaga --release <pas> --force (po uzgodnieniu).
# Reguły ochrony gałęzi nie mogą blokować wzorca claim/*. Wymaga git config workflow.author (dev-setup.sh).
# Zmienne: WORKFLOW_REMOTE (domyślnie origin), CLAIM_DAYS (domyślnie 7).
# Kody: 0 ok / już twój · 1 pas zajęty przez innego · 2 błąd (remote, sieć, hook, brak autora, zła nazwa).
set -uo pipefail
remote="${WORKFLOW_REMOTE:-origin}"
days="${CLAIM_DAYS:-7}"
root="$(git rev-parse --show-toplevel)" || exit 2
cd "$root" || exit 2
valid() { printf '%s' "$1" | grep -Eq '^[a-z0-9][a-z0-9._-]*$' || { echo "nazwa pasa: małe litery, cyfry, . _ -" >&2; exit 2; }; }
need_author() {
  me="$(git config workflow.author || true)"
  [ -n "$me" ] || { echo "brak git config workflow.author — uruchom .workflow/bin/dev-setup.sh" >&2; exit 2; }
}
today() { date '+%Y-%m-%d'; }
printf '%s' "$days" | grep -Eq '^-?[0-9]+$' || { echo "CLAIM_DAYS: liczba dni" >&2; exit 2; }
until_date() {   # GNU date -d, BSD date -v
  local v; case "$days" in -*) v="${days}d" ;; *) v="+${days}d" ;; esac
  date -d "$days days" '+%Y-%m-%d' 2>/dev/null || date -v"$v" '+%Y-%m-%d'
}
# Pas spoza listy „areas” w .workflow/config.json → ostrzeżenie (nie blokada).
check_area() {
  local cfg=".workflow/config.json" list
  [ -f "$cfg" ] || return 0
  list="$(tr -d '\n' < "$cfg" | grep -oE '"areas"[[:space:]]*:[[:space:]]*("[^"]*"|\[[^]]*\])' | head -1 \
    | sed -E 's/^"areas"[[:space:]]*:[[:space:]]*//' | tr -d '"[] ' | tr ',' '\n' | grep -v '^$' || true)"
  [ -n "$list" ] || return 0
  printf '%s\n' "$list" | grep -qxF "$1" \
    || echo "uwaga: pas $1 nie jest na liście areas w $cfg ($(printf '%s' "$list" | tr '\n' ',' | sed 's/,$//')) — sprawdź nazwę" >&2
}
fetch_lane() { git fetch -q "$remote" "+refs/heads/claim/$1:refs/remotes/$remote/claim/$1" 2>/dev/null; }
subject() { git log -1 --format=%s "refs/remotes/$remote/claim/$1" 2>/dev/null; }
owner_of() { printf '%s' "$1" | sed -E 's/^claim [^ ]+ by ([^ ]+).*/\1/'; }
expiry_of() { printf '%s' "$1" | grep -oE ' do [0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1 | sed 's/^ do //'; }
expired() { local e; e="$(expiry_of "$1")"; [ -n "$e" ] && [[ "$e" < "$(today)" ]]; }
# Pusty commit z opisem zajęcia (drzewo puste — nie niesie kodu).
make_commit() {
  local tree msg
  tree="$(git hash-object -t tree /dev/null)"
  msg="claim $1 by $me $(date '+%Y-%m-%d %H:%M') do $(until_date)${2:+ — $2}"
  printf '%s\n' "$msg" | git commit-tree "$tree"
}

case "${1:-}" in
  --list)
    refs="$(git ls-remote "$remote" 'refs/heads/claim/*')" || { echo "brak dostępu do $remote" >&2; exit 2; }
    [ -n "$refs" ] || { echo "brak zajętych pasów"; exit 0; }
    git fetch -q "$remote" '+refs/heads/claim/*:refs/remotes/'"$remote"'/claim/*' || exit 2
    printf '%s\n' "$refs" | while read -r _ ref; do
      lane="${ref#refs/heads/claim/}"; s="$(subject "$lane")"
      if expired "$s"; then printf '%-20s %s  WYGASŁO\n' "$lane" "$s"; else printf '%-20s %s\n' "$lane" "$s"; fi
    done
    ;;
  --release)
    need_author
    lane="${2:?pas}"; valid "$lane"
    fetch_lane "$lane" || { echo "pas $lane nie jest zajęty"; exit 0; }
    seen="$(git rev-parse "refs/remotes/$remote/claim/$lane")" || exit 2
    owner="$(owner_of "$(subject "$lane")")"
    if [ "$owner" != "$me" ] && [ "${3:-}" != --force ]; then
      echo "pas $lane należy do $owner (ty: $me). Zwolnij po uzgodnieniu: claim.sh --release $lane --force" >&2; exit 1
    fi
    # --force-with-lease: usuń tylko zajęcie, które przed chwilą sprawdziliśmy — nowe zajęcie innej osoby zostaje.
    if ! err="$(git push -q --no-verify --force-with-lease="refs/heads/claim/$lane:$seen" "$remote" ":refs/heads/claim/$lane" 2>&1)"; then
      printf '%s\n' "$err" >&2
      echo "pas $lane zmienił się od sprawdzenia (ktoś go zwolnił albo zajął) — sprawdź: claim.sh --list" >&2; exit 2
    fi
    git update-ref -d "refs/remotes/$remote/claim/$lane"; echo "zwolniono $lane"
    ;;
  --renew)
    need_author
    lane="${2:?pas}"; valid "$lane"
    fetch_lane "$lane" || { echo "pas $lane nie jest zajęty — zajmij: claim.sh $lane" >&2; exit 1; }
    old="$(git rev-parse "refs/remotes/$remote/claim/$lane")"; s="$(subject "$lane")"
    owner="$(owner_of "$s")"
    [ "$owner" = "$me" ] || { echo "pas $lane należy do $owner (ty: $me) — przedłużyć może tylko właściciel" >&2; exit 1; }
    note=""; case "$s" in *" — "*) note="${s#* — }" ;; esac
    commit="$(make_commit "$lane" "$note")" || exit 2
    # --force-with-lease: nadpisz tylko własne zajęcie, które widzieliśmy przed chwilą.
    err="$(git push -q --no-verify --force-with-lease="refs/heads/claim/$lane:$old" "$remote" "$commit:refs/heads/claim/$lane" 2>&1)" \
      || { printf '%s\n' "$err" >&2; exit 2; }
    echo "przedłużono pas $lane ($me) do $(until_date)"
    ;;
  ''|-h|--help) sed -n '2,15p' "$0"; exit 0 ;;
  -*) echo "nieznana opcja: $1" >&2; exit 2 ;;
  *)
    need_author
    lane="$1"; valid "$lane"; note="${2:-}"
    check_area "$lane"
    commit="$(make_commit "$lane" "$note")" || exit 2
    # --no-verify: commit jest pusty, skan sekretów w hooku pre-push nie ma tu czego sprawdzać.
    if err="$(git push -q --no-verify "$remote" "$commit:refs/heads/claim/$lane" 2>&1)"; then
      echo "zajęto pas $lane ($me) do $(until_date)"; exit 0
    fi
    # Odrzucenie pushu nie musi znaczyć „zajęty” — rozstrzyga stan refu na zdalnym repo.
    ls="$(git ls-remote "$remote" "refs/heads/claim/$lane" 2>&1)" || { printf '%s\n%s\n' "$err" "$ls" >&2; exit 2; }
    if [ -z "$ls" ]; then printf 'nie udało się zająć pasa %s (pas wolny, błąd gita):\n%s\n' "$lane" "$err" >&2; exit 2; fi
    fetch_lane "$lane" || { printf '%s\n' "$err" >&2; exit 2; }
    s="$(subject "$lane")"; owner="$(owner_of "$s")"
    if [ "$owner" = "$me" ]; then echo "pas $lane jest już twój: $s (przedłużenie: claim.sh --renew $lane)"; exit 0; fi
    echo "pas $lane jest już zajęty: $s — zajęty przez $owner" >&2
    if expired "$s"; then
      echo "zajęcie wygasło ($(expiry_of "$s")) — przejęcie tylko po uzgodnieniu: claim.sh --release $lane --force, potem claim.sh $lane" >&2
    fi
    exit 1
    ;;
esac
