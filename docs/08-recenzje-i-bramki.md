# 08. Recenzje, rundy poprawek i bramki

**Cel:** każda zmiana przechodzi niezależną recenzję i bramkę, zanim trafi do `main`. **Czyta:** orkiestrator, recenzent, implementer (§Plik ustaleń), `qa` (§Triaż Minor). **Kiedy:** po raporcie wykonawcy, po rundzie poprawek, gdy zadania obszaru są w `main`, przed wydaniem.

**Mapa sekcji**
- §Łańcuch plików zadania — nazwy plików w `.workflow/tasks/<id>/`, diff do pliku.
- §Recenzja zadania — kto, brief, format, odtworzenie.
- §Plik ustaleń — przekazanie do rundy poprawek.
- §Ponowna recenzja zawężona — kiedy obowiązkowa, `self-verified`.
- §Wyłącznik po dwóch rundach — rozstrzygnięcie, odroczone.
- §Triaż Minor — przegląd odroczonych ustaleń.
- §Bramka zadania — warunki przed recenzją i scaleniem, strategia scalania.
- §Bramka obszaru — kroki, co blokuje.
- §Raport dla właściciela produktu — struktura.
- §Testy, które pilnują — rozróżnianie, mutacja, regresja.
- §Sytuacje wyjątkowe — konflikt merge, spór, test niestabilny (odesłania do runbooków).
- §Procedura — łańcuch recenzji, bramka obszaru, triaż.
- §Checklista — recenzent, ponowna recenzja, bramka zadania.

## Reguły

### Łańcuch plików zadania

**REV-1.** Pliki zadania w `.workflow/tasks/<id>/` (w gicie — pracę podejmie każdy w dowolnym miejscu łańcucha): `brief.md` → `report.md` (sekcje `## Runda poprawek <k>`) → `review-r<k>-brief.md` → `review-r<k>.md` (+ `.diff`) → `findings-r<k>.md` → `rereview-r<k>-brief.md` → `rereview-r<k>.md` (+ `.diff`) → PR; `tick.mjs` przyjmuje też `review-brief.md`, `recenzja-brief.md`, `rereview-brief.md` (runda 1).
**REV-2.** Diff do recenzji zapisuj do pliku: `git log --oneline A..B; git diff --stat A..B; git diff -U10 A..B > .workflow/tasks/<id>/review-r<k>.diff`.

### Recenzja zadania

**REV-3.** Recenzję **MUSI** robić inny wykonawca niż autor, w trybie tylko do odczytu.
**REV-4.** Brief recenzji (`.workflow/templates/task/recenzja-brief.md` → `review-r<k>-brief.md`) podaje zakres commitów, brief i raport autora, plik diffu, punkty akceptacji i ukierunkowaną listę ryzyk.
**REV-5.** Wynik ma stały format bez wstępu (`.workflow/templates/task/recenzja.md`): Zgodność ze specyfikacją (✅/❌ `plik:linia`, ⚠️ nie do sprawdzenia z diffu) · Mocne strony · Problemy Critical / Important / Minor · Potrzeby we wspólnych pakietach · Zakres weryfikacji · Kontekst · Ocena.
**REV-6.** Wagi: Critical — utrata lub uszkodzenie danych, luka bezpieczeństwa, awaria; Important — wada funkcjonalna albo naruszenie reguły lub Global Constraints; Minor — reszta.
**REV-7.** Recenzent **MUSI** odtworzyć każde ustalenie Critical i Important (krótki test albo skrypt z wynikiem).
**REV-8.** Zgodność oceniaj dla każdego punktu akceptacji briefu, cytując jego numer.
**REV-9.** „Zakres weryfikacji” mówi, co wzięto z raportu autora, a co uruchomiono samodzielnie; „Kontekst” — przeczytane pliki i ID reguł.
**REV-10.** Werdykt `**Approved**` albo `**Needs fixes**` stoi pogrubiony w ostatniej linii (sekcja Ocena), z uzasadnieniem w 1–2 zdaniach; `tick.mjs` czyta tylko werdykt pogrubiony.
**REV-11.** Recenzent odrzuca zadanie z brudnym drzewem albo z naruszeniem Global Constraints z `CLAUDE.md`.
**REV-12.** Recenzja cytuje reguły po ID („narusza KOD-7”), nie ich treść.

