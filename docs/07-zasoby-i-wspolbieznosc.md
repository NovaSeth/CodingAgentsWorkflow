# 07. Zasoby maszyny i współbieżność

**Cel:** utrzymać równoległą pracę agentów w granicach maszyny, limitów API i zasobów wyłącznych. **Czyta:** orkiestrator; wykonawcy (§Kolejka ciężkich poleceń). **Kiedy:** przed każdym zleceniem, przy kalibracji maszyny, przy budowie kolejki do wspólnego zasobu, przy spowolnieniu.

**Mapa sekcji**
- §Trzy poziomy limitów — klasy zasobów i ich mechanizmy.
- §Budżet maszyny — `budget.sh`, progi domyślne, kolejność źródeł progów, tryb wysoki, fail closed.
- §Kolejka ciężkich poleceń — `heavy.sh`, limit workerów.
- §Kolejka zasobu wyłącznego — wymagania wobec kolejki i nadzorcy.
- §Limity API — czas do resetu, rozdział pracy.
- §Procesy w tle — weryfikacja startu, wyniki, sieroty.
- §Wyłączenie kontroli load — `LOAD_MAX=off`.
- §Procedura — kalibracja budżetu, wykrycie przeciążenia.

## Reguły

### Trzy poziomy limitów

**RES-1.** Pilnuj trzech klas zasobów, każdej jej mechanizmem (tabela).
**RES-2.** Wszystkie klasy spina jeden budżet maszyny sprawdzany skryptem; **NIE WOLNO** robić wyjątków „na chwilę” — bo wyjątki z różnych klas sumują się po cichu i zawieszają maszynę.

| Klasa | Co ogranicza | Mechanizm |
|---|---|---|
| Agenci i wykonawcy | równoległe sesje modeli (API, pamięć) | `budget.sh agent|executor` + `AGENT_MAX` |
| Ciężkie polecenia | pełne testy, typecheck repo, lint, build | `heavy.sh`: sloty + limit wątków |
| Zasoby wyłączne | urządzenie, emulator, przeglądarka z sesją, port, licencja | zwielokrotnienie albo kolejka z nadzorcą (RES-17–RES-30) |

### Budżet maszyny

**RES-3.** Przed każdym zleceniem agenta, zadania drugiego dostawcy i przebiegu E2E uruchom `bash .workflow/bin/budget.sh agent|executor|e2e`; zlecaj tylko przy `OK` (kod 0); `CZEKAJ: <powody>` (kod 1) = nie zlecaj, także gdy powodem jest brak pomiaru load lub pamięci (fail closed); kod 64 = błędny argument.
**RES-4.** Ustaw `EXECUTOR_PATTERN` i `E2E_PATTERN` (wzorce `pgrep`) — pusty wzorzec oznacza, że procesy tej klasy nie są liczone.
**RES-5.** Progi z tabeli pod spodem są domyślne do skalibrowania; własne wartości zapisz rulingiem z warunkiem powrotu.
**RES-6.** Progi trzymaj w `.workflow/`: `budget.env` (wspólne, w gicie) i `budget.local.env` (ta maszyna, z `dev-setup.sh`, poza gitem); kolejność źródeł: zmienne środowiska > `budget.local.env` > `budget.env` > domyślne z liczby rdzeni; tryb w `budget.mode` (poza gitem).
**RES-7.** **NIE WOLNO** zdejmować progu wolnej pamięci (`FREE_MIN=0`) w żadnym trybie — bo zawieszenia maszyny częściej wynikają z pamięci (swap) niż z procesora.
**RES-8.** Agentów z testami liczy orkiestrator, nie `budget.sh`: `budget.sh agent` mierzy tylko load i pamięć, a `AGENT_MAX` jedynie przypomina; agenci piszący wyłącznie dokumenty się nie liczą.
**RES-9.** Gdy działa ciężki emulator lub symulator, obniż `EXECUTOR_MAX` do 1 (domyślnie).
**RES-10.** Tryb wysoki (`echo wysoki > budget.mode` w `.workflow/`) włączaj tylko, gdy człowiek nie pracuje na maszynie; po jego powrocie wpisz `normalny`; przełączenie zapisz w ledgerze wpisem `Env:`.
**RES-11.** Wolne miejsca budżetu wypełniaj od razu następnym niezależnym zadaniem, zamiast czekać na recenzje i przebiegi.
**RES-12.** Progi per tryb ustawiaj kluczami `LOAD_MAX_NORMAL` / `LOAD_MAX_HIGH` i `FREE_MIN_NORMAL` / `FREE_MIN_HIGH` (tak pisze je `dev-setup.sh`); gołe `LOAD_MAX` / `FREE_MIN` obowiązują w obu trybach, więc tryb wysoki ich nie podnosi.

