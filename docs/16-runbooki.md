# 16. Runbooki

**Cel:** krótkie procedury na sytuacje poza zwykłym cyklem zadania. **Czyta:** orkiestrator; wykonawca, gdy brief odsyła do procedury. **Kiedy:** sytuacja z §Mapa sekcji.

**Mapa sekcji**
- §Reguły — RUN-1…RUN-13: zasady wspólne procedur.
- §Konflikt merge — scalenie `main` do gałęzi zadania z konfliktem.
- §Spór z recenzentem — implementer nie zgadza się z ustaleniem.
- §Test niestabilny — kwarantanna rulingiem z terminem.
- §Hotfix — poprawka produkcyjna od tagu wydania.
- §Wycofanie zmiany — `git revert` przez PR.
- §Awaria produkcyjna — zatrzymanie, fakty, revert albo hotfix, lekcja.
- §Zadanie zablokowane — blokada zewnętrzna, ścieżka zastępcza.
- §Zmiana planu — korekta planu, zadania w locie.
- §Migracja bazy — expand → migrate → contract.
- §Kod bez testów — test charakteryzujący, uprząż testowa.
- §Regresja wydajności — pomiar gałęzi wobec `main`.

## Reguły

**RUN-1.** Każdą procedurę zaczynaj i kończ wpisem w ledgerze przez `.workflow/bin/task.sh` albo `.workflow/bin/ruling.sh`; ręcznych wpisów stanu zadania nie pisz.
**RUN-2.** Gałąź zadania aktualizuj wyłącznie `git merge origin/main`; **NIE WOLNO** robić rebase po recenzji — bo zmienia SHA zapisane w ledgerze.
**RUN-3.** Spór recenzent–implementer rozstrzyga orkiestrator rulingiem przed kolejną rundą; runda sporna nie liczy się do wyłącznika (REV-23) ani do karty wyników.
**RUN-4.** Test niestabilny wyłączaj tylko rulingiem z terminem i znacznikiem w kodzie; testów z Review Focus **NIE WOLNO** kwarantannować.
**RUN-5.** Hotfix wychodzi z gałęzi od tagu wydania; ponowna recenzja zawężona jest obowiązkowa, bramka obszaru odbywa się po fakcie.
**RUN-6.** Zmianę z `main` wycofuj `git revert` przez PR; **NIE WOLNO** przepisywać historii `main` (reset, force push).
**RUN-7.** Przy awarii produkcyjnej najpierw zatrzymaj szkodę i zbierz fakty, potem poprawiaj; działania na produkcji wykonuje człowiek z dostępem.
**RUN-8.** Zadanie zablokowane z zewnątrz dostaje `task.sh <id> blocked "<co odblokuje>"`, ścieżkę zastępczą i pytania jako `TODO(<id>)` w kodzie.
**RUN-9.** Zmianę planu zapisuj w pliku planu i rulingu; zadania w locie, których dotyczy, kończ `cancelled` i wydawaj nowy brief — nie przepisuj briefu w locie.
**RUN-10.** Migrację bazy prowadź jako zadanie wspólne `S<n>` w trzech PR: expand → migrate → contract; każdy krok odwracalny albo jawnie nieodwracalny w rulingu.
**RUN-11.** Kodu zastanego bez testów nie zmieniaj przed testem charakteryzującym; brak uprzęży testowej = osobne zadanie przed zmianą.
**RUN-12.** Wydajność porównuj gałąź wobec `main` w tym samym środowisku i tym samym poleceniu; próg z budżetu specu, bez budżetu domyślnie 10% (zapisz własną wartość rulingiem).
**RUN-13.** Procedura, która ujawniła brak reguły albo testu, kończy się wpisem w `docs/workflow/lekcje.md` w tej samej turze.

## Procedura