### Plik ustaleń

**REV-13.** Recenzja „Needs fixes” staje się plikiem ustaleń `findings-r<k>.md` (`.workflow/templates/task/ustalenia.md`): na początku wiążące reguły do przeczytania i implementacja referencyjna (`gałąź:ścieżka`).
**REV-14.** Każde ustalenie Important ma `plik:linie`, co, dlaczego, wzorzec poprawki i dokładną asercję testu; Minor idą jedną pozycją-paczką.
**REV-15.** Rundę poprawek zlecaj przez router (`fix-mechanical` albo `fix-judgment`); plik ustaleń wystarcza świeżemu agentowi bez historii.
**REV-16.** Wykonawca dopisuje do `report.md` sekcję `## Runda poprawek <k>`: problem → poprawka → RED/GREEN → bramka.

### Ponowna recenzja zawężona

**REV-17.** Każda runda poprawek kończy się ponowną recenzją zawężoną do diffu rundy (`.workflow/templates/task/rereview.md`), typ routera `review-scoped`.
**REV-18.** Na każdym poziomie ponowna recenzja zawężona jest **obowiązkowa** przy poprawkach danych, zapisów, autoryzacji i współbieżności, także w rundzie bramki; przy poprawkach mechanicznych i UI orkiestrator może zweryfikować sam i zapisuje `task.sh <id> self-verified --round <k>`.
**REV-19.** Recenzent ocenia każde poprzednie ustalenie jako ADDRESSED / NOT ADDRESSED, powtarzając odtworzenie na nowym kodzie.
**REV-20.** Nowe problemy recenzent szuka **tylko** w diffie rundy, według ryzyk, które poprawka mogła wprowadzić.
**REV-21.** Brief ponownej recenzji zawiera weryfikację orkiestratora: test regresji pada na starym kodzie i przechodzi na nowym, liczby z bramki.
**REV-22.** Ustalenie, które wskazuje wadę wzorca, a nie jednego miejsca, sprawdź we wszystkich pasach; wada przekrojowa idzie jako poprawka przekrojowa (REV-40).

### Wyłącznik po dwóch rundach

**REV-23.** Po 2 rundach poprawek (domyślnie 2; własną wartość zapisz rulingiem) pozostałe ustalenia niekrytyczne rozstrzyga orkiestrator rulingiem; trzeciej rundy nie ma.
**REV-24.** Ustalenia Critical nie podlegają wyłącznikowi: kolejna runda idzie z `route.mjs … --critical`.
**REV-25.** Minor trafiają na listę odroczonych: wpis ledgera `Task <id>: minor (deferred → <cel>): <ustalenie>` i zadanie na tablicy.
**REV-26.** Licznik rund zapisuje `task.sh <id> fix-round --round <k> --addressed <a> --open <o> [co]` (wpis `fix round <k>/2 (…)`).

### Triaż Minor

**REV-27.** Triaż odroczonych rób przed wydaniem i okresowo (zespół: co tydzień), typ `audit`, szablon `.workflow/templates/audits/triaz-minor.md`.
**REV-28.** Każde odroczone ustalenie sprawdź w aktualnym `main` przed klasyfikacją.
**REV-29.** Klasyfikuj: A — nieaktualne, zamknij z linią dowodu; B — aktualne: ryzyko (wys./śr./nis.), koszt S/M/L, pas, propozycja (teraz / później / zamknij).
**REV-30.** Paczka z triażu: 3–8 ustaleń na pas, rozłączne pliki.

### Bramka zadania

