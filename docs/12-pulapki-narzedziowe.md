# 12. Pułapki narzędziowe

**Cel:** katalog pułapek powłoki, gita, procesów i raportowania agentów z objawem, po którym je rozpoznać. **Czyta:** orkiestrator, implementer, recenzent, agent `security`. **Kiedy:** przy pisaniu skryptów i poleceń, przy diagnozie dziwnego wyniku bramki, przy kontroli statusu agentów.

**Mapa sekcji**
- §Ogólne — gdzie dopisywać nowe pułapki.
- §Powłoka i skrypty — zsh, potoki i kody wyjścia, heredoc, procesy w tle, porty.
- §Git i worktree — stash, aktualność bazy, śledzenie gałęzi, kopie worktree.
- §Procesy w tle i maszyna — osierocone procesy, zawieszenia, środowiska E2E.
- §Agenci i raporty — typecheck po merge, pliki wspólne, efekty automatyzacji.
- §Automatyzacja interfejsu na komputerze człowieka — zrzut przed akcją, spotkania, wygaszacz.
- §Historia gita i zespół — force push, `merge=union` na platformie repo, brak inicjałów.
- §Szablony i narzędzia — lekcje, konfiguracja dewelopera.

Format: **ID.** reguła — powód. *Objaw: po czym rozpoznać.* Pozycja „temat: ID” odsyła do reguły kanonicznej w innym dokumencie.

## Reguły

### Ogólne

**PUL-1.** Nową pułapkę dopisuj od razu do `docs/workflow/lekcje.md` (reguła + objaw); pułapkę, która wraca, zamień na skrypt, test albo hook.

### Powłoka i skrypty

**PUL-2.** Pętle po listach pisz jako skrypt bash z tablicą albo wpisz listę wprost (`for w in a b c`); w zsh używaj `${=VAR}` lub `xargs` — bo zsh nie dzieli `$ZMIENNEJ` na słowa. *Objaw: pętla wykonała się raz albo zadania w tle „nie wystartowały”.*

**PUL-3.** **NIE WOLNO** przepuszczać bramki przez potok; gdy potok jest potrzebny, użyj `set -o pipefail` albo zapisz `rc=$?` przed przetworzeniem wyjścia — bo `skrypt.sh | tail -1` zwraca kod `tail` (BZP-16). *Objaw: bramka „przeszła”, choć skrypt zwrócił błąd.*

**PUL-4.** Zapisz `rc=$?` w osobnej instrukcji, potem `echo … $rc` — bo w `echo "$(date) EXIT=$?"` podstawienie wykonuje się przed `$?`; decyzje opieraj na podsumowaniu narzędzia (`N/M PASS`). *Objaw: log zawsze pokazuje `EXIT=0`.*

**PUL-5.** Nie opieraj kolejek na nazwach procesów; kolejka to plik listy, atomowe `mkdir claim/<nazwa>` i plik `done` — bo `pgrep -f` znajduje własną linię poleceń. *Objaw: pętla oczekująca czeka bez końca przy zerowym obciążeniu.*

**PUL-6.** Każdemu poleceniu w pętli `while read … done <<LISTA` dawaj `</dev/null` — bo polecenie zjada resztę stdin. *Objaw: kolejka kończy się po pierwszym zadaniu.*

**PUL-7.** Równoległe przebiegi owijaj w `( … ) &` albo `nohup bash -c '…' &` i sprawdź, czy oba procesy żyją — bo `a && b > log; echo X >> log &` wysyła w tło tylko ostatnie polecenie. *Objaw: przebieg „równoległy” czeka na poprzedni.*

**PUL-8.** Wyniki i logi poza `/tmp`: RES-37; usługi pomocnicze w trwałym katalogu: RES-27. *Objaw: wyniki i blokady zniknęły po restarcie.*

**PUL-9.** Przekazywanie argumentów przez menedżer pakietów: RES-16; czerwoną bramkę przeczytaj w logu przed zleceniem poprawek. *Objaw: flaga do testów dała „No tests found”.*

**PUL-10.** Zmianę przekazywania danych do procesu potomnego sprawdzaj próbą kontrolną: ze zmienną przechodzi, bez niej pada — bo narzędzie testowe widzi tylko zmienne z określonym prefiksem lub flagą. *Objaw: proces potomny dostał wartość domyślną.*

**PUL-11.** Po rozwiązaniu konfliktu wyczyść cache narzędzi (linter, typecheck, bundler) przed bramką. *Objaw: lint zgłasza znacznik konfliktu w czystym pliku.*

**PUL-12.** Zatrzymuj tylko procesy nasłuchujące (`lsof -ti tcp:PORT -sTCP:LISTEN`) albo znany PID — bo `lsof -ti tcp:PORT` zwraca też połączenia wychodzące. *Objaw: `kill` po porcie zabił niewinny proces.*

