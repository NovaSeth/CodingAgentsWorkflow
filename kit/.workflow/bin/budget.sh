#!/usr/bin/env bash
# budget.sh — budżet maszyny: sprawdź PRZED każdym zleceniem agenta, zadania zewnętrznego wykonawcy albo przebiegu E2E.
# Jeden łączny limit dla całej maszyny, sprawdzany skryptem, bez wyjątków „na chwilę”
# — limity per klasa procesów nie wystarczą, bo wyjątki sumują się po cichu.
#
# Użycie: budget.sh [agent|executor|e2e]
#   wyjście 0 + „OK”           → można zlecać
#   wyjście 1 + „CZEKAJ: …”    → czekaj (wypisuje powody)
#
# Tryb: plik .workflow/budget.mode z treścią „normalny” albo „wysoki” (wysoki = człowiek nie pracuje na maszynie).
# Progi: zmienna środowiska > .workflow/budget.local.env (ta maszyna, z dev-setup.sh) > .workflow/budget.env (wspólne) > domyślne.
#   LOAD_MAX         maks. load (1 min); domyślnie ~1,7 × liczba rdzeni (wysoki: ~2,3 ×); „off” wyłącza kontrolę load
#   FREE_MIN         min. wolnej pamięci w %; domyślnie 30 (wysoki: 25). 0 wyłącza — tylko testy/CI; w pracy NIE WOLNO (RES-7).
#   Brak pomiaru load albo pamięci → CZEKAJ (fail closed), chyba że kontrola jest wyłączona (LOAD_MAX=off, FREE_MIN=0).
#   EXECUTOR_MAX     maks. równoległych zadań zewnętrznego wykonawcy; domyślnie 2
#   EXECUTOR_PATTERN wzorzec pgrep procesów wykonawcy (np. '<cli-wykonawcy> exec'); domyślnie pusty = nie licz
#   E2E_MAX          maks. równoległych przebiegów E2E; domyślnie 1
#   E2E_PATTERN      wzorzec pgrep przebiegów E2E (np. 'playwright test|detox test'); domyślnie pusty = nie licz
#   AGENT_MAX        maks. agentów z testami (informacyjnie — liczbę agentów pilnuje orkiestrator); domyślnie 3
set -u
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VARS="LOAD_MAX FREE_MIN LOAD_MAX_NORMAL LOAD_MAX_HIGH FREE_MIN_NORMAL FREE_MIN_HIGH EXECUTOR_MAX EXECUTOR_PATTERN E2E_MAX E2E_PATTERN AGENT_MAX"
# Zmienne środowiska mają pierwszeństwo przed plikami: zapamiętaj je przed wczytaniem plików i przywróć po nim.
from_env=""
for v in $VARS; do if [ -n "${!v+x}" ]; then from_env="$from_env $v"; eval "env_$v=\"\${$v}\""; fi; done
[ -f "$here/../budget.env" ] && . "$here/../budget.env"          # wspólne progi zespołu (w gicie)
[ -f "$here/../budget.local.env" ] && . "$here/../budget.local.env"  # progi tej maszyny (dev-setup.sh, poza gitem)
for v in $from_env; do eval "$v=\"\${env_$v}\""; done
mode="$(cat "$here/../budget.mode" 2>/dev/null || echo normalny)"

cores="$( (getconf _NPROCESSORS_ONLN || sysctl -n hw.ncpu || nproc) 2>/dev/null | head -1)"
cores="${cores:-4}"
# Kolejność: LOAD_MAX/FREE_MIN (środowisko albo plik) > progi trybu (LOAD_MAX_NORMAL/HIGH, FREE_MIN_NORMAL/HIGH) > domyślne z liczby rdzeni.
if [ "$mode" = wysoki ]; then
  LOAD_MAX="${LOAD_MAX:-${LOAD_MAX_HIGH:-$((cores * 23 / 10))}}"; FREE_MIN="${FREE_MIN:-${FREE_MIN_HIGH:-25}}"
else
  LOAD_MAX="${LOAD_MAX:-${LOAD_MAX_NORMAL:-$((cores * 17 / 10))}}"; FREE_MIN="${FREE_MIN:-${FREE_MIN_NORMAL:-30}}"