| Próg | Normalny | Wysoki |
|---|---|---|
| `LOAD_MAX_NORMAL` / `LOAD_MAX_HIGH` (load 1 min) | 1,7 × rdzenie | 2,3 × rdzenie |
| `FREE_MIN_NORMAL` / `FREE_MIN_HIGH` (wolna pamięć) | 30% | 25% |
| `EXECUTOR_MAX` / `E2E_MAX` | 2 / 1 | 2 / 1 |
| `AGENT_MAX` | 3 (`dev-setup.sh`: 2 przy < 16 GB, 4 przy ≥ 48 GB i ≥ 12 rdzeniach) | jak normalny |
| `HEAVY_SLOTS` | 2 | 3 |

### Kolejka ciężkich poleceń

**RES-13.** Pełne testy, typecheck całego repo, lint i build **MUSZĄ** iść przez `bash .workflow/bin/heavy.sh <polecenie…>` — każdy wykonawca, także drugi dostawca i orkiestrator.
**RES-14.** Nie obchodź mechaniki `heavy.sh`: sloty to katalogi `mkdir` w `HEAVY_DIR` (domyślnie `~/.cache/<projekt>-heavy`, wspólne dla wszystkich worktree projektu), sieroty (martwy pid albo brak pid > 2 min) są sprzątane, polecenie biegnie z `nice -n 10` i `HEAVY_THREADS` (domyślnie 4); kod wyjścia = kod polecenia.
**RES-15.** Każdy brief, niezależnie od wykonawcy, podaje limit workerów runnera testów (np. `--maxWorkers=2`) — bo nie każdy runner czyta zmienne ustawiane przez `heavy.sh`.
**RES-16.** Sprawdź, jak menedżer pakietów przekazuje argumenty do skryptu testów; błędnie przekazany limit daje „No tests found”.

### Kolejka zasobu wyłącznego

**RES-17.** Najpierw zwielokrotnij zasób (kontenery, osobne profile przeglądarki, porty per worktree); kolejkę buduj tylko dla zasobu, którego nie da się zwielokrotnić.
**RES-18.** Kolejka **MUSI** mieć kolejność (FIFO z priorytetem), limity (czas, zastój, rozmiar zadania), sterowanie (status, anulowanie, wstrzymanie) i niezależnego nadzorcę.
**RES-19.** Kolejność wyznaczają bilety FIFO, nie wyścig o wolną blokadę.
**RES-20.** Jeden wpis na worktree; duplikat kończy się osobnym kodem wyjścia.
**RES-21.** Pod blokadą wykonuj tylko pracę wymagającą zasobu (przebieg, zrzuty); analizę rób poza blokadą.
**RES-22.** Wszystkie kroki zadania biegną w jednym przebiegu narzędzia, nie w osobnym uruchomieniu na krok.
**RES-23.** Ustaw twardy limit czasu (domyślnie 30 min) i wykrywanie zastoju (domyślnie 10 min bez wyjścia), każdy z własnym kodem wyjścia; paczki dziel do ~15 min przebiegu.
**RES-24.** Przy kolejce leży jedna aktualna kopia skryptu, a kopie w worktree ją wywołują — bo stara kopia z gałęzi omija kolejkę.
**RES-25.** Tryby sterowania (status, anulowanie, wstrzymanie) nigdy nie wchodzą do kolejki.
**RES-26.** Nadzorca sprząta zadania osierocone po śmierci agenta; kolejka ma anulowanie.
**RES-27.** Nadzorca działa jako usługa systemowa niezależna od sesji, z dziennikiem interwencji, zainstalowana w trwałym katalogu (nie `/tmp`).
**RES-28.** Nadzorca nie zamraża procesu, który może przejmować blokadę; każde zamrożenie jest odwracalne także po śmierci nadzorcy.
**RES-29.** Nadzorca nie dodaje sztucznego „pulsu”; postęp pokazuje praca („krok k/N”), status pokazuje czas trzymania blokady (nie wiek procesu), jedna instancja = nasłuch na stałym porcie lokalnym, samoaktualizacja waliduje `bash -n` i ma wyjście awaryjne.
**RES-30.** Kod kolejki i nadzorcy recenzuje typ `review-concurrency` (najwyższy poziom), szukając zgubionego biletu, zamrożenia w trakcie przejęcia, padniętego nadzorcy i uszkodzonej wspólnej kopii; kolejka ma opis w `docs/workflow/podrecznik-orkiestratora.md` §5 — polecenia i kody wyjścia — oraz krok w procedurze wznowienia.