**PUL-13.** Pliki z backtickami lub `$` twórz narzędziem do edycji albo heredokiem z cudzysłowem (`<<'EOF'`) — bo `<<EOF` wykonuje `` `…` `` i rozwija `$zmienne`; heredoc bez cudzysłowu tylko przy celowym rozwinięciu. *Objaw: w pliku brakuje fragmentów w backtickach albo są wyniki poleceń.*

### Git i worktree

**PUL-14.** **NIE WOLNO** używać `git stash` przy wielu worktree — rób commit roboczy (ORK-37); blokuje to strażnik. *Objaw: pliki jednego zadania trafiły do drugiego.*

**PUL-15.** Aktualizacja gałęzi przed zadaniem: ORK-33. *Objaw: agent pracował na nieaktualnych założeniach.*

**PUL-16.** Aktualny główny checkout i SHA bazy w briefie: ORK-19. *Objaw: wykonawca nie znalazł kodu, który istnieje.*

**PUL-17.** Śledzenie gałęzi i pierwszy push: ORK-37 (`branch.autoSetupMerge simple`, `git push -u origin HEAD`); push na `main` blokuje strażnik (`09-bezpieczenstwo.md` §Strażnik poleceń). *Objaw: git podpowiada push prosto do `main`.*

**PUL-18.** Kopia worktree do eksperymentu (np. testu mutacyjnego) dostaje własną, czystą instalację zależności — bo wspólny katalog zależności nadpisuje dowiązania oryginału. *Objaw: kopia zepsuła oryginalny worktree.*

**PUL-19.** Przebiegi na gałęzi agenta uruchamiaj dopiero po jego commicie albo zakończeniu. *Objaw: testy trafiły na w połowie zapisany plik.*

**PUL-20.** Znacznik `SYNTH` w testach: BZP-18. *Objaw: skaner sekretów blokuje każdy push fałszywymi trafieniami.*

### Procesy w tle i maszyna

**PUL-21.** Budżet maszyny przed zleceniem: RES-3; ciężkie polecenia przez kolejkę: RES-13. *Objaw: maszyna się zawiesza, bo każdy runner wziął wszystkie rdzenie.*

**PUL-22.** Limit łączny bez wyjątków: RES-2. *Objaw: kolejne zawieszenie mimo reguł per klasa procesów.*

**PUL-23.** Po awarii szukaj procesów z `PPID 1`; pętle `tail -F` zawsze z warunkiem końca; procesy usuniętych worktree: RES-39. *Objaw: obciążenie rośnie z czasem pracy.*

**PUL-24.** Testy uruchamiające procesy mają `trap` sprzątający i sprawdzenie w teardown. *Objaw: po testach zostają procesy żyjące godzinami.*

**PUL-25.** Po „koniec” zewnętrznego wykonawcy sprawdź plik wyniku; bez niego — ogon logu i ponowienie na innym modelu pod nową nazwą — bo wrapper zapisuje „koniec” także przy przeciążeniu. *Objaw: zadanie „skończyło się”, ale nie ma wyniku.*

**PUL-26.** Proces jest zawieszony, gdy nie ma procesu potomnego, a log stoi ponad N minut (domyślnie 10; własną wartość zapisz rulingiem); wznawiaj sesję wykonawcy, jeśli narzędzie to umożliwia. *Objaw: proces żyje, ma połączenia, ale nic nie robi.*

**PUL-27.** Limity zagnieżdżone ustawiaj **ściśle mniejsze** od zewnętrznych i pilnuj tego warunkiem w skrypcie. *Objaw: padła cała paczka, bo alarm kroku był równy limitowi ciszy nadzorcy.*

**PUL-28.** Gdy środowisko testowe (emulator, kontener, serwer dev) działa ponad próg albo rozgrzewka pada, najpierw zimny restart, potem diagnoza kodu; A/B na tym samym, świeżym środowisku. *Objaw: środowisko degraduje po kilku godzinach i udaje regresję.*

**PUL-29.** Test rozgrzewkowy E2E: REV-50. *Objaw: pierwszy test po zimnym starcie pada „bez powodu”.*

**PUL-30.** Podawaj urządzenie lub cel jawnie w każdym wywołaniu; wynik bez nazwy celu w logu jest niewiarygodny. *Objaw: E2E poszły na innym urządzeniu.*

**PUL-31.** Zrzuty zapisuj per platforma i przebieg, ze znacznikiem czasu w nazwie; czyść katalog na starcie przebiegu. *Objaw: oglądany zrzut był stary albo z innej platformy.*

### Agenci i raporty

