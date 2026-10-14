# 06. Orkiestracja, role i router wykonawców

**Cel:** określić, kto co robi, jak orkiestrator zleca zadania i jak router wybiera wykonawcę. **Czyta:** orkiestrator; wykonawcy (§Brief, §Statusy). **Kiedy:** przed zleceniem, przy wyborze wykonawcy, przy nadzorze.

**Mapa sekcji**
- §Orkiestrator — zakres, wyjątki, pętla.
- §Role — tabela ról.
- §Ekonomia kontekstu — co subagent dostaje.
- §Brief — brief wspólny i brief zadania.
- §Statusy — statusy wykonawcy, ostatnia odpowiedź.
- §Nadzór — prośba o status, weryfikacja, świeży agent.
- §Worktree i gałęzie — model gałęzi, tryb sekwencyjny, `S<n>`.
- §Router — typy, algorytm, limity dostawców.
- §Drugi dostawca — `run-other.sh`, commit.
- §Autonomia — lista stopów.
- §Procedura — zlecenie zadania.

## Reguły

### Orkiestrator

**ORK-1.** Orkiestrator (główna sesja, najmocniejszy model) prowadzi plan, pisze briefy, wybiera wykonawców, scala i zapisuje każdą decyzję rulingiem.
**ORK-2.** Orkiestratorowi **NIE WOLNO** pisać kodu funkcji; wyjątki (tylko oba): fundament F0–F1 i małe przepięcia mechaniczne weryfikowane asercjami; zadanie „szybkie” nie jest wyjątkiem.
**ORK-3.** Części wspólne zmienia wyłącznie zadanie wspólne `S<n>`: zleca orkiestrator, wykonuje designer (albo implementer przy zmianie mechanicznej), w zespole akceptuje właściciel z CODEOWNERS.
**ORK-4.** Nie przyjmuj raportu bez weryfikacji; raport podejrzanie szybki albo bez RED/GREEN sprawdź sam.
**ORK-5.** Działaj w pętli `node .workflow/bin/tick.mjs` (`02-proces-end-to-end.md` §Pętla orkiestratora — kroki ticku i warunek końca); w każdym ticku ORK-25, RES-11 i ORK-48.

### Role

**ORK-6.** Używaj ról z `.claude/agents/<rola>.md` (model i effort we frontmatterze):

| Rola | Model, effort | Do czego | Czego nie robi |
|---|---|---|---|
| designer | najmocniejszy, high | spec, `S<n>`, współbieżność | taśmowe zadania |
| implementer | średni, medium | implementacja, poprawki, TDD | części wspólne poza `S<n>`, scalanie, push |
| recenzent (`reviewer`) | średni, medium | recenzja, ponowna recenzja zawężona | zmiany kodu |
| `qa` | średni, low | klasyfikacja, audyt tablicy, triaż | rulingi |
| `mechanic` | najtańszy, low | porządki, grep, tablica | logika |
| agent `security` | średni, medium; audyt: najmocniejszy, high | przegląd bezpieczeństwa | zmiany kodu, żądania na zewnątrz |

**ORK-7.** Agent czyta brief jako pierwszy, bierze wartości dosłownie, raport zapisuje do pliku z briefu; **NIE WOLNO** mu uruchamiać subagentów.
**ORK-8.** Implementację pisze domyślnie jedna rodzina modeli; drugi dostawca: recenzje, przegląd krzyżowy, poprawki według pliku ustaleń (`fix-mechanical`); implementacja przez drugiego dostawcę tylko rulingiem (orkiestrator dopisuje `other` do `implement-lane` / `implement-shared` w `routing.json`).
**ORK-9.** Agent dodany w trakcie sesji działa od następnego startu; do tego czasu zlecaj agentowi ogólnemu z modelem i effortem z definicji.

### Ekonomia kontekstu

