# Recenzja: <zadanie> (<id>), runda <k>
<!-- Zapis briefu: .workflow/tasks/<id>/review-r<k>-brief.md. Wynik recenzent zapisuje do .workflow/tasks/<id>/review-r<k>.md (szablon .workflow/templates/task/recenzja.md). -->

Worktree: <ścieżka>, gałąź <gałąź>, zakres <baza>..<head> (RED <sha>, GREEN <sha>).
Brief: <plik>. Raport autora: <plik>. Diff z kontekstem: <ścieżka>/review-r<k>.diff.
Bramka według raportu: <liczby>.

Sprawdź zgodność z punktami 1–<n> briefu, Global Constraints z CLAUDE.md i regułami `docs/workflow/metoda/05-jak-kodowac.md` (format i wagi: `docs/workflow/metoda/08-recenzje-i-bramki.md` §Recenzja zadania) oraz poprawność:
- <ukierunkowane ryzyka, np. kolejność hooków, pętle renderowania, kod produkcyjny bez zmian>
- czy zmienione oczekiwania testów nie maskują błędu
- czy testy sprawdzają zachowanie, a nie implementację; czy rozróżniają (para poprawne / niepoprawne)

Tylko odczyt, bez urządzeń. Każde ustalenie Critical i Important potwierdź odtworzeniem (test albo skrypt z wynikiem).
Sekcje w kolejności szablonu: Zgodność ze specyfikacją, Mocne strony, Problemy (Critical / Important / Minor, plik:linia, poprawka), Potrzeby we wspólnych pakietach, Zakres weryfikacji, Kontekst, Ocena. Ostatnia linia pliku: sam werdykt pogrubiony, Approved albo Needs fixes.
Zapisz do <ścieżka>/review-r<k>.md. Ostatnia odpowiedź: 5 linii.