### Konflikt merge
**Kto:** implementer w worktree zadania; orkiestrator, gdy konflikt dotyka części wspólnej, pliku innego pasa albo plików procesu.
1. `git fetch origin && git merge origin/main` (RUN-2).
2. Konflikt w zakresie briefu → rozwiąż, typecheck, bramka zadania, commit scalenia. Plik generowany → uruchom generator.
3. Konflikt poza zakresem → `git merge --abort`, status `NEEDS_CONTEXT` z listą plików; orkiestrator rozstrzyga albo zleca zadanie wspólne `S<n>`.
4. Ledger i lekcje mają `merge=union`; konflikt na przycisku Merge w serwisie gita → scal lokalnie.
5. Weryfikacja rozwiązania: `git show --remerge-diff <sha-scalenia>`.

**Ponowna recenzja:** zawężona do rozwiązania konfliktu, gdy dotyka danych, zapisów, autoryzacji albo współbieżności; inaczej własna weryfikacja orkiestratora. **Ledger i lekcje:** ruling tylko przy decyzji merytorycznej; ten sam plik w konflikcie po raz drugi → lekcja o granicach pasów.

### Spór z recenzentem
**Kto:** implementer zgłasza; orkiestrator rozstrzyga.
1. Implementer nie poprawia spornego ustalenia; w `report.md` dopisuje sekcję `## DISPUTED`: ID ustalenia, argument, dowód (test, `plik:linia`).
2. Orkiestrator czyta ustalenie, odtworzenie i argument; przy wątpliwości sam uruchamia odtworzenie.
3. `bash .workflow/bin/ruling.sh "ustalenie <ID>: utrzymane|odrzucone" "<dlaczego>" "<koszt błędu>"` przed kolejną rundą (RUN-3).
4. Utrzymane → pozycja w `findings-r<k+1>.md`; odrzucone → w pliku ustaleń „odrzucone (R<n>)”.
5. `route.mjs --record` bez rundy spornej.

**Ponowna recenzja:** według `08-recenzje-i-bramki.md` §Ponowna recenzja zawężona; ustalenie odrzucone nie wraca. **Ledger i lekcje:** ruling; spór z niejasnej reguły → poprawka reguły albo briefu wspólnego i lekcja.

### Test niestabilny
**Kto:** orkiestrator decyduje; implementer albo `mechanic` oznacza test.
1. Potwierdź: 10 przebiegów na tym samym commicie (domyślnie 10), kolejno, przez `.workflow/bin/heavy.sh`, jeśli jest; zapisz liczbę porażek.
2. Test z Review Focus albo pilnujący zapisów → bez kwarantanny: zadanie naprawy z najwyższym priorytetem, bramka czeka (RUN-4).
3. Pozostałe: `bash .workflow/bin/ruling.sh "kwarantanna <test> do RRRR-MM-DD" "<przyczyna>" "<co przestaje być pilnowane>"`.
4. W kodzie: pominięcie z komentarzem `QUARANTINE(R<n>, RRRR-MM-DD)`; zadanie naprawy na tablicy.
5. Raport bramki zadania i obszaru wymienia testy w kwarantannie: `grep -rn 'QUARANTINE(' .`.
6. Po terminie: test naprawiony albo usunięty; przedłużenie tylko nowym rulingiem.

**Ponowna recenzja:** naprawa testu → zwykła recenzja zadania. **Ledger i lekcje:** ruling; lekcja z przyczyną (czas, kolejność, stan współdzielony).

