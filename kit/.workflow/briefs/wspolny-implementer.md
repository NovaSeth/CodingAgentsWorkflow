# Brief wspólny: implementer (wszystkie pasy)

Każdy brief zadania odwołuje się do tego pliku („Obowiązuje `.workflow/briefs/wspolny-implementer.md`”). Reguły są wiążące. Nowe reguły dopisuje orkiestrator jako datowane sekcje z numerem rulingu. Błąd, który wraca w recenzjach trzeci raz, staje się sekcją tego pliku.

Jednostka pracy: <np. jedna gałąź mapy obszaru = ekran ze stanami; jeden endpoint; jeden moduł>. Źródło wymagań: brief zadania i paczka zadania (jeśli jest).

## Reguły (wiążące)

1. **Czytasz:** `CLAUDE.md` (Global Constraints, definicja ukończenia), brief zadania, wskazane fragmenty specu i planu, reguły kodu `docs/workflow/metoda/05-jak-kodowac.md`.
2. **Zakres:** zmieniasz tylko ścieżki z briefu. Brakuje czegoś we wspólnym kontrakcie, danych, tokenach albo komponentach? Przerywasz ze statusem `NEEDS_CONTEXT` i opisujesz brak w sekcji „Luki wspólne” (plik, pole, konsument). Bez lokalnych kopii i obejść.
3. **Dane:** tylko przez warstwę API. Fixtures nie importujesz w kodzie aplikacji. Wartości ze świata danych (KANON) bierzesz dosłownie.
4. **Wygląd:** wyłącznie tokeny i komponenty DS. Wartości na sztywno nie przejdą testu strażnika.
5. **Zapisy:** wzorzec zapisów z `docs/workflow/metoda/05-jak-kodowac.md` (idempotencja, `canRetry`, blokada po nieznanym wyniku, blokada jednego lotu w refie, zwolnienie w `onSettled`). Test „ten sam klucz daje jeden rekord”, w tym tryb „zgubiona odpowiedź”.
6. **Stany:** ładowanie, pusto, błąd z ponowieniem. Błąd odczytu nie jest „pusto”.
7. **TDD:** najpierw test, uruchom go i pokaż, że jest czerwony; potem implementacja i zielony wynik. Testy nawigacji i współbieżności sprawdzasz mutacją (na starym kodzie czerwone).
8. **E2E:** <czy uruchamiasz sam, czy robi to orkiestrator przez kolejkę; zasady asercji>.
9. **Zasoby:** ciężkie polecenia tylko przez `.workflow/bin/heavy.sh`, testy z ograniczoną liczbą workerów.
10. **Bramka przed commitem:** typecheck, lint, testy, `check-secrets.sh` (bez potoku, sprawdź kod wyjścia). Aktualizacja gałęzi tylko `git merge origin/main`, nigdy rebase. Każdy krok to osobny commit w stylu `feat(<obszar>): …`. Drzewo czyste na koniec. Bez push, chyba że brief mówi inaczej.
11. **Zakaz `git stash`** (stash jest wspólny dla wszystkich worktree).
12. **Nie uruchamiasz subagentów.** Recenzję zleca orkiestrator.

<!-- Przykład sekcji dopisanej później:
## Zapisy: wiążące od <data> (R<n>, powtarzający się błąd w recenzjach)
<reguła, przykład poprawny i błędny, wymagany test>
-->

## Raport

Pełny raport do pliku z briefu (szablon `.workflow/templates/task/raport.md`): linia `Status: <wartość>`, decyzje (po punktach briefu), pliki, RED/GREEN, bramka (tabela polecenie | wynik | kod), luki wspólne, otwarte kwestie, odstępstwa od briefu. Runda poprawek: dopisz sekcję `## Runda poprawek <k>` (problem → poprawka → RED/GREEN → bramka) z nową linią `Status:` (liczy się ostatnia; starych sekcji nie zmieniasz). Spór z ustaleniem recenzji: sekcja `## DISPUTED` (ID ustalenia, argument, dowód), bez poprawki.

Ostatnia odpowiedź: dokładnie 5 linii.
1. Status: `DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED`.
2. Commity (SHA) albo wynik.
3. Testy jedną linią (liczby, kod bramki).
4. Wątpliwości albo „brak”.
5. Ścieżka raportu.
