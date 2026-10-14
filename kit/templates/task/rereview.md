# Ponowna recenzja zawężona: <zadanie> (<id>), runda <k>
<!-- Orkiestrator wypełnia „Zlecenie” i zapisuje jako .workflow/tasks/<id>/rereview-r<k>-brief.md.
     Recenzent zapisuje wynik (sekcje od „Wynik”) do .workflow/tasks/<id>/rereview-r<k>.md; ostatnia linia pliku to sam werdykt pogrubiony (jeden z dwóch). -->

## Zlecenie
Poprzednia recenzja: <plik> (ustalenia <identyfikatory>). Plik ustaleń: <ścieżka>/findings-r<k>.md. Diff rundy <a>..<b>: <ścieżka>/rereview-r<k>.diff. Raport autora z sekcją „Runda poprawek <k>”: <plik>.
Weryfikacja orkiestratora: <test regresji pada na starym kodzie i przechodzi na nowym; liczby z bramki>.
Nowe problemy szukaj TYLKO w diffie rundy. Ryzyka, które poprawka mogła wprowadzić: <lista>.
Tylko odczyt. Każde ustalenie oceń ADDRESSED / NOT ADDRESSED, powtarzając odtworzenie na nowym kodzie. Ostatnia odpowiedź: 5 linii.

## Wynik
| Ustalenie | Waga | Status | Odtworzenie na nowym kodzie + miejsce |
|---|---|---|---|
| <I-1> | <Critical / Important> | <ADDRESSED / NOT ADDRESSED> | <polecenie / test + wynik, plik:linia> |

## Ocena testów rundy
## Ryzyka z briefu (po kolei)
## Nowe problemy w diffie rundy
**Critical**
- <plik:linia> <co> — <dlaczego> — <jak naprawić>. Odtworzenie: <polecenie / test + wynik>
**Important**
- …
**Minor**
- …

## Zakres weryfikacji
Wzięte z raportu autora: <…>. Uruchomione samodzielnie: <…>.

## Kontekst
<przeczytane pliki i zakresy linii; reguły metody — po ID (grep), nie całe dokumenty>

## Ocena
<uzasadnienie w 1–2 zdaniach>
**Approved** | **Needs fixes**