### Hotfix
**Kto:** orkiestrator zleca; implementer poprawia; recenzent; agent `security` przy wyzwalaczu.
1. `git fetch --tags && git worktree add .worktrees/hotfix-<slug> -b hotfix/<slug> <tag-wydania>`.
2. Brief minimalny: objaw, przyczyna `plik:linia`, test regresji, zakres (tylko poprawka), bramka.
3. `bash .workflow/bin/task.sh <id> dispatched --exec <wykonawca> --base <sha-tagu>` (zespół: dodaj `--pas <pas>`).
4. TDD: test regresji czerwony na tagu, zielony po poprawce.
5. Recenzja, potem ponowna recenzja zawężona — obowiązkowa niezależnie od rodzaju poprawki (RUN-5).
6. Wyzwalacz bezpieczeństwa → przegląd `security` (`09-bezpieczenstwo.md` §Kiedy robić przegląd).
7. `bash .workflow/bin/check-secrets.sh --range <tag-wydania>..HEAD; echo "kod $?"`.
8. Wydanie z gałęzi hotfix; potem PR `hotfix/<slug>` → `main` (merge, bez cherry-pick).
9. Bramka obszaru po fakcie na `main`, domyślnie w ciągu doby.

**Ledger i lekcje:** `ruling.sh "hotfix <co>" "<dlaczego poza planem>" "<koszt błędu>"`, `task.sh <id> complete "<PR, SHA na main, tag>"`, lekcja: który test i która recenzja przepuściły błąd.

### Wycofanie zmiany
**Kto:** orkiestrator.
1. Znajdź commit na `main` (squash = zwykły commit): `git log --oneline origin/main --grep '<id zadania albo #PR>' -- <ścieżka>`; scalenie merge commitem: dodaj `--merges`.
2. `git worktree add .worktrees/revert-<slug> -b revert/<slug> origin/main`, potem `git revert -m 1 <sha-scalenia>` (zwykły commit: `git revert <sha>`).
3. Bramka zadania, `check-secrets.sh`, PR (RUN-6).
4. Zmiana zawierała migrację → revert kodu nie cofa danych; postępuj według §Migracja bazy.
5. Ponowne wprowadzenie = nowe zadanie z nowym briefem.

**Ponowna recenzja:** revert bez konfliktów → własna weryfikacja; konflikt albo dane → ponowna recenzja zawężona. **Ledger i lekcje:** `ruling.sh "wycofanie <zadanie/PR>" "<dlaczego>" "<koszt błędu>"`; lekcja z brakującym testem.

### Awaria produkcyjna
**Kto:** orkiestrator prowadzi; człowiek z dostępem wykonuje działania na produkcji; PO dostaje informację.
1. Zatrzymaj szkodę: wyłączenie funkcji, wstrzymanie wdrożeń, zatrzymanie agentów w dotkniętym obszarze (RUN-7).
2. Fakty od razu do `docs/workflow/lekcje.md`: objaw, czas początku, zakres (użytkownicy, dane), ostatnie wdrożenie (`git log --oneline <tag-poprzedni>..<tag>`).
3. Wyciek sekretu → `09-bezpieczenstwo.md` §Wyciek sekretu.
4. Przyczyna w ostatnim wdrożeniu i revert bezpieczny → §Wycofanie zmiany; inaczej → §Hotfix.
5. Po przywróceniu: test regresji, raport dla PO, lekcja z przyczyną źródłową i nową regułą albo testem.

**Ledger:** ruling z wyborem revert/hotfix i kosztem błędu.

### Zadanie zablokowane
**Kto:** orkiestrator.
1. `bash .workflow/bin/task.sh <id> blocked "<co odblokuje: osoba, system, termin>"`; tablica zadań: zablokowane z tym samym powodem.
2. Ścieżka zastępcza: część niezależna od blokady na zaślepce zgodnej z kontraktem; pytania w kodzie jako `TODO(<id>): <pytanie>`, lista w raporcie.
3. Pytanie do człowieka: jedno zbiorcze, z opcjami i wariantem domyślnym.
4. Wolne miejsce budżetu → następne niezależne zadanie.
5. Odblokowanie → `task.sh <id> dispatched --exec <wykonawca> --base <sha>` (zespół: `--pas <pas>`); nowy brief, gdy zmienił się zakres.

**Ponowna recenzja:** kod zastępczy usunięty po odblokowaniu → recenzja zadania. **Lekcje:** blokada przewidywalna → wiersz w `.workflow/skan-przed-startem.md` dla kolejnych planów.

