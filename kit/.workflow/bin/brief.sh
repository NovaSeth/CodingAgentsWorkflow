#!/usr/bin/env bash
# brief.sh — wycina zadanie z planu do pliku briefu.
#   brief.sh <id> [plan.md]
# Szuka nagłówka „### Zadanie <id>” (albo „### Task <id>”) i kopiuje go do następnego nagłówka ## lub ###,
# z pominięciem nagłówków wewnątrz bloków kodu. Wynik: .workflow/tasks/<id>/brief.md
# Orkiestrator dopisuje potem: wykonawcę z routera, worktree, SHA bazy, zakres plików, polecenia bramki, ścieżkę raportu.
#
# Plan domyślny: zmienna PLAN albo najnowszy plik w docs/plans/.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
id="${1:?użycie: brief.sh <id> [plan.md]}"
# ID trafia do ścieżki .workflow/tasks/<id>/ — tylko bezpieczne znaki, bez „/” i „..”.
if ! printf '%s' "$id" | grep -Eq '^[A-Za-z0-9._-]+$' || case "$id" in *..*) true ;; *) false ;; esac; then
  echo "nieprawidłowe ID zadania „${id}”: dozwolone litery, cyfry, . _ - (bez „..”)" >&2; exit 2
fi
plan="${2:-${PLAN:-$(ls -t "$root"/docs/plans/*.md 2>/dev/null | head -1)}}"
[ -f "$plan" ] || { echo "brak planu (podaj ścieżkę albo ustaw PLAN)" >&2; exit 2; }
out_dir="$root/.workflow/tasks/$id"
out="$out_dir/brief.md"
mkdir -p "$out_dir"
if [ -e "$out" ] && [ "${FORCE:-0}" != 1 ]; then
  echo "$out już istnieje (FORCE=1, żeby nadpisać)" >&2; exit 1
fi
# Porównanie dosłowne (index), nie regex: „1.2” nie może pasować do „102”.
LC_ALL=C awk -v id="$id" '
  function heading(line, p,   c) {
    if (index(line, p) != 1) return 0
    c = substr(line, length(p) + 1, 1)
    return c == "" || c == ":" || c == " "
  }
  /^```/ { infence = !infence }
  !infence && /^##+ / { intask = heading($0, "### Zadanie " id) || heading($0, "### Task " id) }
  intask { print }
' "$plan" > "$out"
lines="$(wc -l < "$out" | tr -d ' ')"
multi=0
grep -Eq '"multiDev"[[:space:]]*:[[:space:]]*true' "$root/.workflow/config.json" 2>/dev/null && multi=1
if [ "$lines" -eq 0 ]; then
  rm -f "$out"; echo "nie znaleziono „### Zadanie ${id}” w ${plan}" >&2; exit 1
fi
{
  echo
  echo "---"
  echo "## Uzupełnia orkiestrator"
  if [ -d "$root/.workflow/routing" ]; then echo "- Wykonawca (router: node .workflow/routing/route.mjs <typ>): "
  else echo "- Wykonawca (rola z CLAUDE.md §Role, np. agent implementer): "; fi
  if [ "$multi" = 1 ]; then
    echo "- Orkiestrator: $(git -C "$root" config workflow.author 2>/dev/null || echo '<inicjały — uruchom .workflow/bin/dev-setup.sh>')"
    echo "- Pas: "
  fi
  echo "- Worktree (ścieżka bezwzględna): "
  echo "- Gałąź i SHA bazy: "
  echo "- Zakres plików (tylko te): "
  echo "- Reguły (ID, czytane grepem w docs/workflow/metoda/): "
  echo "- Do przeczytania (plik §sekcja — tylko te fragmenty): "
  if [ -x "$root/.workflow/bin/heavy.sh" ]; then echo "- Bramka (ciężkie przez .workflow/bin/heavy.sh, bez potoku): "
  else echo "- Bramka (po kolei, bez potoku): "; fi
  echo "- Raport: $out_dir/report.md (w raporcie sekcja „Kontekst”: przeczytane pliki i zakresy linii)"
  echo "- Ostatnia odpowiedź: 5 linii (status, commity, testy, wątpliwości, ścieżka raportu)"
} >> "$out"
echo "$out: $lines linii z planu $(basename "$plan")"
