# Podręcznik orkiestratora: czytaj po każdym wznowieniu

Czytaj ten plik jako pierwszy po limicie API, kompakcji kontekstu albo nowej sesji; dopiero potem działaj. Uzasadnienia: ledger `.workflow/progress.md` (decyzje R<n>) i `docs/workflow/lekcje.md`. Reguły metody: `docs/workflow/metoda/06-orkiestracja-i-role.md`, `07-zasoby-i-wspolbieznosc.md`, `08-recenzje-i-bramki.md`, `11-pamiec-projektu.md`, sytuacje poza cyklem: `16-runbooki.md` (w `docs/workflow/metoda/`). Aktualizuj ten plik, gdy zmienia się sposób pracy.

## 0. Procedura wznowienia (zawsze, w tej kolejności)
Uzasadnienie kroków: `docs/workflow/metoda/11-pamiec-projektu.md` §Procedura wznowienia — dlaczego ta kolejność.
0. Przeczytaj `CLAUDE.md` i `docs/workflow/zasady-wspolpracy.md`.
1. Przeczytaj ten plik.
2. `tail -80 .workflow/progress.md`: co było w toku.
3. Sprawdź agentów (lista agentów w narzędziu). Agent, który zginął na limicie, ma status „failed”.
4. **Inwentaryzacja:**
   - na każdym worktree `git log -1` i `git status`;
   - kolejki i blokady zasobów (status sprawdzaj skryptem z worktree z aktualnym `main`, nie ze starego checkoutu);
   - procesy: `pgrep -fl '<testy>|<e2e>|<wykonawca>'`; procesy z `PPID 1` to podejrzane sieroty;
   - **zacznij od plików z wynikami** (`.workflow/tasks/*/`, `.workflow/runs/`), nie od logów w `/tmp`.
5. Sprawdź tablicę zadań: zadania „w toku” i zmiany od ostatniego razu.
6. Wznów pracę. Krótkie zadania wiadomością do agenta z opisem stanu. Agentowi z dużym kontekstem (ponad ~250 tys. tokenów) daj świeżego agenta z plikiem ustaleń. Proces w tle mógł przeżyć sesję: sprawdź, zanim zlecisz od nowa.
7. Zapisz w ledgerze, co przerwało pracę i jak ją wznowiono. Stany zadań przerwanych: `bash .workflow/bin/task.sh <id> blocked "<co odblokuje>"` albo ponowne `dispatched`.
8. Usługi pomocnicze, od których zależy praca:
   - <usługa 1>: <polecenie statusu> / <polecenie startu>
   - <usługa 2>: …
9. Pętla: każdy tick = `node .workflow/bin/tick.mjs` + wykonanie wskazanych kroków. Wybudzenie planuj DOKŁADNIE promptem „uruchom `node .workflow/bin/tick.mjs` i wykonaj wskazane kroki” po czasie z `NASTĘPNY_TICK`; KONIEC → nie planuj wybudzenia, zatrzymaj pętlę, raport PO (strażnik `.claude/hooks/guard-schedule.mjs`, PRC-23) (`docs/workflow/metoda/02-proces-end-to-end.md` §Pętla orkiestratora).
10. Blokada usypiania na czas pracy autonomicznej (`caffeinate -dimsu` na macOS, `systemd-inhibit` na Linuksie).
11. Wczytaj skill `orkiestracja-agentow` (`.claude/skills/orkiestracja-agentow/SKILL.md`).<!--if:standard-->

## 1. Rola i autonomia
- Prowadzisz plan `<ścieżka planu>`. Działasz w pętli.
- Masz pełną autonomię. Decyzje zapisujesz w ledgerze jako „Ruling {{LEDGER_IDS}}: co — dlaczego — koszt błędu” przez `.workflow/bin/ruling.sh`.{{TEAM_HANDBOOK}} Zatrzymujesz się tylko przy rzeczach nieodwracalnych i wrażliwych, przy kluczach, które ma tylko człowiek, przy zmianach zakresu produktu i przy kontakcie z osobami spoza projektu.
- Nie piszesz kodu funkcji. Wyjątek: fundament (F0–F1) i małe przepięcia mechaniczne, które weryfikujesz asercjami.
- Kod trafia do `main` wyłącznie przez PR z gałęzi zadania; strategia scalania: REV-33. Commit na każdy krok, push po każdym zadaniu, przed pushem `check-secrets.sh`.
- Zapisy procesu (ledger, briefy, raporty, recenzje, lekcje) commitujesz w głównym checkoucie: solo bezpośrednio na `main`; w zespole na gałęzi `process/<AUTOR>` z PR co najmniej raz dziennie i przed przekazaniem pasa.
- Po każdej bramce obszaru: raport dla PO (szablon `.workflow/templates/gate/raport-dla-PO.md`).<!--if:standard-->
- Po każdej bramce obszaru: raport dla PO (struktura: `docs/workflow/metoda/08-recenzje-i-bramki.md` §Raport dla właściciela produktu — struktura).<!--if:!standard-->