**ORK-10.** Subagent dostaje ścieżki (brief, spec §sekcja, plan §zadanie) i ID reguł; **NIE WOLNO** wklejać mu treści dokumentów ani historii sesji.
**ORK-11.** Brief cytuje reguły po ID („Obowiązują: KOD-3, REV-5”), nie ich treść.
**ORK-12.** Czytaj sekcje z `00-indeks.md` albo pojedyncze reguły (`node .workflow/bin/rules.mjs ORK-17`), nie całe dokumenty.
**ORK-13.** Wynik subagenta trafia do pliku; w odpowiedzi tylko 5 linii (ORK-23).
**ORK-14.** Stan czytaj skrótowo — MEM-2 (`11-pamiec-projektu.md` §Ekonomia kontekstu — co czytać skrótowo).

### Brief

**ORK-15.** Brief wspólny `.workflow/briefs/wspolny-<rodzaj>.md` trzyma wiążące reguły rodzaju zadań; brief zadania odwołuje się do niego jednym zdaniem.
**ORK-16.** Reguły briefu wspólnego dopisuj sekcjami z numerem rulingu; błąd wracający w recenzjach po raz trzeci (domyślnie 3) staje się sekcją z przykładem poprawnym, błędnym i testem.
**ORK-17.** Brief zadania `.workflow/tasks/<id>/brief.md` (szablon `.workflow/templates/task/brief.md`) **MUSI** zawierać: wykonawcę i typ z routera; worktree, gałąź, SHA bazy, stan zależności; zakres plików; łańcuch przyczyn `plik:linia`; ponumerowane punkty akceptacji; testy RED; kto uruchamia E2E; bramkę (`heavy.sh`, limit workerów); ID reguł; ścieżkę raportu.
**ORK-18.** Ścieżki w briefie **MUSZĄ** być bezwzględne; brief recenzji **MUSI** nakazywać tryb tylko do odczytu.
**ORK-19.** Przed briefem: `git fetch && git merge --ff-only origin/main` w głównym checkoucie i oczekiwany SHA bazy w briefie.
**ORK-20.** Zadanie autorskie oznacz wprost — bo brief pełen `plik:linia` wykonawca bierze za recenzję.
**ORK-21.** Zmiana natywna: brief podaje, czego podgląd deweloperski nie wywołuje, flow po przebudowie i przygotowanie urządzeń.
**ORK-22.** Wykonawcy bez sieci merge `origin/main` i zależności przygotowuje orkiestrator przed zleceniem.

### Statusy

**ORK-23.** Ostatnia odpowiedź każdego wykonawcy (także recenzenta, `qa`, agenta `security`, drugiego dostawcy) ma 5 linii: status, commity albo wynik, testy, wątpliwości, ścieżka raportu.
**ORK-24.** Raport kończy się jednym statusem z tabeli; przy brakującym kontrakcie **NIE WOLNO** łatać lokalnie — status `NEEDS_CONTEXT`.

| Status | Znaczenie | Reakcja orkiestratora |
|---|---|---|
| `DONE` | bramka zielona | recenzja |
| `DONE_WITH_CONCERNS` | wątpliwości wypisane | ruling albo wątpliwości do briefu recenzji |
| `NEEDS_CONTEXT` | brak w kontrakcie lub danych | uzupełnia brief albo zakłada `S<n>` |
| `BLOCKED` | niewykonalne, powód podany | usuwa przeszkodę, ruling albo `task.sh <id> blocked "<co odblokuje>"` |

### Nadzór

**ORK-25.** Agent pracujący dłużej niż 20 min (domyślnie; próg rulingiem) dostaje prośbę o status w 5 liniach (skończone, teraz, czeka na, pliki spoza zakresu, ETA); zapisz ją `task.sh <id> status-request` — `tick.mjs` liczy próg od tego wpisu.
**ORK-26.** Komunikat agenta nie zastępuje weryfikacji: `git log --oneline origin/main..HEAD`, `git status --short`, diff części wspólnych, `pgrep`.
**ORK-27.** Brak odpowiedzi = ustal przyczynę (ostatni commit, procesy, blokady, wiek logu); agent wisi albo zbacza (pliki spoza zakresu, praca spoza briefu, ponad 2× próg ORK-25 bez commita) — przerwij i wznów z korektą.
**ORK-28.** Agent z kontekstem ponad ~250 tys. tokenów nie dostaje kolejnej rundy; dostaje ją świeży agent z plikiem ustaleń.
**ORK-29.** Małe zadania jednego obszaru łącz w paczkę zadania: jeden implementer, commit na zadanie, jedna recenzja.
**ORK-30.** Agenta zatrzymanego przez człowieka nie wznowisz: dokończ mechanicznie z diffu albo zleć nowemu agentowi z opisem stanu.