**REV-31.** Przed recenzją: typecheck, lint i testy (od poziomu standard przez `heavy.sh`); `check-secrets.sh` bez potoku ze sprawdzonym kodem (0 czysto, 1 trafienia, 2 błąd = wynik nieważny); E2E gałęzi przez budżet lub kolejkę zasobu; czyste drzewo, commit na krok.
**REV-32.** Przed scaleniem orkiestrator **sam** robi `git merge origin/main` w gałęzi zadania i typecheck — bo raport z poprzedniej bazy niczego nie gwarantuje; rebase po recenzji jest zakazany (ORK-33).
**REV-33.** Strategia scalania: PR gałęzi zadania do `main` po bramce zadania i recenzji, squashem, tytuł PR w stylu commita (staje się wiadomością commita); długożyjąca gałąź pasa (full, ruling) — merge commitem. Bez zdalnego repo: `git merge --no-ff <gałąź>` lokalnie, odstępstwo od PR rulingiem.

### Bramka obszaru

**REV-34.** Bramkę obszaru otwieraj, gdy wszystkie zadania obszaru są w `main`; kroki w §Procedura, zamknięcie `task.sh gate <obszar>`.
**REV-35.** Przegląd krzyżowy robi model innego dostawcy na diffie obszaru; każdą uwagę orkiestrator weryfikuje w kodzie.
**REV-36.** Pełne E2E obszaru biegnie na świeżym buildzie, z asercjami zachowania i danych.
**REV-37.** Po bramce jest jedna runda poprawek (gałąź zadania, PR), zakończona ponowną recenzją zawężoną.
**REV-38.** Bramkę blokuje tylko lewa kolumna tabeli; resztę wpisz na listę. Wagi bezpieczeństwa ↔ recenzji: `15-slownik-skrypty-szablony.md` §Skale wag — mapowanie.
**REV-39.** Bramka sprawdza zachowanie, nie piksele; zrzuty to tylko dowód (DSN-59, `10-design-system.md` §Reguły — bramka UI).
**REV-40.** Bramki zamykają się na własnych ustaleniach; poprawka przekrojowa to jedna późniejsza runda dla wszystkich pasów ze znanym oknem obejścia — **NIE WOLNO** serializować pasów na jednej wspólnej poprawce.
**REV-41.** Wyniki QA klasyfikuje agent `qa` (`.workflow/templates/gate/qa-klasyfikacja.md`): A — wada kodu obszaru, B — luka wspólna, C — różnica przyjęta rulingiem.

| Blokuje | Nie blokuje (lista) |
|---|---|
| wada funkcjonalna | drobne różnice wizualne względem makiety |
| błędne dane | różnice z powierzchni systemowych |
| ekran nieużywalny | różnice przyjęte rulingiem |
| ustalenie bezpieczeństwa Critical lub High | ustalenia Minor (lista odroczonych) |

### Raport dla właściciela produktu

**REV-42.** Po każdej bramce obszaru pisz raport dla PO w języku produktu według `.workflow/templates/gate/raport-dla-PO.md`.
**REV-43.** Sekcje: status w linii (bramka, PR z SHA, co otwarte) · najważniejsze (4–5 punktów) · co zrobiono · wyniki testów · błędy złapane przez testy · zrzuty · pytania do zespołów zewnętrznych · ograniczenia i ryzyka · decyzje (lista ID albo `grep -n 'R-<AUTOR>-' .workflow/progress.md`) · jak uruchomić · co po stronie PO.
**REV-44.** Wyniki testów podawaj liczbami per zestaw i obszar, z uwagą, czy porażka dotyczyła testu, czy aplikacji.

### Testy, które pilnują

**REV-45.** Test **MUSI** rozróżniać: „poprawne przechodzi / to samo z jedną zmianą pada”; test przechodzący przez odrzucenie niczego nie dowodzi.
**REV-46.** Testy zachowań trudnych do odtworzenia (współbieżność, ponowienia) sprawdzaj mutacją.
**REV-47.** Pliki testów E2E przy migracji i refaktoryzacji — KOD-60 (`05-jak-kodowac.md` §Reguły — testy jako dowód niezmienionego zachowania).
**REV-48.** Regresję rozstrzyga porównanie z `main` w tym samym środowisku i czasie, nie powtórka pojedynczego kroku.
**REV-49.** Padnięcie w ułamku sekundy to zwykle uprząż: przeczytaj log przed zleceniem poprawek.
**REV-50.** Każdy przebieg E2E zaczyna się od testu rozgrzewkowego; ponad 2 ponowienia tego samego testu (domyślnie) wymagają decyzji orkiestratora.

