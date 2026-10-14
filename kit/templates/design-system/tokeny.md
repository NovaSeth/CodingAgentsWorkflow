# Tokeny — kolekcje, nazewnictwo, opisy (DSN-4…15)

Wartości liczbowe są domyślne do skalibrowania; własne zapisz rulingiem.

## Kolekcje

| Kolekcja | Tryby | Zawartość | Zakres użycia |
|---|---|---|---|
| Prymitywy | jeden | surowe wartości kolorów | brak (ukryte) |
| Kolor semantyczny | Light, Dark | wyłącznie aliasy do prymitywów | tło / tekst / linia |
| Rozmiar | jeden | odstępy, promienie, wymiary | tylko odstępy, promienie albo wymiary |

## Nazewnictwo

| Kolekcja | Nazwy |
|---|---|
| Prymitywy | `<odcień>/<krok>` (`neutral/0…950`, `blue/50…950`), `alpha/<baza>-<procent>` (`alpha/white-34`) |
| Kolor | `surface(-container\|-sunken)`, `inverse-surface`, `on-surface(-variant\|-muted)`, `on-inverse-surface`, `outline(-variant)` · `[on-]<intencja>[-container][-outline]` dla primary, success, warning, error (+ `primary-pressed`, `primary-subtle`) · `<domena>-<stan>` (`status-active`) · nakładki (`photo-scrim`) |
| Rozmiar | `spacing/2xs…3xl` (krok domyślnie 4), `radius/xs…lg, full`, `size/touch` (domyślnie 48), `size/touch-comfort` (domyślnie 52), `size/icon-sm\|md\|lg` |
| Style tekstu | `display-*`, `headline-*`, `title-*`, `body-*(-medium)`, `label-*(-strong)`, `caption`, `overline` |

## Opisy

| Element | Opis zawiera |
|---|---|
| Prymityw | wartość + powód każdej zmiany (także przyciemnienia dla kontrastu) |
| Zmienna semantyczna | zakres użycia, opis użycia, składnia w kodzie |
| Zmienna rozmiaru | zakres (odstępy / promienie / wymiary), składnia w kodzie |
| Styl tekstu | rozmiar, waga, interlinia, światło, opis użycia, drugi nośnik stanu (np. waga fontu); po scaleniu „wcześniej także …” |

## Tryb ciemny
- Drugi tryb kolekcji Kolor semantyczny, ustawiany na ramce ekranu.
- Wartości ciemne to nowe prymitywy (np. `*/400`) wyliczone skryptem: ten sam odcień, jasność zmieniana do kontrastu z zapasem (domyślnie 4,6–4,8).

## Pary kontrastu

| Tekst / element | Tło | Wymagany kontrast | Gdzie użyta | Light | Dark |
|---|---|---|---|---|---|
| `on-surface` | `surface` | 4,5 | treść | <wynik> | <wynik> |

Progi: tekst ≥ 4,5; UI i grafika ≥ 3,0 (WCAG 1.4.11). Każda para przechodzi w każdym trybie.