### Worktree i gałęzie

**ORK-31.** Od poziomu standard każde zadanie zapisujące pliki **MUSI** mieć własny worktree (`.worktrees/` w `.gitignore`); minimum to tryb sekwencyjny: gałąź zadania w głównym checkoucie, jeden implementer naraz, recenzent tylko do odczytu.
**ORK-32.** Proces i kod w dwóch repo: worktree w repo kodu tworzy orkiestrator ręcznie.
**ORK-33.** Gałąź aktualizuj wyłącznie `git merge origin/main`, potem typecheck i zależności z lockfile; **NIE WOLNO** robić rebase po recenzji — bo zmienia SHA zapisane w ledgerze.
**ORK-34.** Jedno zadanie = jedna gałąź od `main` (`feat/<obszar>-<id>`, worktree `.worktrees/<id>`) = jeden PR do `main` po bramce zadania i recenzji; `S<n>`: `fix/shared-s<n>`, `.worktrees/shared-s<n>`; pas to obszar, nie gałąź; długożyjąca gałąź pasa tylko na poziomie full i rulingiem.
**ORK-35.** Zadaniu pasa **NIE WOLNO** łatać luk wspólnych; orkiestrator robi z nich `S<n>`, po scaleniu rozsyła notę o wpływie (`.workflow/templates/task/wplyw-na-pasy.md`, zamiany `plik:linia → nowa wersja`); przepięcie = osobny commit.
**ORK-36.** Przed scaleniem `S<n>` scal je próbnie w każdej otwartej gałęzi zadania (`git merge --no-commit --no-ff`, `git diff --cached --stat`, `git merge --abort`) i spisz wpływ w nocie.
**ORK-37.** Ustaw `git config branch.autoSetupMerge simple`; pierwszy push `git push -u origin HEAD`; **NIE WOLNO** używać `git stash` — bo stash jest wspólny dla worktree.
**ORK-38.** Do `main` tylko przez PR (`08-recenzje-i-bramki.md` §Bramka zadania — strategia scalania).

### Router

**ORK-39.** Przy więcej niż jednym wykonawcy wybiera router (poziom full); przy jednym modelu — tabela ORK-6.
**ORK-40.** Router bierze pierwszego kandydata typu z `.workflow/routing/routing.json` niewykluczonego przez ORK-43/ORK-44; wszyscy zablokowani — kod 3 bez polecenia.
**ORK-41.** Po zadaniu `--record`: rundy po pierwszej recenzji, przepuszczone ustalenia, trudność 1–3.
**ORK-42.** Jakość (mniej = lepiej) = średnia z 5 ostatnich zadań typu z `(rundy + 2 × przepuszczone) × 2 / trudność`.
**ORK-43.** Kandydat z ≥ 2 wynikami, który w 3 ostatnich zadaniach typu miał średnio > 2 rundy albo łącznie > 1 przepuszczone, jest pomijany, chyba że jest ostatni.
**ORK-44.** Po sygnale limitu: `route.mjs --limit <dostawca> tight|blocked <reset ISO>`; `blocked` pomija dostawcę, `tight` — kandydatów `expensive`; stan wygasa po resecie.
**ORK-45.** Co 5. zadanie typu (domyślnie) dostaje kandydat bez historii; przy Critical **MUSISZ** dodać `--critical` (bez próbkowania).
**ORK-46.** Para model–typ na próbie (pierwsze 2 zadania) dostaje pełną recenzję, nie zawężoną.
**ORK-47.** Tańszy wykonawca utrzymuje pozycję tylko wynikami w karcie wyników.
**ORK-48.** Rebalans w każdym ticku: kandydaci z ≥ 2 wynikami według `jakość + 0,15 × koszt`; zmiana do `routing-changes.md` i rulingiem do ledgera.
**ORK-49.** `thresholds`, `effortFactor`, `cost` w `routing.json` są domyślne do skalibrowania; zmiana = ruling.

