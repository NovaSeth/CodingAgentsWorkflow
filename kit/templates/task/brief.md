# <Tytuł zadania> (<id na tablicy>)
<!-- Zapis: .workflow/tasks/<id>/brief.md (bash .workflow/bin/brief.sh <id>). Po zleceniu: bash .workflow/bin/task.sh <id> dispatched --exec <wykonawca> --base <sha>. -->

Wykonawca z routera: <agent | dostawca model/effort> (typ: <typ zadania>).
Worktree: <ścieżka bezwzględna; poziom minimum: główny checkout> (gałąź <gałąź> z origin/main <sha>, zależności zainstalowane: <tak/nie>). Aktualizacja gałęzi tylko `git merge origin/main`, bez rebase.
Obowiązuje `.workflow/briefs/wspolny-<rodzaj>.md`.
Zakres: <katalogi / pliki>. Brakuje czegoś w pakiecie wspólnym? → przerwij ze statusem NEEDS_CONTEXT i opisz brak (KOD-3, KOD-4). Wyjątek tylko, gdy ten brief jest zadaniem wspólnym S<n>.
<Zadanie autorskie, nie recenzja.>

## Problem (<kto zgłosił, gdzie>)
<objaw> + łańcuch przyczyn z odwołaniami plik:linia.

## Cel
1. <punkt akceptacji — recenzent odwoła się do numeru>
2. <…>
<„Wybierz X albo Y, uzasadnij w raporcie”; „nie zgaduj — opisz, co się dzieje”>

## TDD
<które testy muszą być najpierw czerwone i dlaczego>

## E2E / urządzenia
<Nie uruchamiasz urządzeń ani kolejki (robi to orkiestrator) | uruchamiasz przez kolejkę: …>. Przejrzyj istniejące flow i wypisz asercje, których dotyka zmiana.

## Bramka (ciężkie polecenia tylko przez .workflow/bin/heavy.sh)
```bash
bash .workflow/bin/heavy.sh <typecheck>
bash .workflow/bin/heavy.sh <lint>
bash .workflow/bin/heavy.sh <testy --maxWorkers=2>
bash .workflow/bin/check-secrets.sh; echo "kod $?"
```
Commit na każdy krok, bez push.

## Raport
<ścieżka bezwzględna>/report.md (szablon `.workflow/templates/task/raport.md`): linia `Status:`, decyzje (per punkt celu), pliki, RED/GREEN, bramka, luki wspólne, otwarte kwestie.
Ostatnia odpowiedź: dokładnie 5 linii — status, commity, testy, wątpliwości, ścieżka raportu.
