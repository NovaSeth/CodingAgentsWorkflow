#!/usr/bin/env bash
# check-secrets.sh — skan wzorców sekretów i plików kluczy w repo git.
# Wyjście: 0 czysto · 1 znaleziska · 2 błąd narzędzia (wynik nieważny — NIGDY nie traktuj jak „czysto”).
#
# Tryby:
#   (bez argumentów)        bramka zadania: treść indeksu ORAZ drzewa roboczego (pliki śledzone i nieignorowane
#                           nieśledzone) — bo commit bierze indeks, a `git add -A` dołoży zmiany z drzewa;
#                           skan samego HEAD/indeksu przepuściłby sekret dopisany przed `git add`.
#   --staged                tylko linie dodane w indeksie względem HEAD (`git diff --cached`) i dodane pliki kluczy.
#   --range <rewizje…>      linie dodane we WSZYSTKICH commitach zakresu (`git log -p`, także sekret dodany
#                           i usunięty w kolejnym commicie) i pliki kluczy dodane w zakresie. Wszystkie dalsze
#                           argumenty idą do `git log`, np. `--range A..B` albo `--range B --not --remotes`.
#
# Wynik: tylko `plik:linia` (w trybie --range `commit:plik:linia`), nigdy treść linii — sekret nie trafia do logów.
# Uruchamiaj BEZ potoku i sprawdzaj kod wyjścia: `skrypt | tail -1` zwraca kod tail i przepuszcza bramkę.
#
# Syntetyczne wartości w testach oznaczaj znacznikiem SYNTH w treści linii albo komentarzem
# `check-secrets: syntetyczne` w tej samej linii. Filtr patrzy tylko na treść linii (nie na ścieżkę pliku);
# wzorce się nie zmieniają, a prawdziwy sekret nigdy nie ma znacznika.
#
# Wzorce własne projektu dopisuj w .workflow/secrets-patterns.txt (nie w tym pliku); działają w każdym trybie.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 2
git rev-parse --git-dir >/dev/null 2>&1 || { echo "secrets: to nie jest repo git — wynik nieważny" >&2; exit 2; }

MODE=tree
case "${1:-}" in
  '') ;;
  --staged) MODE=staged ;;
  --range) MODE=range; shift; [ $# -gt 0 ] || { echo "secrets: --range wymaga zakresu rewizji" >&2; exit 2; } ;;
  *) echo "użycie: check-secrets.sh [--staged | --range <rewizje…>]" >&2; exit 2 ;;
esac