### Zmiana planu
**Kto:** orkiestrator; PO przy zmianie zakresu produktu (stop i pytanie).
1. Korekta w pliku planu `docs/plans/` osobnym commitem `docs: korekta planu (R<n>)`; `bash .workflow/bin/ruling.sh "<zmiana>" "<dlaczego>" "<koszt błędu>"` (zespół: `--shared`, gdy dotyczy innych pasów).
2. Zadania w locie dotknięte zmianą: przerwij agenta, `task.sh <id> cancelled "zmiana planu R<n>"` (RUN-9).
3. Nowe zadanie: `bash .workflow/bin/brief.sh <nowe-id>`; starego briefu nie edytuj (zapis historyczny).
4. Nowe wiersze w `.workflow/skan-przed-startem.md` dla zmienionych zadań; sprzeczności → ruling przed zleceniem.

**Lekcje:** zmiana z luki w specu → lekcja i poprawka szablonu specu.

### Migracja bazy
**Kto:** orkiestrator zleca jako `S<n>` (`ruling.sh --kind S "migracja <co>"`); implementer wykonuje; w zespole akceptuje właściciel z CODEOWNERS.
1. Nazwa pliku migracji: `<RRRRMMDDGGMMSS>-<AUTOR>-<opis>` — unikalna bez koordynacji.
2. Expand (PR 1): nowe kolumny lub tabele, kod zapisuje do starego i nowego, stary kod działa dalej.
3. Migrate (PR 2): przeniesienie danych partiami, idempotentne, wznawialne.
4. Contract (PR 3): usunięcie starego dopiero, gdy żaden wdrożony kod go nie czyta; nieodwracalne → ruling i zgoda PO.
5. Test każdego kroku na kopii schematu: up → down → up; nota o wpływie na pasy (`.workflow/templates/task/wplyw-na-pasy.md`).

**Ponowna recenzja:** zawężona, obowiązkowa w każdym PR (dane). **Ledger i lekcje:** `S<n>`, `task.sh` per PR, lekcja przy problemie z odwracalnością.

### Kod bez testów
**Kto:** orkiestrator planuje; implementer pisze testy.
1. Uprzęży testowej brak → osobne zadanie „uprząż testowa” przed zadaniem funkcji, zależność w planie (RUN-11).
2. Test charakteryzujący utrwala obecne zachowanie, także błędne (komentarz `charakteryzujący: obecne zachowanie`); przechodzi na kodzie przed zmianą.
3. Zmiana zachowania = zmiana oczekiwania testu w osobnym commicie z uzasadnieniem w raporcie.
4. Kontekst systemu zastanego: `04-spec-i-plan.md` §System zastany.

**Ponowna recenzja:** recenzent sprawdza, że test charakteryzujący przechodził przed zmianą. **Lekcje:** obszar bez testów → wpis i zadanie na tablicy.

### Regresja wydajności
**Kto:** orkiestrator; implementer albo `qa` mierzy.
1. Budżet ze specu (czas odpowiedzi p95, czas startu, rozmiar paczki); brak budżetu → ruling z wartością.
2. Pomiar kolejno: `main`, potem gałąź, ta sama maszyna i polecenie, przez `.workflow/bin/heavy.sh`, jeśli jest; domyślnie 5 powtórzeń, mediana (RUN-12).
3. Przekroczenie budżetu albo progu → ustalenie Important i runda poprawek.
4. Testy obciążeniowe tylko na własnym stosie lokalnym albo testowym; systemy zewnętrzne, stage i produkcja tylko za zgodą PO.
5. Regresja już na `main` → §Wycofanie zmiany albo zadanie naprawy.

**Ponowna recenzja:** zawężona z wynikiem pomiaru przed i po. **Ledger i lekcje:** ruling z budżetem; lekcja przy braku budżetu w specu.

