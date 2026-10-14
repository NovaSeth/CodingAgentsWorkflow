# <Projekt>: plan wdrożenia <temat>

> **Dla agentów:** reguły planu: `docs/workflow/metoda/04-spec-i-plan.md`; cykl zadania: `docs/workflow/metoda/06-orkiestracja-i-role.md`. Kroki mają pola wyboru. Postęp żyje na tablicy zadań i w ledgerze, nie w tym pliku.

**Cel:** <jeden akapit>
**Architektura:** <jeden akapit>
**Stos:** <dokładne wersje>
**Spec (wiążący):** <ścieżka> · **Ledger:** `.workflow/progress.md` · **Podręcznik:** `docs/workflow/podrecznik-orkiestratora.md`
**Pierwszeństwo:** nazwy z raportu zadania mają pierwszeństwo przed nazwami w planie; implementer używa nazwy z raportu, orkiestrator poprawia plan.
**Repo:** <ścieżka>, baza <sha>. Kod przeczytany do planu: <lista>.

## Global Constraints
- Porty / prefiksy / obowiązkowe nagłówki / kody błędów: …
- Stałe czasowe (interwał zdrowia, progi, TTL, retencja): …
- Wielodostępność: identyfikator dzierżawcy wszędzie; test izolacji dla każdej listy, odczytu i zapisu.
- Każda zmiana stanu emituje zdarzenie w tej samej transakcji (brak zdarzenia = odrzucenie w recenzji).
- Granice modułów: import tylko przez `index`; tylko warstwa antykorupcyjna zna system zewnętrzny.
- Sekrety tylko w <plik>; `check-secrets.sh` przed każdym pushem.
- Istniejące testy zostają bez zmian w plikach testów (zmieniać wolno tylko konfigurację).
- Jeden świat danych: <osoba / dzień / encje>; zegar jest częścią scenariusza; w konflikcie wygrywa <źródło>.
- Wygląd tylko z tokenów DS (test strażnik).
- Bramka = zachowanie i dane, nie piksele; E2E przez kolejkę z twardym limitem; paczki ≤ 15 min.
- Commit na krok, styl `feat(<obszar>): …`; zakaz `git stash`; `main` tylko przez PR po bramce.

## Review Focus
1. **<scenariusz ryzyka>.** Oczekiwane: <dokładne zachowanie>. Testy: <zadanie / krok>.
2. …

## Rozstrzygnięcia planu
- **P1. <co>.** <dlaczego>. Koszt błędu: <…>.

## Pasy i równoległość
| Pas | Katalog na wyłączność | Zadania (kolejno) | Start po |
|---|---|---|---|
Równolegle po X: … **Pliki wspólne** (pasy nigdy nie zmieniają; zmiana = zadanie wspólne S<n> orkiestratora): …

## Struktura plików
<drzewo z oznaczeniem zadania, które tworzy plik>

## Faza F0: <nazwa> (<kto>, <czas>)

### Zadanie F0.1: <tytuł>
**Pliki:** Utwórz: … · Zmień: … · Test: …
**Interfejsy:** Konsumuje: <symbol> (<zadanie>) · Produkuje: <sygnatury / typy / tabele / nagłówki>
- [ ] **Krok 1 (RED):** <kod testu>
- [ ] **Krok 2:** uruchom `<polecenie>`. Oczekiwane: FAIL (<powód>).
- [ ] **Krok 3:** implementacja <…>.
- [ ] **Krok 4:** uruchom `<polecenie>`. Oczekiwane: PASS.
- [ ] **Krok 5:** <flow E2E / QA>.
- [ ] **Krok 6: Commit.** `git commit -m "<wiadomość>"`
**Bramka:** `<typecheck && lint && test && check-secrets>`, push `<gałąź>`.
**Akceptacja:** <jedna linia>.

**Bramka fazy (orkiestrator):** <sprawdzenia>; przegląd krzyżowy; pełne E2E na świeżym buildzie; raport dla PO.

## Definicja ukończenia (per jednostka)
Patrz `.workflow/templates/code/definicja-ukonczenia.md` — dopasowana wersja tutaj.

## Szacunek czasu
| Faza | Czas | Wąskie gardło |
|---|---|---|

## Ryzyka
| Ryzyko | Skutek | Co robimy |
|---|---|---|

## Samokontrola planu względem specu
| § specu | Zadania |
|---|---|

<!-- „Korekta <data>: wiąże ponad wcześniejszymi sekcjami” — późne rulingi dopisuj tutaj, na końcu. -->
