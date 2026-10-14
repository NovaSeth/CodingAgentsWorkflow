# Pułapki narzędzia projektowego (DSN-64)

Obejścia dla automatyzacji narzędzia projektowego (skrypty, API, most do aplikacji desktopowej). Każdy punkt jest regułą: stosuj go w każdym zadaniu automatyzacji. Nową pułapkę dopisz tutaj i w lekcjach projektu.

| # | Sytuacja | Rób |
|---|---|---|
| 1 | Klonowanie wariantu, przeniesienie warstw do nowej ramki | Odtwórz i sprawdź powiązania właściwości — nie są przenoszone. |
| 2 | Farba związana ze zmienną | Zapisz też wartość rozwiązaną (inaczej renderuje się na czarno); krycie ustawiaj na warstwie, nie na farbie. |
| 3 | Ucinanie tekstu ustawione w instancji | Odczytaj ponownie po zapisie — bywa niezapisane. |
| 4 | Ładowanie fontów | Ładuj równolegle, nie sekwencyjnie. |
| 5 | Publikacja biblioteki, zamykanie wątków komentarzy | Krok ręczny człowieka; automatyzacja UI tylko z rulingiem. |
| 6 | Wynik automatyzacji „ok” | Weryfikuj efektem (nowy identyfikator, zmieniona wartość), nie samym statusem. |
| 7 | Praca przez most do aplikacji desktopowej | Najpierw sprawdź, czy ekran nie jest zablokowany; jeśli jest — zapisz stan i wstrzymaj zadanie. |
| 8 | Każde zadanie automatyzacji | Zacznij strażnikiem pliku: `if (fileKey !== TARGET) throw 'WRONG_FILE'` (DSN-29). |
