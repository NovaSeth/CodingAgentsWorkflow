#!/usr/bin/env bash
# check-key-leak.sh — szuka PRAWDZIWYCH wartości sekretów z pliku .env w repo, historii i artefaktach builda.
# Uzupełnia check-secrets.sh (wzorce): tutaj szukamy dokładnie Twoich wartości, także ich fragmentów.
#
#   check-key-leak.sh [--env <plik>] [--history] [--dir <katalog-artefaktu>]… [--forbid-name <tekst>]…
#     --env          plik env (domyślnie: $KEY_LEAK_ENV, ./.env, .env głównego checkoutu)
#     --history      przeszukaj też historię gita (git log --all -S)
#     --dir          katalog artefaktu klienta (np. paczka JS, build web); można podać wiele razy
#     --forbid-name  tekst, który nie może wystąpić w artefaktach klienta (np. nazwa zmiennej z sekretem, adres systemu zewnętrznego)
#
# Wyjście: 0 czysto · 1 wyciek · 2 pominięte lub błąd („pominięcie nie jest sukcesem”).
# Nigdy nie drukuje wartości — tylko ścieżki, skróty commitów i liczby.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 2

ENV_FILE="${KEY_LEAK_ENV:-}"; HISTORY=0; DIRS=(); FORBID=()
need() { [ $# -ge 2 ] && [ -n "$2" ] || { echo "key-leak: $1 wymaga wartości" >&2; exit 2; }; }
while [ $# -gt 0 ]; do
  case "$1" in
    --env) need "$@"; ENV_FILE="$2"; shift 2 ;;
    --history) HISTORY=1; shift ;;
    --dir) need "$@"; DIRS+=("$2"); shift 2 ;;
    --forbid-name) need "$@"; FORBID+=("$2"); shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "nieznana opcja: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$ENV_FILE" ]; then
  if [ -f .env ]; then ENV_FILE=.env
  else
    common="$(git rev-parse --git-common-dir 2>/dev/null)"
    [ -n "$common" ] && [ -f "$common/../.env" ] && ENV_FILE="$common/../.env"
  fi
fi
[ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ] || { echo "key-leak: brak pliku .env — POMINIĘTE (kod 2)" >&2; exit 2; }

# Błąd narzędzia (git, grep) = wynik nieważny (kod 2), nigdy „czysto”.
invalid() { echo "key-leak: $1 — wynik nieważny" >&2; exit 2; }
patterns="$(mktemp)" || exit 2; chmod 600 "$patterns"
trap 'rm -f "$patterns"' EXIT
n=0
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"                                   # pliki z CRLF
  line="${line#"${line%%[![:space:]]*}"}"; line="${line#export }"
  case "$line" in ''|\#*) continue ;; *=*) ;; *) continue ;; esac
  name="${line%%=*}"; value="${line#*=}"
  value="${value%"${value##*[![:space:]]}"}"               # końcowe spacje
  value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
  # dopasowanie w bashu (bez zewnętrznego grep — jego awaria nie może po cichu pominąć zmiennej)
  upper="$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')" || invalid "błąd tr"
  case "$upper" in *TOKEN*|*KEY*|*SECRET*|*PASSWORD*|*PASSWD*|*CREDENTIAL*) ;; *) continue ;; esac
  [ "${#value}" -ge 8 ] || continue
  printf '%s\n' "$value" >> "$patterns"
  if [ "${#value}" -ge 10 ]; then
    printf '%s\n' "${value:0:8}" >> "$patterns"
    printf '%s\n' "${value: -8}" >> "$patterns"
  fi
  n=$((n + 1))
done < "$ENV_FILE"
[ "$n" -gt 0 ] || { echo "key-leak: brak zmiennych z sekretami w $ENV_FILE — POMINIĘTE (kod 2)" >&2; exit 2; }

work="$(mktemp -d)" || exit 2
trap 'rm -f "$patterns"; rm -rf "$work"' EXIT
leak=0
git rev-parse --git-dir >/dev/null 2>&1 || invalid "to nie jest repo git"
env_rel="$(git ls-files --full-name -- "$ENV_FILE" 2>"$work/err")" || invalid "błąd git ls-files: $(head -1 "$work/err")"
git ls-files -co --exclude-standard > "$work/all" 2>"$work/err" || invalid "błąd git ls-files: $(head -1 "$work/err")"
git ls-files -d > "$work/deleted" 2>"$work/err" || invalid "błąd git ls-files: $(head -1 "$work/err")"
printf '%s\n' "${ENV_FILE#./}" >> "$work/deleted"
# pliki śledzone usunięte z drzewa i sam plik env — poza skanem
grep -vxF -f "$work/deleted" "$work/all" > "$work/files" 2>"$work/err"; st=$?
[ "$st" -le 1 ] || invalid "błąd grep (lista plików): $(head -1 "$work/err")"
if [ -s "$work/files" ]; then
  # grep: 0 trafienie · 1 brak · 2 błąd; xargs zwraca ≠ 0 tylko po błędzie grepa (exit 255 przerywa xargs)
  tr '\n' '\0' < "$work/files" | xargs -0 sh -c 'grep -lIF -f "$0" -- "$@"; s=$?; [ "$s" -le 1 ] || exit 255' "$patterns" > "$work/hits" 2>"$work/err" \
    || invalid "błąd grep w plikach repo: $(head -1 "$work/err")"
  if [ -s "$work/hits" ]; then echo "WYCIEK w plikach repo:"; sed 's/^/  /' "$work/hits"; leak=1; fi
fi
[ -n "$env_rel" ] && { echo "WYCIEK: plik env jest śledzony przez git: $env_rel"; leak=1; }

if [ "$HISTORY" = 1 ]; then
  while IFS= read -r frag; do
    git log --all --format=%h -S"$frag" > "$work/log" 2>"$work/err" || invalid "błąd git log: $(head -1 "$work/err")"
    commits="$(head -5 "$work/log" | tr '\n' ' ')"
    if [ -n "$commits" ]; then echo "WYCIEK w historii (commity): $commits"; leak=1; fi
  done < "$patterns"
fi

for d in "${DIRS[@]+"${DIRS[@]}"}"; do
  [ -d "$d" ] || invalid "brak katalogu $d"
  grep -rlIF -f "$patterns" -- "$d" > "$work/hits" 2>"$work/err"; st=$?
  [ "$st" -le 1 ] || invalid "błąd grep w $d: $(head -1 "$work/err")"
  if [ -s "$work/hits" ]; then echo "WYCIEK w artefakcie $d:"; sed 's/^/  /' "$work/hits"; leak=1; fi
  for f in "${FORBID[@]+"${FORBID[@]}"}"; do
    grep -rqF -- "$f" "$d" 2>"$work/err"; st=$?
    [ "$st" -le 1 ] || invalid "błąd grep w $d: $(head -1 "$work/err")"
    if [ "$st" = 0 ]; then echo "ZAKAZANA nazwa w artefakcie $d (długość ${#f})"; leak=1; fi
  done
done

scope="repo"; [ "$HISTORY" = 1 ] && scope="$scope+historia"; [ "${#DIRS[@]}" -gt 0 ] && scope="$scope+artefakty(${#DIRS[@]})"
if [ "$leak" = 1 ]; then echo "key-leak: WYCIEK ($scope, sprawdzono $n zmiennych)" >&2; exit 1; fi
echo "key-leak: czysto ($scope, sprawdzono $n zmiennych)"