fi
EXECUTOR_MAX="${EXECUTOR_MAX:-2}"; E2E_MAX="${E2E_MAX:-1}"; AGENT_MAX="${AGENT_MAX:-3}"
EXECUTOR_PATTERN="${EXECUTOR_PATTERN:-}"; E2E_PATTERN="${E2E_PATTERN:-}"
# Progi muszą być liczbami całkowitymi (LOAD_MAX może być „off”) — inaczej porównanie w [ ] wywraca skrypt.
for v in FREE_MIN EXECUTOR_MAX E2E_MAX AGENT_MAX; do
  case "${!v}" in ''|*[!0-9]*) echo "budżet: $v=„${!v}” — wymagana liczba całkowita" >&2; exit 64 ;; esac
done
case "$LOAD_MAX" in off) ;; ''|*[!0-9]*) echo "budżet: LOAD_MAX=„${LOAD_MAX}” — wymagana liczba całkowita albo off" >&2; exit 64 ;; esac

# load 1 min (macOS: sysctl vm.loadavg „{ 1.23 … }”, Linux: /proc/loadavg)
if [ -r /proc/loadavg ]; then
  load="$(awk '{printf "%d", $1}' /proc/loadavg)"
else
  load="$(sysctl -n vm.loadavg 2>/dev/null | awk '{printf "%d", $2}')"
fi
case "$load" in ''|*[!0-9]*) load="" ;; esac

# wolna pamięć w %
free=""
if command -v memory_pressure >/dev/null 2>&1; then
  free="$(memory_pressure 2>/dev/null | awk -F': ' '/free percentage/{gsub("%","",$2); print int($2)}')"
elif [ -r /proc/meminfo ]; then
  free="$(awk '/MemTotal/{t=$2} /MemAvailable/{a=$2} END{if(t>0) printf "%d", a*100/t}' /proc/meminfo)"
fi
case "$free" in ''|*[!0-9]*) free="" ;; esac

count() { [ -z "$1" ] && { echo 0; return; }; pgrep -f "$1" 2>/dev/null | wc -l | tr -d ' '; }
executors="$(count "$EXECUTOR_PATTERN")"
e2e="$(count "$E2E_PATTERN")"

echo "budżet ($mode): load=${load:-?}/${LOAD_MAX} wolna_pamięć=${free:-?}%/${FREE_MIN}% wykonawca=${executors}/${EXECUTOR_MAX} e2e=${e2e}/${E2E_MAX} rdzenie=${cores}"
why=""
if [ "$LOAD_MAX" != off ]; then
  if [ -z "$load" ]; then echo "uwaga: brak pomiaru load — traktuję jak brak budżetu (wyłączenie: LOAD_MAX=off)" >&2; why="$why brak pomiaru load;"
  elif [ "$load" -ge "$LOAD_MAX" ]; then why="$why load>=${LOAD_MAX};"; fi
fi
[ "$FREE_MIN" = 0 ] && echo "uwaga: FREE_MIN=0 wyłącza bezpiecznik pamięci — w pracy NIE WOLNO (RES-7)" >&2
if [ "$FREE_MIN" != 0 ]; then
  if [ -z "$free" ]; then echo "uwaga: brak pomiaru wolnej pamięci — traktuję jak brak budżetu (wyłączenie: FREE_MIN=0)" >&2; why="$why brak pomiaru pamięci;"
  elif [ "$free" -lt "$FREE_MIN" ]; then why="$why pamięć<${FREE_MIN}%;"; fi
fi
kind="${1:-agent}"
case "$kind" in
  executor) [ "$executors" -ge "$EXECUTOR_MAX" ] && why="$why wykonawca>=$EXECUTOR_MAX;" ;;
  e2e)      [ "$e2e" -ge "$E2E_MAX" ] && why="$why e2e>=$E2E_MAX;" ;;
  agent)    : ;;
  *) echo "nieznany rodzaj: $kind (agent|executor|e2e)" >&2; exit 64 ;;
esac
if [ -n "$why" ]; then echo "CZEKAJ:$why"; exit 1; fi
[ "$kind" = agent ] && echo "przypomnienie: najwyżej $AGENT_MAX agentów z testami naraz"
echo "OK"
