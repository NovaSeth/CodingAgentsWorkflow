# Bramka <obszar>: klasyfikacja QA

Zakres: gałąź / HEAD <sha>, N pozycji z <katalog> (bez powierzchni systemowych). Źródło: <wyniki .json + zrzuty / logi>.
Otwarte obrazy / logi: wszystkie „błąd” + <próg>. Tylko odczyt, bez nowych rulingów.

## Przebieg i zastrzeżenia
- Kiedy mierzono (przed / po poprawkach), niestabilne przebiegi, artefakty przechwytywania, ślepe plamki modelu.

## Liczby
ok / drobne / błąd: … ; powyżej progu: <id>. Klasy: A n, B n (odwołania + nowe), C (użyte rulingi), do decyzji n. Błąd funkcjonalny: <tak/nie>.

## Wspólne przyczyny
| Kod | Co | Klasa |
|---|---|---|
| P1 | <np. treść 3 pt wyżej na wszystkich ekranach> | B-1 |

## Tabela
| Id | Nazwa | Wynik | Werdykt | Klasyfikacja (P-kody, A-n, B-n) |
|---|---|---|---|---|

## Lista A: wady kodu obszaru (gotowe do briefu, według wpływu; ponowny pomiar po każdej)
1. <plik:linia> <co> — wartość docelowa: <dokładna>.

## Lista B: luki wspólne (komponent / token / fixture; numeracja globalna; odwołuj się do istniejących B-n)
| B-n | Gdzie | Opis + wartości docelowe |
|---|---|---|

## Klasa C: różnice przyjęte (z numerem rulingu)
## Do decyzji (rekomendacja + alternatywa + koszt błędu)
## Ponowny pomiar po poprawkach: <id>
## Po rundzie poprawek
| Id | Przed → po | Werdykt | A naprawione? | Pozostało |
|---|---|---|---|---|
