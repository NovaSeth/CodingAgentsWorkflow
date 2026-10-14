#!/usr/bin/env bash
# dev-setup.sh — konfiguracja procesu dla JEDNEGO dewelopera na JEGO maszynie. Uruchom po sklonowaniu repo.
#
#   .workflow/bin/dev-setup.sh [--author XY] [--yes] [--force-hooks]
#
# Robi (idempotentnie):
#   1. git config core.hooksPath .githooks (hook pre-push ze skanerem sekretów) i branch.autoSetupMerge simple;
#      inny menedżer hooków (core.hooksPath, aktywne .git/hooks) zostaje z ostrzeżeniem, chyba że --force-hooks
#   2. identyfikator autora decyzji (git config workflow.author) — w zespole unikalny, rejestrowany w .workflow/developers.txt
#   3. progi budżetu tej maszyny → .workflow/budget.local.env (poza gitem; nadpisuje wspólne budget.env)
#   4. sprawdza narzędzia wymagane przez stos z .workflow/config.json
set -uo pipefail
root="$(git rev-parse --show-toplevel)" || { echo "uruchom w repo projektu" >&2; exit 2; }
cd "$root" || exit 2
AUTHOR=""; YES=0
while [ $# -gt 0 ]; do
  case "$1" in
    --author) [ $# -ge 2 ] && [ -n "$2" ] || { echo "--author wymaga wartości, np. --author MG" >&2; exit 2; }; AUTHOR="$2"; shift 2 ;;
    --yes|-y) YES=1; shift ;;
    --force-hooks) FORCE_HOOKS=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "nieznana opcja: $1" >&2; exit 2 ;;
  esac
done
cfg=".workflow/config.json"
get() { [ -f "$cfg" ] && grep -oE "\"$1\"[[:space:]]*:[[:space:]]*(\"[^\"]*\"|true|false)" "$cfg" | head -1 | sed -E 's/.*:[[:space:]]*"?([^"]*)"?/\1/'; }
multi="$(get multiDev)"; stack="$(get stack)"
ok=(); warn=(); registered=0

# 1. hooki i gałęzie
# Inny menedżer hooków (core.hooksPath ≠ .githooks albo aktywne hooki w .git/hooks) zostaje: przełączenie wyłączyłoby
# jego hooki po cichu. Wtedy wywołaj .githooks/pre-push z jego hooka pre-push albo uruchom z --force-hooks.
cur_hooks="$(git config core.hooksPath || true)"
git_hooks="$(git rev-parse --git-path hooks)"
own_hooks="$(ls "$git_hooks" 2>/dev/null | grep -v '\.sample$' || true)"
if [ "$cur_hooks" = .githooks ]; then ok+=("core.hooksPath = .githooks")
elif [ "${FORCE_HOOKS:-0}" != 1 ] && { [ -n "$cur_hooks" ] || [ -n "$own_hooks" ]; }; then
  found="${cur_hooks:+core.hooksPath = $cur_hooks}"
  [ -n "$own_hooks" ] && found="${found:+$found; }aktywne hooki w $git_hooks: $(printf '%s' "$own_hooks" | tr '\n' ' ' | sed 's/ $//')"
  warn+=("hooki: $found — nie przełączono; dopisz do hooka pre-push wywołanie: bash .githooks/pre-push \"\$@\" (stdin przekaż dalej) albo uruchom ponownie z --force-hooks")
else
  git config core.hooksPath .githooks && ok+=("core.hooksPath = .githooks")
fi
git config branch.autoSetupMerge simple && ok+=("branch.autoSetupMerge = simple")
[ -x .githooks/pre-push ] || chmod +x .githooks/pre-push 2>/dev/null || true

# 2. autor decyzji
# Inicjały z imienia i nazwiska: polskie znaki transliterowane (Ł→L, ż→Z), jeden człon → dwie pierwsze litery.
initials() {
  printf '%s' "$1" | LC_ALL=C sed -e 's/ą/a/g;s/ć/c/g;s/ę/e/g;s/ł/l/g;s/ń/n/g;s/ó/o/g;s/ś/s/g;s/ź/z/g;s/ż/z/g' \
      -e 's/Ą/A/g;s/Ć/C/g;s/Ę/E/g;s/Ł/L/g;s/Ń/N/g;s/Ó/O/g;s/Ś/S/g;s/Ź/Z/g;s/Ż/Z/g' \
    | LC_ALL=C tr -c 'A-Za-z\n' ' ' \
    | LC_ALL=C awk '{ if (NF == 1) out = substr($1, 1, 2); else for (i = 1; i <= NF && i <= 4; i++) out = out substr($i, 1, 1) }
                    END { print toupper(out) }'
}
current="$(git config workflow.author || true)"
if [ -z "$AUTHOR" ]; then AUTHOR="$current"; fi
if [ -z "$AUTHOR" ]; then
  name="$(git config user.name || echo '')"
  guess="$(initials "$name")"
  if [ "$YES" != 1 ] && [ -t 0 ]; then
    printf 'Twoje inicjały do numerów decyzji (np. %s): ' "${guess:-AB}"; read -r AUTHOR
  fi
  AUTHOR="${AUTHOR:-$guess}"