Typy (`route.mjs --list`): `review-scoped` (ponowna recenzja zawężona), `review-task`, `review-concurrency`, `review-security`, `fix-mechanical`, `fix-judgment`, `implement-lane`, `implement-shared` (`S<n>`), `design`, `qa-classify`, `audit` (audyt, triaż), `chore` (`none` = polecenie w tle).

### Drugi dostawca

**ORK-50.** Wykonawcę innego dostawcy uruchamiaj tylko przez `.workflow/bin/run-other.sh <worktree> <brief> <nazwa> <read-only|workspace-write> <model> <effort>` z `OTHER_CLI`.
**ORK-51.** CLI drugiego dostawcy konfiguruj tylko flagami; **NIE WOLNO** edytować jego globalnej konfiguracji.
**ORK-52.** `read-only` przy recenzjach, `workspace-write` przy poprawkach; brief ścieżką bezwzględną.
**ORK-53.** Merge, instalację i commit robi orkiestrator: przegląda diff (asercje, zakres, części wspólne) i commituje z trailerami obu modeli.
**ORK-54.** Po `OTHER EXIT` w logu sprawdź `.workflow/tasks/<nazwa>/<nazwa>.last.md`; brak — ogon logu i ponowienie innym modelem pod nową nazwą.
**ORK-55.** Przed zleceniem: `budget.sh executor` (`07-zasoby-i-wspolbieznosc.md` §Budżet maszyny — limity wykonawców).
**ORK-56.** Kolejka drugiego dostawcy to plik listy z zajęciem wpisu kolejki (atomowe `mkdir .workflow/runs/claim/<nazwa>`), nie pętla na `pgrep`.
**ORK-57.** `AGENTS.md` — MEM-45 (`11-pamiec-projektu.md` §Plik wejścia — generowanie i `--check`).

### Autonomia

**ORK-58.** Orkiestrator sam rozstrzyga zakres techniczny, warianty, spec, plan i konflikty w planie, każdą decyzję zapisuje rulingiem; człowiek dostaje raport po bramce.
**ORK-59.** Orkiestrator **MUSI** pytać tylko przy: działaniach nieodwracalnych (przepisanie historii, publikacja poza repo, sekrety), kluczach i dostępach człowieka, zmianie zakresu lub priorytetów, kontakcie z osobami spoza projektu.
**ORK-60.** Zespół zewnętrzny nie blokuje: luka dostaje fallback (dane u siebie, nakładka, jawne 501), pytanie idzie do raportu dla PO.

## Procedura

1. `bash .workflow/bin/brief.sh <id>` (plan: najnowszy w `docs/plans/` albo `PLAN=<plik>`); uzupełnij pola ORK-17.
2. `node .workflow/routing/route.mjs <typ> <worktree> <brief> <id> [--critical]`.
3. `bash .workflow/bin/budget.sh agent|executor|e2e` — dalej tylko przy `OK`.
4. `git fetch && git worktree add .worktrees/<id> -b feat/<obszar>-<id> origin/main`; zależności z lockfile.
5. Zleć poleceniem z routera: ścieżka briefu + ID reguł.
6. Przed kolejnym zleceniem: `bash .workflow/bin/task.sh <id> dispatched --exec <wykonawca> --base <sha> [--pas <pas>]` (`--pas` w zespole; wpisów stanu nie pisz ręcznie — MEM-19); tablica → „w toku”.
7. Nadzór ORK-25–ORK-27; odbiór raportu ORK-24, ORK-26.
8. Recenzja: `08-recenzje-i-bramki.md` §Procedura — łańcuch do PR.
9. Po scaleniu: `route.mjs --record …`, `git worktree remove .worktrees/<id>`, `task.sh <id> complete "<commits, PR, SHA na main>"`, tablica → „zrobione”.

## Checklista

- [ ] Brief: pola ORK-17, ścieżki bezwzględne, ID reguł, `heavy.sh`, limit workerów.
- [ ] Wykonawca z routera (`--critical` przy Critical); `budget.sh` = `OK`.
- [ ] Gałąź zadania od aktualnego `origin/main`; zależności gotowe.
- [ ] `task.sh <id> dispatched` i tablica przed kolejnym zleceniem.
- [ ] Po raporcie: status jednoznaczny, ORK-26, RED/GREEN.
