# <System>: <funkcja> (spec <id zadania>)

Data: <RRRR-MM-DD>. Autor: <rola agenta> na zlecenie <orkiestratora / PO>, <tryb autonomii>. Zadanie: <id na tablicy>.
Propozycje decyzji <R-od>–<R-do> (§16) czekają na zatwierdzenie przez <kogo / „orkiestrator, autonomia”>.
> **Status:** <np. tylko projekt; implementacja po bramce M0 = decyzja PO>
Wejście: <wcześniejsze specy i rulingi>, <ledger>, <repo kodu @ sha>, <dokumentacja>, <nagrania odpowiedzi>.
Zasada: <projekt działa bez odpowiedzi na otwarte pytania Qx; każda niewiadoma ma wykrywanie i fallback w §6>.
Ścieżki kodu względem <katalog>. Reguły specu: `docs/workflow/metoda/04-spec-i-plan.md`.

## 1. Problem, cel, kryterium sukcesu
- Stan obecny (dowody: plik:linia).
- Cel.
- **Kryterium sukcesu (mierzalne):** <metryka + próg>; <istniejące testy E2E przechodzą bez zmian>; <tryb shadow: 0 rozbieżności przez N przed włączeniem>.
- Zakres:

| Zasób | Endpointy / źródła | Uwagi |
|---|---|---|

- **Poza zakresem:** <pozycja → późniejsza iteracja / spec>.

## 2. Podejścia
| | Podejście | Za | Przeciw |
|---|---|---|---|
| A | | | |
| B | | | |
| C | | | |

**Wybór: <X> (R<n>).** <jedno zdanie; co bierzemy z odrzuconych>.

## 3. Decyzje
| Nr | Decyzja | Dlaczego / koszt błędu |
|---|---|---|

## 4. Architektura
<diagram: klienci → BFF/API → moduły → warstwa antykorupcyjna → system zewnętrzny>
Jednostki (każda z jednym zadaniem, testowalna osobno): …
Granice (pilnowane testem architektury): …

## 5. Model danych
<DDL z komentarzem przy każdej kolumnie>; wersjonowanie; pochodzenie i świeżość rekordu.

## 6. Niewiadome
| Niewiadoma | Jak ją wykryjemy bez odpowiedzi | Fallback |
|---|---|---|

## 7. Algorytmy i zachowanie
Cykl życia (diagram stanów); start; przyrost; uzgadnianie; priorytety i budżet; ponowienia; interakcja z trybami.

## 8. Kontrakt
Endpointy, schematy (ścisłe, z limitami długości), nagłówki (nowe / **bez zmian**), kody błędów, semantyka danych częściowych.

## 9. Zdarzenia
| Pole | Wartość |
|---|---|
Deduplikacja; konsumenci; wolumen; retencja.

## 10. Wielodostępność, izolacja, dane osobowe
Reguły izolacji + testy; minimalizacja; retencja; usuwanie danych dzierżawcy.

## 11. Bezpieczeństwo
Zagrożenia specyficzne dla funkcji (aktorzy z przewodnika); zabezpieczenia warstwowe; limity; sekrety i logi.

## 12. Obserwowalność
Widoki monitora, metryki {etykiety}, progi → ostrzeżenie / degradacja / alarm, polecenia status | check | probe | purge.

## 13. Testy
Jednostkowe · integracyjne (scenariusze w procesie) · kontraktowe (każdy endpoint, każdy tryb) · architektury · na żywo (tylko odczyt + oznaczone zapisy testowe) · obciążeniowe (progi liczbowe) · regresji (istniejące E2E bez zmian).

## 14. Wdrożenie i wycofanie
Flaga per zasób off | shadow | on; kolejność włączania; kryterium wyjścia z shadow; wycofanie = flaga off.

## 15. Ryzyka
| Ryzyko | Skutek | Środek zaradczy |
|---|---|---|

## 16. Plan iteracji
| Iteracja | Zakres | Test / kryterium | Wartość dla testerów |
|---|---|---|---|
Każda iteracja = osobny PR + testy + bramka + coś widocznego. Zależności i równoległość: …

## 17. Decyzje do zatwierdzenia
| Nr | Propozycja | Uzasadnienie / koszt błędu |
|---|---|---|

## 18. Otwarte kwestie (nieblokujące)

<!-- Późne zmiany: „Uzupełnienia po recenzji X (data): R<n> …” — nie poprawiaj wcześniejszego tekstu po cichu. -->