## 2. Architektura pracy
- **Pasy (obszary):** <obszar: katalogi>. Pas to katalogi na wyłączność jednego orkiestratora, nie gałąź. Jedno zadanie = jedna gałąź `feat/<obszar>-<id>` od `main` = PR do `main`.
- **Worktree:** każde zadanie ma własny worktree `git worktree add .worktrees/<id> -b feat/<obszar>-<id> origin/main`; zadanie wspólne S<n> — `.worktrees/shared-s<n>`.<!--if:standard-->
- **Tryb sekwencyjny:** gałąź zadania w głównym checkoucie (`git switch -c feat/<obszar>-<id> origin/main`), jeden implementer naraz, recenzent tylko do odczytu; zapisy procesu commitujesz po powrocie na `main`.<!--if:!standard-->
- **Pas nie zmienia pakietów wspólnych** (<lista>). Braki zapisuje w „Lukach wspólnych”. Części wspólne zmienia wyłącznie zadanie wspólne S<n>: zlecasz je Ty, wykonuje designer (albo implementer przy zmianie mechanicznej), w zespole akceptuje właściciel z CODEOWNERS; po scaleniu rozsyłasz notę o wpływie (`.workflow/templates/task/wplyw-na-pasy.md`).
- **Przed pierwszym zleceniem planu:** skan przed startem w `.workflow/skan-przed-startem.md` (zadanie × zadanie × Global Constraints); każda sprzeczność = ruling.
- **Przed każdym zadaniem:** `git merge origin/main` i instalacja z lockfile. Nigdy rebase po recenzji — zmienia SHA zapisane w ledgerze. Przed briefem na główny checkout: `git fetch && git merge --ff-only origin/main`, a w briefie oczekiwany SHA.
- **Brief wspólny** (`.workflow/briefs/wspolny-implementer.md`) jest wiążący.<!--if:standard-->
- **Cykl zadania:** brief → wykonawca z routera → recenzja (inny wykonawca) → runda poprawek → ponowna recenzja zawężona → PR → merge → zapis (ledger, karta, tablica).
- **Stany zadań w ledgerze zapisuje tylko `task.sh`** (`tick.mjs` czyta tę gramatykę): `task.sh <id> dispatched --exec <wykonawca> --base <sha> [--pas <pas>]` · `blocked "<co odblokuje>"` · `cancelled "<powód>"` · `fix-round --round <k> --addressed <a> --open <o>` · `self-verified --round <k>` · `status-request` · `complete "<PR, SHA na main>"` · `task.sh gate <obszar>` · `task.sh release`.
- **Pliki zadania** (`.workflow/tasks/<id>/`): `brief.md`, `report.md` (z `## Runda poprawek <k>`), `review-r<k>-brief.md`, `review-r<k>.md`, `findings-r<k>.md`, `rereview-r<k>-brief.md`, `rereview-r<k>.md` (+ `.diff`).
- **Każda runda poprawek kończy się ponowną recenzją zawężoną**, także runda bramki. Własna weryfikacja wystarcza tylko przy poprawkach mechanicznych i UI; zapisz ją `task.sh <id> self-verified --round <k>`. Diff do pliku: `git log --oneline A..B; git diff --stat A..B; git diff -U10 A..B > .workflow/tasks/<id>/rereview-r<k>.diff`.
- **Wyłącznik po 2 rundach:** ustalenia niekrytyczne rozstrzygasz sam (ruling), Minor na listę odroczonych.
- **Przed scaleniem** sam uruchamiasz typecheck na gałęzi po `git merge origin/main`.
- **Sytuacje poza cyklem** (konflikt merge, spór z recenzentem, test niestabilny, hotfix, wycofanie, awaria, blokada, zmiana planu, migracja): `docs/workflow/metoda/16-runbooki.md` §Procedura — tylko podsekcja sytuacji.
- **Bramka obszaru:** przegląd krzyżowy innym dostawcą, pełne E2E z asercjami zachowania i danych na świeżym buildzie, jedna runda poprawek, PR, raport dla PO. Blokuje wada funkcjonalna, błędne dane albo ekran nieużywalny. Drobne różnice wizualne trafiają na listę.
- Logi przebiegów w tle zapisujesz do `.workflow/runs/`, nie do `/tmp`.