**PUL-32.** Przed scaleniem orkiestrator **sam** uruchamia typecheck na gałęzi po `git merge origin/main` (REV-32); **NIE WOLNO** robić rebase gałęzi po recenzji — bo zmienia SHA zapisane w ledgerze. *Objaw: raport „typecheck czysty”, a po aktualizacji kod się nie kompiluje.*

**PUL-33.** Podejrzanie szybki raport: ORK-4. *Objaw: runda poprawek zgłoszona po minucie.*

**PUL-34.** Prośba o status po progu: PRC-11. *Objaw: agent „czeka na zasób” od godziny.*

**PUL-35.** Przy każdej kontroli statusu sprawdź pliki wspólne: `git diff --name-only origin/main...HEAD -- <katalogi wspólne>`. *Objaw: agent zmienił pliki wspólne poza zakresem.*

**PUL-36.** Agent zatrzymany przez człowieka: ORK-30. *Objaw: przerwany agent nie wraca po wiadomości.*

**PUL-37.** Testy trudnych zachowań sprawdzaj mutacją: REV-46. *Objaw: test niczego nie pilnuje, bo uprząż nie odwzorowała aplikacji.*

**PUL-38.** Przy zmianie wspólnego komponentu przejrzyj asercje na jego tekstach i etykietach dostępności. *Objaw: zmiana komponentu zepsuła E2E w innych pasach.*

**PUL-39.** Filtruj listy wejściowe przed przekazaniem do narzędzia; kod wyjścia **i** liczba wyników: RES-36. *Objaw: jeden niedozwolony identyfikator wywrócił całe wywołanie.*

**PUL-40.** Weryfikuj efekt automatyzacji (nowy identyfikator, plik, rekord), nie sam status „ok”. *Objaw: automatyzacja zgłosiła sukces bez zmian.*

**PUL-41.** Żywy następny krok zadania „w toku”: PRC-13. *Objaw: gotowa gałąź leży godzinami bez recenzji.*

**PUL-42.** Zadanie, które zmienia stan wspólnego środowiska (dane, logowanie, urządzenie), przywraca go; regresję rozstrzygaj przebiegiem gałęzi i `main` w tym samym stanie. *Objaw: „regresja” jest stanem zostawionym przez inne zadanie.*

**PUL-43.** Przed przebudową artefaktu (makiety, dokumentu) odczytaj świeże komentarze; powiązania opieraj na nazwach, nie identyfikatorach; usuwaj dopiero, gdy masz co postawić w zamian. *Objaw: zgubione komentarze i powiązania.*

**PUL-44.** Przed zamknięciem wątku weryfikuj skryptem (wyszukanie w całym artefakcie), nie na oko. *Objaw: wątek zamknięty, a pozostałości zostały gdzie indziej.*

### Automatyzacja interfejsu na komputerze człowieka

**PUL-45.** Przed każdym klawiszem lub kliknięciem zrób zrzut i sprawdź: ekran odblokowany, właściwa aplikacja na wierzchu, użytkownik bezczynny. *Objaw: wklejenie trafia gdzie indziej.*

**PUL-46.** **NIE WOLNO** przejmować ekranu podczas spotkań człowieka. *Objaw: akcje agenta widoczne na udostępnianym ekranie.*

**PUL-47.** Przed pracą sprawdź bezczynność i wygaszacz; przy zablokowanym ekranie zapisz stan i dokończ po powrocie człowieka — bo mosty do aplikacji stają przy wygaszaczu. *Objaw: narzędzie przestaje odpowiadać bez błędu.*

### Historia gita i zespół

**PUL-48.** **NIE WOLNO** wymuszać pushu (`--force`, `-f`, `--force-with-lease`) na `main`/`master` — przepisanie historii jest nieodwracalne (ZAS-20); blokuje to strażnik `.claude/hooks/guard-bash.mjs`. *Objaw: zniknięte commity innych osób, rozjechane SHA w ledgerze.*

**PUL-49.** PR z ledgerem lub lekcjami scalaj lokalnie (`git merge`), gdy platforma repo pokazuje konflikt — bo przycisk Merge na platformie nie stosuje `merge=union` (`14-zespol-wielu-deweloperow.md` §Decyzje i pliki dopisywane). *Objaw: konflikt w `.workflow/progress.md`, choć obie strony tylko dopisywały.*

**PUL-50.** Kod 2 z `claim.sh`, `ruling.sh` albo `task.sh` z komunikatem o `workflow.author` → `bash .workflow/bin/dev-setup.sh --author XY` (ZES-16). *Objaw: skrypty procesu odmawiają pracy w trybie zespołowym.*

## Szablony i narzędzia
- `docs/workflow/lekcje.md` — lekcje projektu (scalane `merge=union`).
- `.workflow/bin/dev-setup.sh` — `branch.autoSetupMerge simple`, hooki, inicjały.
