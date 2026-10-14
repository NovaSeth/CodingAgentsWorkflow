#!/usr/bin/env bash
# run-other.sh — uruchamia zadanie u wykonawcy innego dostawcy (CLI innego modelu) w piaskownicy.
#   run-other.sh <worktree> <brief> <nazwa> <read-only|workspace-write> <model> <effort>
#
# Szablon: ustaw OTHER_CLI na polecenie Twojego narzędzia, które przyjmuje prompt na stdin i zapisuje
# ostatnią wiadomość do pliku. Placeholdery: {worktree} {mode} {model} {effort} {out} — wpisuj je bez cudzysłowów;
# skrypt podstawia w ich miejsce zacytowane zmienne środowiska ("$OTHER_WORKTREE" …), więc spacje i znaki
# specjalne w ścieżkach nie rozbijają polecenia ani go nie rozszerzają.
# Przykład (dopasuj do swojego narzędzia):
#   export OTHER_CLI='mycli exec -C {worktree} --sandbox {mode} --model {model} --effort {effort} -o {out} -'
#
# Zasady:
# - konfiguracja tylko flagami — nie edytuj globalnego pliku konfiguracyjnego narzędzia;
# - piaskownica zwykle nie ma sieci i nie pisze do .git: merge origin/main i instalację zależności robi
#   orkiestrator PRZED zleceniem; wykonawca nie commituje, tylko proponuje wiadomość commita w raporcie;
# - wynik zawsze do pliku (-o), nie tylko w ostatniej wiadomości — restart maszyny zabija proces;
# - po „EXIT” sprawdź, czy powstał plik .last.md; jeśli nie, przeczytaj ogon logu i ponów na innym modelu
#   pod NOWĄ nazwą.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
wt="${1:?worktree}"; brief="${2:?brief}"; name="${3:?nazwa}"; mode="${4:-read-only}"; model="${5:-}"; effort="${6:-medium}"
: "${OTHER_CLI:?ustaw OTHER_CLI (patrz nagłówek skryptu)}"
case "$brief" in /*) ;; *) echo "brief musi mieć ścieżkę bezwzględną" >&2; exit 2 ;; esac
case "$mode" in read-only|workspace-write) ;; *) echo "tryb: read-only|workspace-write" >&2; exit 2 ;; esac
printf '%s' "$name" | grep -Eq '^[A-Za-z0-9._-]+$' && [ "$name" != . ] && [ "$name" != .. ] \
  || { echo "nazwa: litery, cyfry, . _ - (trafia do ścieżek plików)" >&2; exit 2; }

out_dir="$root/.workflow/tasks/$name"; mkdir -p "$out_dir" "$root/.workflow/runs"
out="$out_dir/$name.last.md"; log="$root/.workflow/runs/other-$name.log"
[ -e "$out" ] && { echo "$out istnieje — ponowienie pod nową nazwą" >&2; exit 1; }

if [ "$mode" = read-only ]; then
  prompt="Jesteś recenzentem. Przeczytaj brief $brief i wykonaj go dokładnie. Tylko odczyt: nie zmieniasz plików.
Zapisz recenzję do pliku wskazanego w briefie; jeśli piaskownica nie pozwala na zapis, zwróć całą recenzję w odpowiedzi.
Ostatnia odpowiedź: werdykt i liczba ustaleń per waga."
else
  prompt="Jesteś implementerem. Przeczytaj brief $brief i bierz wartości dosłownie.
TDD: najpierw test, pokaż, że jest czerwony; potem implementacja i zielony wynik.
Nie zmieniaj pakietów wspólnych, chyba że brief mówi inaczej. Nie uruchamiaj urządzeń ani E2E. Bez git stash, bez push.
Testy z ograniczoną liczbą workerów (np. --maxWorkers=2). Uruchom bramkę z briefu i skaner sekretów (bez potoku).
NIE commituj: zaproponuj wiadomość commita w raporcie. Raport zapisz do pliku z briefu.
Ostatnia odpowiedź w 5 liniach: podsumowanie, TDD, bramka, stan commitów, ścieżka raportu."
fi

# Wartości nie trafiają do tekstu polecenia: placeholder → "$OTHER_<NAZWA>" (cudzysłowy wokół placeholdera z szablonu są zdejmowane).
export OTHER_WORKTREE="$wt" OTHER_MODE="$mode" OTHER_MODEL="$model" OTHER_EFFORT="$effort" OTHER_OUT="$out"
cmd="$OTHER_CLI"
for p in worktree mode model effort out; do
  ph="{$p}"; dq="\"$ph\""; sq="'$ph'"
  var="\"\$OTHER_$(printf '%s' "$p" | tr '[:lower:]' '[:upper:]')\""
  cmd="${cmd//"$dq"/$ph}"; cmd="${cmd//"$sq"/$ph}"; cmd="${cmd//"$ph"/$var}"
done
echo "start $(date -Iseconds) $name ($mode $model $effort)" >> "$log"
printf '%s\n' "$prompt" | bash -c "$cmd" >> "$log" 2>&1
rc=$?
echo "OTHER EXIT $rc" >> "$log"
[ -s "$out" ] || echo "UWAGA: brak $out — przeczytaj ogon $log i ponów pod nową nazwą" >> "$log"
exit $rc