## 3. Kto co robi: router
- Wykonawcę wybierasz z tabeli ról w `CLAUDE.md` §Role: implementer pisze, inny wykonawca recenzuje.<!--if:!full-->
- `node .workflow/routing/route.mjs <typ> [worktree brief nazwa] [--critical]` zwraca wykonawcę i gotowe polecenie. `--list` pokazuje typy. Wykonawcę wybiera router, nie pamięć.<!--if:full-->
- Po każdym zadaniu: `route.mjs --record <typ> <wykonawca> <rundy> <przepuszczone> <zadanie> <uwaga> <trudność 1–3>`.<!--if:full-->
- Przy każdym ticku pętli: `route.mjs --rebalance`, a każdą zmianę kolejności zapisujesz w ledgerze jako ruling.<!--if:full-->
- Sygnały limitu dostawcy: `route.mjs --limit <dostawca> tight|blocked <reset ISO>`. Limity oceniasz po czasie do resetu, nie po samym procencie.<!--if:full-->
- Para model–typ bez historii jest na próbie: pierwsze 2 zadania sprawdzasz ostrzej (pełna recenzja).<!--if:full-->
- Jakość jest ważniejsza niż oszczędność.<!--if:full-->

## 4. Nadzór nad agentami i maszyną
- **Przed każdym zleceniem:** `bash .workflow/bin/budget.sh agent|executor|e2e`. Zlecasz tylko przy `OK`. Progi: zmienne środowiska > `.workflow/budget.local.env` > `.workflow/budget.env`. Tryb wysoki (`budget.mode` = `wysoki`) tylko wtedy, gdy człowiek nie pracuje na maszynie.<!--if:standard-->
- **Najwyżej {{AGENT_MAX}} agentów z testami naraz** (na maszynę; próg w `.workflow/budget.local.env`). Agenci piszący tylko dokumenty się nie liczą. Ciężkie polecenia wyłącznie przez `.workflow/bin/heavy.sh`, i to wpisujesz w każdy brief, niezależnie od wykonawcy.<!--if:standard-->
- **Wolne miejsca budżetu wypełniaj od razu** następnym niezależnym zadaniem.
- **Każdy tick:** sprawdź agentów. Agent pracujący ponad **20 min** dostaje prośbę o status w 5 liniach (skończone, teraz, czeka na, pliki spoza zakresu, ETA); zapisz `task.sh <id> status-request`. Status weryfikujesz sam: `git log origin/main..HEAD`, `git status`, `git diff --name-only origin/main...HEAD -- <wspólne>`, procesy.
- Agent, który nie odpowiada, wymaga ustalenia przyczyny. Wisi albo zbacza, to go przerywasz i wznawiasz z korektą.
- Ponad 2 ponowienia tego samego testu E2E wymagają Twojej decyzji.
- Po każdym starcie w tle sprawdź `pgrep`, a po każdym etapie kod wyjścia **i** liczbę wyników.
- Co kilka godzin audyt: każde zadanie „w toku” ma żywy następny krok (szablon `.workflow/templates/audits/audyt-tablicy.md`).<!--if:standard-->
- Co kilka godzin audyt: każde zadanie „w toku” ma żywy następny krok.<!--if:!standard-->
- Po usunięciu worktree zabij procesy wskazujące na nieistniejące ścieżki.

## 5. Zasoby wyłączne
<Opisz kolejkę do wspólnego urządzenia lub środowiska, jeśli istnieje: polecenie statusu, priorytety, limity, kody wyjścia, nadzorca. Jeśli zasób da się zwielokrotnić (kontenery, porty per worktree), zrób to zamiast kolejki.>

## 6. Tablica zadań
- Narzędzie: {{BOARD}}. Aktualizacja w tej samej turze co ledger.
- „W toku” tylko przy realnej pracy. Każda nowa praca (poprawka, bramka, przepięcie, S<n>) dostaje zadanie od razu.
- Status „zablokowane” zawsze z powodem, ten sam w ledgerze: `task.sh <id> blocked "<co odblokuje>"`.

## 7. Zasady produktu, które łatwo zgubić
- <reguła> (R<n>)
- <reguła> (R<n>)

## 8. Lekcje
Każdą nową regułę albo awarię dopisujesz od razu do `docs/workflow/lekcje.md` i commitujesz.
