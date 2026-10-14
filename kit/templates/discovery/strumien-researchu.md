# Strumień <X>: <pytanie strumienia>

Odczyt metryk: <RRRR-MM-DD>. Autor: <agent / osoba>. Zakres: <…>.
Konwencje: cytaty dosłowne w oryginale; „Nie ustalono” zawsze z przyczyną; liczby zamiast przymiotników; bez wymyślonych nazw funkcji i limitów.
**Liczniki:** produkty <n> · URL w rejestrze <n> · URL obrazów <n> · luki <n> · zapytania <n>.
Legenda kodów potrzeb: N1 … Nn (z 0-kontekst-wlasny.md).
Ograniczenia metody: <np. surowe strony pobrane do raw/, do analizy tylko pola wyciągnięte skryptem>.

## N. <Produkt> (<właściciel>)
**1. Aplikacja.** iOS / Android / web: tak / nie / nie ustalono (przyczyna)
**2. Linki.** <adresy + identyfikatory>
**3. Metryki (odczyt <data>).**
| Platforma | Ocena | n | Pobrania | Wersja | Aktualizacja | Cena |
|---|---|---|---|---|---|---|
**4. Deklarowane funkcje (cytat dosłowny).**
**5. Czego brakuje względem pełnego produktu.**
**6. Opinie użytkowników (cytat, autor, gwiazdki, data, wersja) [U-X01].**
**7. Zrzuty ekranu (URL).**
**8. Cytat producenta o głównym zastosowaniu.**
**9. Ceny** (albo luka z przyczyną).

## Pary kontrolowane
| | Wariant A | Wariant B |
|---|---|---|
Kontrolowane: … · Niekontrolowane: … · Wniosek, który mogę wyciągnąć: … · Wniosek, którego nie mogę wyciągnąć: …

## Liczniki nasycenia
| Funkcja | Wdrożenia | Zbiór | Rynek | Kod potrzeby | Uwaga |
|---|---|---|---|---|---|

## Trzy listy
- Stawka wejścia (funkcja + liczba niezależnych wdrożeń)
- Wyróżniki (produkt + metryka + URL)
- Świadomie porzucone (kto + cytat + URL)

## Ranking
| Rozwiązanie | Wow dla kogo | URL dowodu | Trudność | Ryzyko platformowe lub prawne | Fala |
|---|---|---|---|---|---|
Trudność z uzasadnieniem: S — dni, czysty kod · M — gotowy pakiet · L — moduł natywny albo SDK partnera w ścieżce krytycznej · XL — wymaga zgody właściciela platformy.
Fala: 1 — MVP · 2 — kwartał po MVP · 3 — później albo nigdy.

## Luki
| # | Czego nie ustalono | Przyczyna | Wpływ |
|---|---|---|---|

## Rejestr URL
[U-X01] <url>

## Karty produktów (dla czytelnika, który ich nie zna)
**<Produkt>** — kto · co to jest (jedno zdanie bez żargonu) · robi / nie robi · warunki wejścia · nasz werdykt

---
Sekcje poniżej to zasady pracy strumienia — nie przenoś ich do pliku wynikowego.

## Kolejność źródeł
1. Strona produktu w sklepie z aplikacjami.
2. API sklepu.
3. Strona producenta.
4. Centrum pomocy.
5. Changelog.
6. Kanał producenta (blog, media społecznościowe).
7. Komunikat prasowy.

Serwisy z recenzjami traktuj wyłącznie jako opinie, nigdy jako źródło faktów o funkcjach.

## Recenzje ze sklepów
- Recenzje i gwiazdki pobieraj z API sklepu.
- Bez API: zweryfikuj parowanie gwiazdek z treścią recenzji na próbce — gwiazdki wyciągnięte z HTML trafiają do złej recenzji.
- Każda recenzja: cytat w oryginale, autor, gwiazdki, data, wersja aplikacji; recenzję bez daty odrzuć.