# ci słowo → wzorzec bez rozróżniania wielkości liter ([Aa][Pp][Ii]); grep -E i git grep nie mają wspólnego -i per wzorzec.
ci() {
  local s="$1" u out="" i c d
  u="$(printf '%s' "$s" | tr '[:lower:]' '[:upper:]')"
  for ((i = 0; i < ${#s}; i++)); do
    c="${s:i:1}"; d="${u:i:1}"
    if [ "$c" != "$d" ]; then out="$out[$d$c]"; else out="$out$c"; fi
  done
  printf '%s' "$out"
}
# Nazwa klucza w dowolnej konwencji: api_key, apiKey, API_KEY, clientSecret, DB_PASSWORD, "password", authToken.
KEYNAME="($(ci api)[_-]?$(ci key)|$(ci secret)|$(ci token)|$(ci password)|$(ci passwd)|$(ci private)[_-]?$(ci key))([_-]?$(ci key))?"

PATTERNS=(
  'gh[pousr]_[A-Za-z0-9]{30,}'                                   # GitHub
  'github_pat_[A-Za-z0-9_]{40,}'
  '(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}'                         # OpenAI-podobne
  'sk-ant-[A-Za-z0-9_-]{20,}'                                     # Anthropic
  'AKIA[0-9A-Z]{16}'                                              # AWS access key
  'xox[baprs]-[A-Za-z0-9-]{10,}'                                  # Slack
  'AIza[0-9A-Za-z_-]{35}'                                         # Google API key
  '-----BEGIN ([A-Z]+ )?PRIVATE KEY-----'
  '[Bb]earer[[:space:]]+[A-Za-z0-9_.~+/-]{20,}'                   # nagłówek Authorization z tokenem
  'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}'                 # JWT
  # klucz: "wartość" / klucz = 'wartość' / "klucz": "wartość" (YAML, JSON, kod; tylko wartość literalna w cudzysłowie,
  # więc `apiKey: process.env.X`, `password: ""`, "${VAR}", "<placeholder>", "*****" i wartości z „:” (adresy URL,
  # identyfikatory testowe user:x) nie są trafieniami; znaki specjalne haseł (.!@#%…) są)
  "${KEYNAME}[\"']?[[:space:]]*(:=|=>|[:=])[[:space:]]*[\"'][^\"'[:space:]\$<>{}*:]{12,}[\"']"
  # wartość z „:” — trafienie tylko z cechą hasła (znak !@#%^&), bez „:/” (adres URL)
  "${KEYNAME}[\"']?[[:space:]]*(:=|=>|[:=])[[:space:]]*[\"'][^\"'[:space:]\$<>{}*]*:[^/\"'[:space:]\$<>{}*][^\"'[:space:]\$<>{}*]*[!@#%^&][^\"'[:space:]\$<>{}*]*[\"']"
  "${KEYNAME}[\"']?[[:space:]]*(:=|=>|[:=])[[:space:]]*[\"'][^\"'[:space:]\$<>{}*]*[!@#%^&][^\"'[:space:]\$<>{}*]*:[^/\"'[:space:]\$<>{}*][^\"'[:space:]\$<>{}*]*[\"']"
  # YAML bez cudzysłowu: api_key: wartość (do końca linii albo komentarza, ≥ 16 znaków)
  "${KEYNAME}[[:space:]]*:[[:space:]]+[A-Za-z0-9_/+=-]{16,}[[:space:]]*(#.*)?\$"
  '[?&](token|api_key|apikey|access_token)=[A-Za-z0-9_-]{8,}'      # sekret w URL
  '(^|[^A-Z_])[A-Z_]*(API_KEY|SECRET|TOKEN|PASSWORD)[A-Z_]*=["'\'']?[A-Za-z0-9_/+=-]{12,}'   # KEY=wartość w plikach env/konfiguracji
)
# Wzorce projektu: .workflow/secrets-patterns.txt (należy do projektu; tu nic nie dopisuj — aktualizacja frameworka nadpisze ten skrypt).
extra=".workflow/secrets-patterns.txt"
if [ -f "$extra" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%%[[:space:]]#*}"; line="${line#"${line%%[![:space:]]*}"}"; line="${line%"${line##*[![:space:]]}"}"
    case "$line" in ''|\#*) continue ;; esac
    PATTERNS+=("$line")
  done < "$extra"
fi
PATTERN="$(IFS='|'; echo "${PATTERNS[*]}")"
MARKER='SYNTH|check-secrets: syntetyczne|check-secrets: synthetic'
# Lockfile'i są skanowane (token rejestru w adresie „resolved” to realny wyciek); wykluczone tylko binarne.
EXCL=(':!:*.lockb')
# Pliki kluczy i env wydania nie mogą trafić do repo (w każdym katalogu, nie tylko w głównym).
KEYSPECS=(':(glob)**/*.keystore' ':(glob)**/*.jks' ':(glob)**/*.p12' ':(glob)**/*.pfx' ':(glob)**/*.pem' ':(glob)**/*.key'
  ':(glob)**/.env' ':(glob)**/.env.*' ':(exclude)*.example' ':(exclude)*.sample' ':(exclude)*.template')

TMP="$(mktemp -d "${TMPDIR:-/tmp}/check-secrets.XXXXXX")" || exit 2
trap 'rm -rf "$TMP"' EXIT
export LC_ALL=C

fail() { echo "secrets: $1 — wynik nieważny" >&2; exit 2; }

# git grep -z: plik\0linia\0treść → „plik:linia” dla linii pasujących, bez znacznika w TREŚCI.
grep_hits() {
  local st
  git grep -z -nIE "$@" -e "$PATTERN" -- . "${EXCL[@]}" > "$TMP/g" 2>"$TMP/err"; st=$?
  [ $st -le 1 ] || fail "błąd git grep ($st): $(head -1 "$TMP/err")"
  tr '\000' '\001' < "$TMP/g" | awk -v FS="$(printf '\001')" -v m="$MARKER" '{
    t = $3; for (i = 4; i <= NF; i++) t = t "\001" $i
    if (t !~ m) print $1 ":" $2 }' >> "$TMP/hits"
}

# Diff (git log -p / git diff) → treść dodanych linii ($TMP/c) i ich miejsce ($TMP/m), linia w linię.
# Obsługuje diff złożony merge'a (--cc): linia jest nowa, gdy ma „+” we wszystkich kolumnach rodziców.
scan_diff() {
  awk -v cf="$TMP/c" -v mf="$TMP/m" '
    substr($0, 1, 1) == "\001" { sha = substr($0, 2); inh = 0; file = ""; next }
    /^diff / { inh = 0; file = ""; next }
    !inh && /^\+\+\+ / {
      f = substr($0, 5)
      if (f ~ /^".*"$/) f = substr(f, 2, length(f) - 2)
      if (f == "/dev/null") f = ""; else if (substr(f, 1, 2) == "b/") f = substr(f, 3)
      file = f; next }
    /^@@/ {
      match($0, /^@+/); np = RLENGTH - 1; ln = 0
      n = split($0, a, " ")
      for (i = 2; i <= n; i++) if (substr(a[i], 1, 1) == "+") { s = substr(a[i], 2); sub(/,.*/, "", s); ln = s + 0; break }
      inh = 1; next }
    inh {
      pre = substr($0, 1, np)
      if (substr($0, 1, 1) == "\\") next
      if (length(pre) < np || pre !~ /^[-+ ]+$/) { inh = 0; next }
      if (index(pre, "-")) next
      if (pre ~ /^\++$/ && file != "") {
        print substr($0, np + 1) > cf
        print (sha == "" ? "" : substr(sha, 1, 12) ":") file ":" ln > mf }
      ln++ }' < "$TMP/diff"
  [ -f "$TMP/c" ] || return 0
  local st
  grep -nE -e "$PATTERN" "$TMP/c" > "$TMP/cg"; st=$?
  [ $st -le 1 ] || fail "błąd grep ($st)"
  grep -vE -e "^[0-9]+:.*($MARKER)" "$TMP/cg" | cut -d: -f1 > "$TMP/nums"
  awk 'NR == FNR { want[$1] = 1; next } want[FNR]' "$TMP/nums" "$TMP/m" >> "$TMP/hits"
}

DIFFOPTS=(--no-color --no-ext-diff --no-textconv -U0 --src-prefix=a/ --dst-prefix=b/ -M)
: > "$TMP/hits"
case $MODE in
  tree)
    git -c core.quotePath=false ls-files --cached --others --exclude-standard -- "${KEYSPECS[@]}" > "$TMP/keys" 2>"$TMP/err" \
      || fail "błąd git ls-files: $(head -1 "$TMP/err")"
    grep_hits --cached
    grep_hits --untracked ;;
  staged)
    git -c core.quotePath=false diff --cached --name-only --diff-filter=AR -M -- "${KEYSPECS[@]}" > "$TMP/keys" 2>"$TMP/err" \
      || fail "błąd git diff: $(head -1 "$TMP/err")"
    git -c core.quotePath=false diff --cached "${DIFFOPTS[@]}" -- . "${EXCL[@]}" > "$TMP/diff" 2>"$TMP/err" \
      || fail "błąd git diff: $(head -1 "$TMP/err")"
    scan_diff ;;
  range)
    git -c core.quotePath=false log --format=%x01%H --name-only --diff-filter=AR -M "$@" -- "${KEYSPECS[@]}" > "$TMP/klog" 2>"$TMP/err" \
      || fail "błąd git log ($*): $(head -1 "$TMP/err")"
    awk 'substr($0, 1, 1) == "\001" { sha = substr($0, 2, 12); next } NF { print sha ":" $0 }' "$TMP/klog" > "$TMP/keys"
    git -c core.quotePath=false log --format=%x01%H -p --cc "${DIFFOPTS[@]}" "$@" -- . "${EXCL[@]}" > "$TMP/diff" 2>"$TMP/err" \
      || fail "błąd git log ($*): $(head -1 "$TMP/err")"
    scan_diff ;;
esac

if [ -s "$TMP/keys" ]; then
  sort -u "$TMP/keys"
  echo "secrets: pliki kluczy lub env w repo (śledzone, nieignorowane albo dodane w zakresie)" >&2
  exit 1
fi
if [ -s "$TMP/hits" ]; then
  sort -u "$TMP/hits"
  echo "secrets: podejrzane linie (powyżej plik:linia; treść ukryta — otwórz plik lokalnie)" >&2
  exit 1
fi
echo "secrets: czysto"