### Limity API

**RES-31.** Limity oceniaj po czasie do resetu, nie po procencie, i zapisuj stan w routerze (`06-orkiestracja-i-role.md` §Router — `--limit` i jego skutki).
**RES-32.** Każdy wykonawca commituje po każdym kroku — bo limit sesji przerywa wszystkich agentów naraz.
**RES-33.** Po przerwaniu przez limit najpierw inwentaryzacja (worktree, blokady, procesy), potem wznowienie (`11-pamiec-projektu.md` §Procedura — kroki wznowienia).
**RES-34.** Gdy limity jednego dostawcy się kończą: recenzje i poprawki według pliku ustaleń bierze drugi dostawca, oczekiwanie na zasób to polecenie w tle bez agenta, najdroższe modele zostają do projektowania i współbieżności.

### Procesy w tle

**RES-35.** Po starcie procesu w tle sprawdź `pgrep`; kod wyjścia polecenia startującego niczego nie dowodzi.
**RES-36.** Po każdym etapie w tle sprawdź kod wyjścia **i** liczbę wyników (testów, plików, wierszy), zanim uznasz etap za skończony.
**RES-37.** Logi i wyniki, które mają przetrwać restart, zapisuj w `.workflow/runs/`, nie w `/tmp`.
**RES-38.** Każde narzędzie, od którego zależy praca (most do aplikacji, nadzorca, pętla, monitor logów, blokada usypiania), ma krok w procedurze wznowienia.
**RES-39.** Po usunięciu worktree znajdź procesy wskazujące na nieistniejące ścieżki i zabij je.
**RES-40.** Zanim wskażesz przyczynę spowolnienia, zmierz: `uptime`, procesy (`ps -r` na macOS, `ps aux --sort=-%cpu` na Linuksie), swap (`sysctl vm.swapusage` / `free -h`).

### Wyłączenie kontroli load

**RES-41.** `LOAD_MAX=off` (w `budget.local.env`) wyłącza kontrolę load tylko tam, gdzie load nie jest miarodajny albo nie da się go zmierzyć (kontener, maszyna współdzielona); zapisz ruling; **NIE WOLNO** używać go, by zlecać mimo przeciążenia — bo zostaje wtedy tylko kontrola pamięci (RES-7).

## Procedura

Kalibracja budżetu na nowej maszynie:
1. `.workflow/bin/dev-setup.sh` — tworzy `budget.local.env` w `.workflow/` z progami maszyny.
2. Wpisz wzorce procesów:
   ```bash
   EXECUTOR_PATTERN='<cli-wykonawcy> exec'
   E2E_PATTERN='<runner e2e> test'
   ```
3. `bash .workflow/bin/budget.sh agent` na pustej maszynie i w trakcie `bash .workflow/bin/heavy.sh <pełne testy>`.
4. Maszyna zwalnia przed progiem: obniż `LOAD_MAX_NORMAL` / `LOAD_MAX_HIGH` albo podnieś `FREE_MIN_NORMAL` / `FREE_MIN_HIGH` w `budget.local.env`; zapisz ruling z warunkiem powrotu (RES-5).
5. `budget.sh` stale zwraca `CZEKAJ: brak pomiaru …`: napraw pomiar (narzędzie systemowe, uprawnienia); dla load bez wiarygodnego pomiaru — RES-41.

Wykrycie przeciążenia:
1. Wstrzymaj nowe zlecenia.
2. Zmierz (RES-40).
3. Zatrzymaj procesy spoza `heavy.sh` i bez limitu workerów albo poczekaj na ich koniec.
4. Usuń sieroty (RES-39).
5. Ledger: wpis `Env:` (co, jak cofnąć); nowa przyczyna → lekcja.

## Szablony i narzędzia

`.workflow/bin/budget.sh`, `.workflow/bin/heavy.sh`, `.workflow/bin/dev-setup.sh`, `.workflow/runs/` (logi w tle, poza gitem).

## Checklista

- [ ] `budget.sh <rodzaj>` = `OK`; agentów z testami < `AGENT_MAX`.
- [ ] Brief zawiera `heavy.sh` i limit workerów.
- [ ] `budget.mode` zgodny z tym, czy człowiek pracuje na maszynie.
- [ ] Proces w tle potwierdzony `pgrep`; log w `.workflow/runs/`.
- [ ] Po etapie: kod wyjścia i liczba wyników sprawdzone.
