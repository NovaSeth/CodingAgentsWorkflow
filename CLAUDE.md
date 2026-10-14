# CodingAgentsWorkflow — zasady dla agentów pracujących nad TYM repo

Repo frameworka do prowadzenia projektów programistycznych zespołem agentów AI. Produkt to:
- `docs/` — **metoda**: reguły i procedury; instalowana w projekcie jako `docs/workflow/metoda/`,
- `kit/` — pliki instalowane w projekcie (agenci, skrypty, szablony, profile stosów),
- `scripts/setup.mjs` — kreator (nowy / istniejący projekt), `scripts/install.sh` — szybkie wdrożenie bez pytań,
- `tests/` — `node --test tests/*.test.mjs`.

## Zasady pisania (docs/ i wszystkie teksty w kit/)

1. **Tryb normatywny.** Reguły w trybie rozkazującym: „Rób X.”, „Nie rób Y.”. Reguła twarda: **MUSI** / **NIE WOLNO**. Uzasadnienie najwyżej jedną krótką klauzulą „— bo …”, tylko gdy pomaga w ocenie przypadków granicznych.
2. **Zero historii.** Żadnych odwołań do innych projektów, firm, produktów, dat, incydentów („w projekcie X było…”, „kiedyś…”, „źródło”, „okazało się”), numerów decyzji z innych projektów. Wartości liczbowe podawaj jako **domyślne do skalibrowania** („domyślnie 3; zapisz własną wartość rulingiem”).
3. **Bez lania wody.** Bez wstępów, podsumowań, metafor, słów „warto”, „pamiętaj”, „ważne jest”. Listy i tabele zamiast akapitów; akapit ≤ 3 zdania.
4. **Identyfikatory reguł.** Każda reguła w docs ma ID z prefiksem dokumentu, np. `**KOD-3.**`. Prefiksy: 01 `ZAS`, 02 `PRC`, 03 `DSC`, 04 `SPC`, 05 `KOD`, 06 `ORK`, 07 `RES`, 08 `REV`, 09 `BZP`, 10 `DSN`, 11 `MEM`, 12 `PUL`, 13 `WDR`, 14 `ZES`. Numeracja ciągła w dokumencie, bez luk. Recenzje i briefy cytują reguły po ID. (`SEC-<n>` to identyfikatory USTALEŃ bezpieczeństwa, nie reguł.)
5. **Stały układ dokumentu:**
   ```
   # NN. Tytuł
   **Cel:** jedno zdanie. **Czyta:** role. **Kiedy:** sytuacja.
   ## Reguły            (ID + treść)
   ## Procedura         (numerowane kroki, polecenia w blokach kodu)   — jeśli dotyczy
   ## Szablony i narzędzia (ścieżki)                                     — jeśli dotyczy
   ## Checklista        (pola [ ] do odhaczenia przez agenta)           — jeśli dotyczy
   ```
6. **Ścieżki jak w zainstalowanym projekcie** (nigdy `kit/…`, `../kit/…`):
   | W tym repo | W projekcie |
   |---|---|
   | `docs/NN-*.md` | `docs/workflow/metoda/NN-*.md` (linki między nimi: `NN-*.md`) |
   | `kit/templates/X` | `.workflow/templates/X` |
   | `kit/.workflow/*`, `kit/.claude/*`, `kit/.githooks/*` | `.workflow/*`, `.claude/*`, `.githooks/*` |
   | `kit/docs/workflow/*`, `kit/docs/security/*` | `docs/workflow/*`, `docs/security/*` |
   | `kit/stacks/<stos>/README.md` | `.workflow/stacks/<stos>/README.md` |
   | `kit/CLAUDE.md.template` | `CLAUDE.md` |
7. **Słownik (używaj dokładnie tych terminów):** orkiestrator · wykonawca · implementer · recenzent · designer · agent `security` · PO (właściciel produktu) · pas · zadanie wspólne `S<n>` · nota o wpływie · brief (wspólny / zadania) · raport · plik ustaleń · recenzja · ponowna recenzja zawężona · runda poprawek · bramka zadania · bramka obszaru · przegląd krzyżowy · ledger · ruling (`R<n>` / `R-<AUTOR>-<n>`) · lekcje · podręcznik orkiestratora · KANON (świat danych) · Global Constraints · Review Focus · definicja ukończenia · budżet maszyny · router · karta wyników.
8. Narzędzia zewnętrzne opisuj jako role („tablica zadań”, „narzędzie projektowe”, „CLI drugiego dostawcy”), nie z nazwy — wyjątek: profile stosów i przykłady poleceń.
9. Język polski.

10. **Oszczędność kontekstu (progressive disclosure).** Agent nie ładuje całej metody — sięga po konkretną sekcję albo regułę:
   - każdy dokument zaczyna się blokiem **„Mapa sekcji”**: lista `§Nazwa — co tam jest (1 linia)`, w kolejności sekcji;
   - jedna reguła = jedna linia zaczynająca się od `**ID.**` (grep `'KOD-7\.'` zwraca całą regułę); bez wieloakapitowych reguł — szczegóły w tabeli/procedurze pod spodem;
   - każde odwołanie ma format: `` `plik` §Sekcja — co tam jest / po co doczytać `` (np. „`08-recenzje-i-bramki.md` §Ponowna recenzja zawężona — kiedy obowiązkowa i format”); nigdy samo „patrz 08”;
   - dokument ≤ 16 KB (egzekwuje `tests/docs.test.mjs`), cel ~12 KB; długie checklisty i szablony w osobnych plikach, do których się odsyła;
   - `CLAUDE.md` projektu = tylko twarde reguły + mapa wiedzy (sytuacja → plik §sekcja); briefy i recenzje cytują ID reguł, nie wklejają ich treści; subagent dostaje ścieżki do plików, nie ich zawartość.

## Zasady zmian w kodzie
- Zmiana w `kit/` lub `scripts/` = test w `tests/`. Skrypty bash muszą działać w bash 3.2 (macOS) i na Linuksie: bez `mapfile`, `declare -A`, `${x,,}`.
- Nowy plik w kicie → `kit/manifest.json` (poziom albo cecha) i mapa w `README.md`.
- Edycje plików z backtickami (\`\`) rób narzędziem do edycji, nie heredokiem bez cudzysłowu.
- Przed commitem: `node --test tests/*.test.mjs` i `bash kit/.workflow/bin/check-secrets.sh` (bez potoku).