### Sytuacje wyjątkowe

**REV-51.** Konflikt przy `git merge origin/main` rozwiązuje implementer tylko w zakresie briefu, inaczej `NEEDS_CONTEXT` (`16-runbooki.md` §Konflikt merge — kroki i weryfikacja).
**REV-52.** Ustalenia, z którym się nie zgadza, implementer nie poprawia — opisuje je w sekcji `## DISPUTED` raportu; orkiestrator rozstrzyga rulingiem przed kolejną rundą, runda sporna nie liczy się do wyłącznika ani karty wyników (`16-runbooki.md` §Spór z recenzentem — procedura).
**REV-53.** Test niestabilny wyłączaj tylko kwarantanną rulingiem z terminem i znacznikiem w kodzie, z listą w raporcie bramki; testów Review Focus **NIE WOLNO** kwarantannować (`16-runbooki.md` §Test niestabilny — kroki).

## Procedura

### Łańcuch recenzji (orkiestrator)

1. Bramka zadania (REV-31) zielona według raportu; zweryfikuj w worktree (`06-orkiestracja-i-role.md` §Nadzór — polecenia weryfikacji).
2. Diff do pliku (REV-2); `review-r<k>-brief.md` z szablonu; `route.mjs review-task …` (pełna recenzja dla pary na próbie).
3. Approved → krok 7. Needs fixes → `findings-r<k>.md` (REV-13), runda przez router.
4. Po rundzie: `task.sh <id> fix-round …` (REV-26); `git diff -U10 <fix_base>..HEAD > .workflow/tasks/<id>/rereview-r<k>.diff`; test regresji na starym i nowym kodzie.
5. `rereview-r<k>-brief.md` i `route.mjs review-scoped …` albo, przy poprawce mechanicznej lub UI, własna weryfikacja i `task.sh <id> self-verified --round <k>` (REV-18).
6. Po 2 rundach: REV-23–REV-25.
7. `git merge origin/main`, typecheck (REV-32), `bash .workflow/bin/check-secrets.sh; echo "kod $?"`, PR (REV-33), scalenie, `task.sh <id> complete "<commits, PR, SHA na main>"`, `route.mjs --record`, tablica.

### Przebieg bramki obszaru

1. Przegląd krzyżowy drugim dostawcą (`.workflow/bin/run-other.sh … read-only`) na `git diff <SHA przed pierwszym zadaniem obszaru>..origin/main -- <katalogi obszaru>`.
2. `budget.sh e2e`, pełne E2E na świeżym buildzie; wyniki do klasyfikacji `qa` (REV-41).
3. Jeden plik ustaleń z bramki (krzyżowy + QA), jedna runda w gałęzi zadania, ponowna recenzja zawężona, PR.
4. `task.sh gate <obszar>`; raport dla PO (REV-42).

### Triaż Minor: kroki

1. `grep -n 'minor (deferred' .workflow/progress.md` + ustalenia Minor z `review-r*.md`.
2. Sprawdź każde w `main` (REV-28), klasyfikuj (REV-29), złóż paczki (REV-30).
3. Paczki jako zadania na tablicy; A zamknięte z dowodem w ledgerze.

## Checklista

Recenzent:

- [ ] Tylko odczyt; drzewo czyste; Global Constraints zachowane.
- [ ] Każdy punkt briefu oceniony z numerem; Critical/Important z odtworzeniem i `plik:linia`.
- [ ] Testy rozróżniają; zmienione oczekiwania nie maskują błędu.
- [ ] Zakres weryfikacji i Kontekst opisane; werdykt pogrubiony w ostatniej linii.

Ponowna recenzja zawężona:

- [ ] Każde poprzednie ustalenie: ADDRESSED / NOT ADDRESSED z powtórzonym odtworzeniem.
- [ ] Nowe problemy tylko z diffu rundy; wada wzorca zgłoszona jako przekrojowa.

Bramka zadania:

- [ ] Typecheck, lint, testy przez `heavy.sh`; `check-secrets.sh` kod 0 bez potoku.
- [ ] E2E gałęzi; czyste drzewo; commit na krok; `git merge origin/main` i typecheck przed scaleniem.