fi
AUTHOR="$(printf '%s' "$AUTHOR" | tr '[:lower:]' '[:upper:]')"
printf '%s' "$AUTHOR" | grep -Eq '^[A-Z]{2,4}[0-9]?$' || {
  echo "inicjały „${AUTHOR}” są nieprawidłowe: 2–4 litery A–Z bez polskich znaków (opcjonalnie cyfra), np. MG albo MG2" >&2
  echo "podaj je jawnie: .workflow/bin/dev-setup.sh --author XY" >&2; exit 2; }
email="$(git config user.email || echo '?')"
if [ "$multi" = true ]; then
  touch .workflow/developers.txt
  other="$(grep -E "^$AUTHOR " .workflow/developers.txt | grep -vF "<$email>" || true)"
  if [ -n "$other" ]; then
    echo "inicjały $AUTHOR są już zajęte: $other — wybierz inne (--author XY2)" >&2; exit 1
  fi
  # -F: e-mail to tekst, nie wzorzec (np. jan+dev@… jako regex nie pasuje sam do siebie).
  grep -E "^$AUTHOR " .workflow/developers.txt | grep -qF "<$email>" || {
    echo "$AUTHOR $(git config user.name || echo '?') <$email> $(date +%Y-%m-%d)" >> .workflow/developers.txt
    ok+=("dopisano do .workflow/developers.txt"); registered=1
  }
fi
git config workflow.author "$AUTHOR" && ok+=("workflow.author = $AUTHOR")

# 3. progi tej maszyny
cores="$( (getconf _NPROCESSORS_ONLN || sysctl -n hw.ncpu || nproc) 2>/dev/null | head -1)"; cores="${cores:-4}"
if [ -r /proc/meminfo ]; then mem_gb="$(awk '/MemTotal/{printf "%d", $2/1048576}' /proc/meminfo)"
else mem_gb="$(( $(sysctl -n hw.memsize 2>/dev/null || echo 8589934592) / 1073741824 ))"; fi
agents=3; [ "$mem_gb" -lt 16 ] && agents=2; [ "$mem_gb" -ge 48 ] && [ "$cores" -ge 12 ] && agents=4
if [ -f .workflow/budget.local.env ]; then
  ok+=("budget.local.env istnieje — bez zmian")
else
  cat > .workflow/budget.local.env <<EOF
# Progi budżetu TEJ maszyny ($cores rdzeni, ${mem_gb} GB) — wygenerowane przez dev-setup.sh $(date +%Y-%m-%d). Poza gitem.
LOAD_MAX_NORMAL=$((cores * 17 / 10))
LOAD_MAX_HIGH=$((cores * 23 / 10))
FREE_MIN_NORMAL=30
FREE_MIN_HIGH=25
AGENT_MAX=$agents
EXECUTOR_MAX=2
E2E_MAX=1
EOF
  ok+=("budget.local.env: $cores rdzeni, ${mem_gb} GB → LOAD_MAX_NORMAL=$((cores * 17 / 10)), LOAD_MAX_HIGH=$((cores * 23 / 10)), AGENT_MAX=$agents")
fi
grep -qxF 'budget.local.env' .workflow/.gitignore 2>/dev/null || echo 'budget.local.env' >> .workflow/.gitignore

# 4. narzędzia
need=(git)
case "$stack" in typescript) need+=(node npm) ;; python) need+=(python3) ;; esac
grep -q '"ci"[[:space:]]*:[[:space:]]*"github"' "$cfg" 2>/dev/null && need+=(gh)
for t in "${need[@]}"; do command -v "$t" >/dev/null 2>&1 && ok+=("$t: $(command -v "$t")") || warn+=("brak narzędzia: $t"); done
if [ "$stack" = typescript ] && command -v node >/dev/null; then
  major="$(node -p 'process.versions.node.split(".")[0]')"; [ "$major" -ge 24 ] || warn+=("node $major < 24 (stos wymaga ≥ 24)")
fi

echo "dev-setup ($AUTHOR):"; printf '  ✓ %s\n' "${ok[@]}"
[ "${#warn[@]}" -gt 0 ] && printf '  ! %s\n' "${warn[@]}"
echo "Następne kroki:"
k=0; step() { k=$((k + 1)); echo "  $k. $*"; }
if [ "$multi" = true ]; then
  [ "$registered" = 1 ] && step "zacommituj .workflow/developers.txt na gałęzi i otwórz PR (git switch -c dev/$AUTHOR; git add .workflow/developers.txt; git commit -m 'dev: $AUTHOR'; git push -u origin HEAD)"
  step "sprawdź zajęte pasy: .workflow/bin/claim.sh --list; zajmij swój: .workflow/bin/claim.sh <pas>"
  step "przeczytaj docs/workflow/zespol.md — pasy, właściciele, decyzje [wspólne]"
fi
case "$stack" in
  typescript) step "zainstaluj zależności stosu: npm ci (szczegóły: .workflow/stacks/typescript/README.md)" ;;
  python) step "zainstaluj zależności stosu (środowisko wirtualne + lock; szczegóły: .workflow/stacks/python/README.md)" ;;
  *) step "zainstaluj zależności projektu według README.md" ;;
esac
step "przeczytaj CLAUDE.md §Mapa wiedzy; decyzje zapisuj przez .workflow/bin/ruling.sh"
exit 0
