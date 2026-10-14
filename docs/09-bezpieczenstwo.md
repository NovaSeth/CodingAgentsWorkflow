# 09. Bezpieczeństwo

**Cel:** wykrywać furtki zostawiane przez agentów (trasa dev bez bramki, sekret w logu, brak autoryzacji obiektu), zanim trafią do wydania. **Czyta:** orkiestrator, agent `security`, implementer, recenzent, PO. **Kiedy:** każde zadanie (automaty), diff w obszarze wrażliwym (przegląd), przed wydaniem (audyt, bramki).

**Mapa sekcji**
- §Warstwy walidacji — cztery warstwy: kto, kiedy, wynik.
- §Przewodnik i model zagrożeń — co zawiera przewodnik projektu.
- §Zasady dla kodu — autoryzacja, sekrety, bramki dev, walidacja, tokeny, redakcja.
- §Automaty — skanery, `pre-push`, CI: tryby, wynik, kody wyjścia.
- §Przegląd PR — lektura i granice pracy agenta `security` przy diffie.
- §Audyt — zakres, narzędzia, testy obciążeniowe.
- §Format ustalenia i raportu — ID ustaleń, waga, układ raportu.
- §Wymagane testy, §Bramki wydania — testy w projekcie, warunki wydania.
- §Kiedy robić przegląd — rekomendacja i wyzwalacze.
- §Strażnik poleceń — co blokuje `guard-bash.mjs`, blokady projektu.
- §Procedura — przegląd PR, audyt, wyciek sekretu.
- §Szablony i narzędzia, §Checklista — ścieżki; skrót przed wydaniem.

## Reguły

### Warstwy walidacji

| Warstwa | Kiedy | Kto / co | Wynik |
|---|---|---|---|
| 1. Automaty | zadanie, push, CI | skanery, testy wycieków, lint granic | kod 0 / 1 / 2 |
| 2. Przegląd zadania lub PR | diff dotyka wyzwalacza | agent `security`, średni model, effort medium, tylko odczyt | `OK` / `OK z uwagami` / `Blokuje` |
| 3. Audyt | przed wydaniem testowym i produkcyjnym | agent `security`, najmocniejszy model, effort high, cały kod | `docs/security/przeglad-<data>.md` |
| 4. Bramki wydania | wydanie testowe, produkcja | orkiestrator według checklisty; PO odbiera | decyzja o wydaniu |

**BZP-1.** Waliduj bezpieczeństwo w czterech warstwach z tabeli; żadna warstwa nie zastępuje innej.

### Przewodnik i model zagrożeń

**BZP-2.** Opieraj wszystkie warstwy na `docs/security/przewodnik-bezpieczenstwa.md`: model zagrożeń, zasady, checklisty, co i jak testować, wymagania wydania, źródła.

**BZP-3.** Model zagrożeń **MUSI** zawierać aktora „deweloper lub agent AI” (zaufany, ale omylny) oraz łańcuch dostaw.

**BZP-4.** Granice zaufania **MUSZĄ** obejmować: klient ↔ BFF; BFF ↔ API (tożsamość z poświadczenia, nie z nagłówków); API ↔ system zewnętrzny (przy kluczu wspólnym API pilnuje uprawnień per użytkownik); aplikacja ↔ system operacyjny (deep linki, powiadomienia, kopie, schowek); maszyna deweloperska ↔ świat (env, logi, porty lokalne, DNS rebinding).

**BZP-5.** Ogólną regułę wynikającą z ustalenia zgłaszaj w sekcji „Do przewodnika” raportu; o wpisie decyduje orkiestrator.

### Zasady dla kodu

**BZP-6.** Bierz dzierżawcę i użytkownika wyłącznie z poświadczenia; każdy odczyt i zapis obiektu sprawdza dzierżawcę **i** prawo do obiektu; cudzy obiekt zwraca 404, nie 403.

**BZP-7.** Trzymaj sekrety tylko po stronie serwera (env 0600, w `.gitignore`); **NIE WOLNO** umieszczać ich w zmiennych klienta, repo, logach, raportach ani błędach.

**BZP-8.** Stawiaj narzędzia dev (trasy, nagłówki, menu, tokeny) za podwójną bramką: flaga środowiska serwera **i** build debug klienta; proces **MUSI** odmówić startu w produkcji z flagą dev; zmienna środowiska wygrywa z plikiem env (test).

**BZP-9.** Waliduj każde wejście schematem (długość, ścisłe obiekty, granice liczb); ustaw limity rozmiaru treści i plików oraz limity zapytań per poświadczenie.

**BZP-10.** Działaj fail closed: brak konfiguracji oznacza odmowę, nie tryb mock.

**BZP-11.** Używaj krótkich tokenów dostępu i rotującego tokenu odświeżania; unieważniaj sesję przy wylogowaniu i zmianie konta.

**BZP-12.** Nadawaj tokenom prefiks typu (np. `abc_s_…`) — bo prefiks umożliwia skanowanie sekretów.

**BZP-13.** Przepuszczaj logi i monitor przez redakcję: klucze `password|token|secret|authorization|cookie|api-key|bearer|credential|signature`, segmenty ścieżek z sekretami, limit głębokości i rozmiaru.

**BZP-14.** W narzędziach dla agentów AI broń się ograniczeniem zasięgu; zapis nieodwracalny tylko z potwierdzeniem człowieka (nie modelu); adnotacje `readOnly`, `destructive`, `idempotent`, `openWorld` pod testem snapshotowym.

### Automaty

| Narzędzie | Co łapie / jak działa | Kody |
|---|---|---|
| `.workflow/bin/check-secrets.sh` | wzorce wbudowane + `.workflow/secrets-patterns.txt`, pliki kluczy, `.env` w każdym katalogu; bez argumentów: indeks i drzewo robocze; `--staged`: linie dodane w indeksie; `--range <rewizje>`: każdy commit zakresu; pomija `SYNTH`; wynik tylko `plik:linia` (`commit:plik:linia`) | 0 czysto · 1 znaleziska · 2 błąd |
| `.workflow/bin/check-key-leak.sh` | wartości z `.env` (całe i fragmenty 8 znaków) w repo, historii (`--history`), artefaktach (`--dir`); nazwy zakazane w paczce klienta (`--forbid-name`) | 0 · 1 wyciek · 2 błąd |
| `.githooks/pre-push` | `check-secrets.sh --range` na **wypychanych** commitach (także sekret dodany i usunięty kolejnym commitem) | 1 i 2 blokują push |
| `.github/workflows/bramki.yml` | `bramki / proces`: `check-secrets.sh`, `check-ledger.mjs`, `AGENTS.md`; `bramki / jakosc`: typecheck, lint, testy; `bramki / wynik` zbiera oba | czerwony blokuje scalenie |
| testy wycieków, test architektury, skrypt konfiguracji platformy | sekrety w logach, błędach, odpowiedziach (klucz `SYNTH…`, szpiedzy konsoli); import z pominięciem interfejsu, brak filtra dzierżawcy; kopie zapasowe, cleartext, debuggable | kod runnera |

**BZP-15.** Uruchamiaj automaty z tabeli w bramce każdego zadania, w hooku `pre-push` i w CI.

**BZP-16.** Uruchamiaj bramkę sekretów bez potoku i sprawdzaj jej kod wyjścia — bo `skrypt | tail -1` zwraca kod `tail`.

**BZP-17.** Traktuj kod 2 jak porażkę: błąd narzędzia i pominięcie nie są wynikiem „czysto”.

**BZP-18.** Oznaczaj syntetyczne wartości w testach (`SYNTH` albo komentarz `check-secrets: syntetyczne` w tej linii); **NIE WOLNO** luzować wzorców z powodu fałszywych trafień — bo prawdziwy sekret nie ma znacznika.

**BZP-19.** Każdy nowy typ sekretu dodawaj jako wzorzec ERE w `.workflow/secrets-patterns.txt`; **NIE WOLNO** edytować `check-secrets.sh` — nadpisuje go aktualizacja frameworka.

**BZP-20.** Włącz hook na każdej maszynie (`.workflow/bin/dev-setup.sh` ustawia `core.hooksPath`; przy innym menedżerze hooków wywołaj `.githooks/pre-push` z jego hooka `pre-push`) i utrzymuj ten sam skaner w CI — bo hook można pominąć.

### Przegląd PR

**BZP-21.** Przegląd wykonuje agent `security` (`.claude/agents/security.md`) średnim modelem, effort medium, na `git diff <baza>...<gałąź>` i plikach, od których diff zależy bezpośrednio.

**BZP-22.** Agent czyta tylko §Procedura tego dokumentu, z przewodnika podsekcje §Checklisty dotkniętych obszarów i ostatni `docs/security/przeglad-*.md`; otwartych ustaleń nie zgłasza ponownie — cytuje ID: pogarsza / naprawia.

**BZP-23.** Agent zawsze sprawdza: nowe trasy i autoryzację obiektu (dwóch użytkowników, dwóch dzierżawców), walidację i limity, bramki dev, sekrety w kodzie, logach i błędach, deep linki, magazyn na urządzeniu, nowe zależności (autor, skrypty instalacyjne).

**BZP-24.** Agent `security` tylko czyta i uruchamia polecenia bez zmian w repo (ciężkie przez `.workflow/bin/heavy.sh`); poprawki zleca orkiestrator.

**BZP-25.** **NIE WOLNO** wysyłać żądań do systemów zewnętrznych, stage ani produkcji; test dynamiczny tylko na własnym stosie lokalnym, gdy brief na to pozwala.

**BZP-26.** **NIE WOLNO** pisać działających exploitów; wystarczy klasa problemu, miejsce i warunek.

**BZP-27.** **NIE WOLNO** wypisywać wartości sekretów w raporcie, odpowiedzi ani wyniku polecenia; podawaj `plik:linia` i typ.

**BZP-28.** Opieraj twierdzenia na przeczytanym kodzie (`plik:linia`); zależność od nieznanej konfiguracji zapisz i obniż pewność.

**BZP-29.** `Blokuje` (High lub Critical w diffie) wstrzymuje scalenie do poprawki i ponownej recenzji zawężonej; Medium i niższe dostają zadania w ledgerze.

**BZP-30.** Odpowiedź agenta: werdykt, ustalenia per waga, narzędzia i testy, wątpliwości; pełny raport w pliku.

### Audyt

**BZP-31.** Audyt wykonuje agent `security` najmocniejszym modelem, effort high — bo wymaga osądu architektonicznego (model uprawnień, wielodostępność).

**BZP-32.** Zakres audytu: zmiany w wytycznych (OWASP MASVS/MASTG, API Security Top 10, ASVS, dokumentacja platform), cały przewodnik na całym kodzie, audyt zależności, `check-secrets.sh --range --all`, `check-key-leak.sh --history --dir <artefakt>`.

**BZP-33.** Narzędzia audytu: statyczne — Semgrep, Gitleaks, `npm audit` albo osv-scanner, MobSF; dynamiczne tylko na własnym stosie — OWASP ZAP z OpenAPI, mitmproxy, fuzzing deep linków, identyfikatory innego dzierżawcy.

**BZP-34.** **NIE WOLNO** bez zgody PO prowadzić testów obciążeniowych ani skanów wobec systemów zewnętrznych, stage i produkcji; na własnym stosie lokalnym lub testowym są dozwolone (`05-jak-kodowac.md` §TDD i E2E — KOD-62).

### Format ustalenia i raportu

**BZP-35.** ID ustalenia: `SEC-<zadanie>-<n>` w przeglądzie PR, `SEC-<n>` w audycie (zespół: `SEC-<AUTOR>-<n>` z `ruling.sh --kind SEC`); pola według `.workflow/templates/security/ustalenie.md`.

**BZP-36.** Waga Critical / High / Medium / Low / Info według uproszczonego CVSS 3.1; obniż ją dla ustalenia tylko w lokalnym stosie dev; zapisz założenie, które zmieniłoby wagę.

**BZP-37.** Raport według `.workflow/templates/security/przeglad.md` (zakres `repo@sha`, werdykt, podsumowanie dla PO, tabela ustaleń, otwarte z poprzednich, do przewodnika, ograniczenia).

### Wymagane testy

**BZP-38.** Utrzymuj testy z `docs/security/przewodnik-bezpieczenstwa.md` §Co i jak testować; każdy nowy zasób dostaje test BOLA dwóch użytkowników, także przez token integracji.

### Bramki wydania

**BZP-39.** Wydanie wymaga `docs/security/przewodnik-bezpieczenstwa.md` §Wymagania wydania („Wydanie testowe”, dla produkcji też „Produkcja”).

**BZP-40.** **NIE WOLNO** wydać z otwartym ustaleniem High lub Critical; Medium mają zadania z terminem.

### Kiedy robić przegląd

**BZP-41.** Automaty uruchamiaj zawsze (BZP-15).

**BZP-42.** Przegląd agentem `security` (typ routera `review-security`) zlecaj, gdy diff dotyka wyzwalacza z listy poniżej.

**BZP-43.** Pełny audyt rób przed każdym wydaniem testowym i produkcyjnym.

**BZP-44.** Przesunięcie przeglądów zadań na jeden przed wydaniem zapisz rulingiem z kosztem błędu.

**BZP-45.** Przy wycieku sekretu: rotacja, wpis w ledgerze, sprawdzenie historii (§Wyciek sekretu); usunięcie z drzewa nie zamyka sprawy.

**BZP-46.** **NIE WOLNO** pomijać hooków gita (`--no-verify`, `commit -n`, `core.hooksPath`) — `pre-push` jest bramką sekretów; blokuje to strażnik `.claude/hooks/guard-bash.mjs`.

Wyzwalacze: uwierzytelnienie, tokeny · autoryzacja, filtr dzierżawcy · nowe trasy · zapisy nieodwracalne · sekrety, env, logi, błędy · deep linki, WebView · magazyn na urządzeniu · upload · zależności · klient systemu zewnętrznego · narzędzia dla agentów AI · konfiguracja platformy · CI, hooki, `.workflow/bin/`.

### Strażnik poleceń

Blokady `.claude/hooks/guard-bash.mjs` (kod 2, komunikat z ID): `git stash` (PUL-14) · potok za `check-secrets.sh`, `||` i `&&` dozwolone (BZP-16) · push innej gałęzi na `main`: `HEAD:main`, `x:main`, `:main` (PUL-17) · wymuszony push na `main`: `-f`, `--force*`, `+main`, `--mirror` (PUL-48) · pomijanie hooków (BZP-46) · zwykły `git push origin main` tylko w zespole (`"multiDev": true`; solo to droga zapisów procesu, ZAS-2) · wzorce z `.workflow/guard-extra.txt`.

**BZP-47.** Dobieraj tryb `check-secrets.sh` do momentu: bez argumentów w bramce zadania, `--staged` przed commitem, `--range <rewizje>` dla commitów (historia gałęzi, audyt).

**BZP-48.** Kod 1 z `pre-push` = sekret w wypychanych commitach: usuń go z nich przed pushem; sekret, który opuścił maszynę, rotuj (§Wyciek sekretu).

**BZP-49.** Własne blokady poleceń dopisuj w `.workflow/guard-extra.txt` (`<regex ERE><TAB><komunikat z ID>`); **NIE WOLNO** edytować `guard-bash.mjs`.

**BZP-50.** **NIE WOLNO** obchodzić blokady strażnika (skrypt pośredni, inna składnia); gdy działanie jest konieczne, zapytaj człowieka (ZAS-20).

## Procedura

### Przegląd PR
1. Wyzwalacze: `git diff --name-only origin/main...HEAD`.
2. Brief: gałąź i SHA bazy, podsekcje przewodnika §Checklisty do przeczytania, zgoda na test lokalny, ścieżka raportu (`.workflow/tasks/<id>/security.md`). Zleć agentowi `security`.
3. `Blokuje` → runda poprawek i ponowna recenzja zawężona; rozstrzygnij „Do przewodnika”.

### Audyt
1. Zbuduj artefakt wydania; skany bez potoku:
   ```bash
   bash .workflow/bin/check-secrets.sh --range --all; echo "rc=$?"
   bash .workflow/bin/check-key-leak.sh --history --dir <artefakt> --forbid-name <NAZWA>; echo "rc=$?"
   ```
2. Zleć audyt (BZP-31, BZP-32) z wynikiem `docs/security/przeglad-<RRRR-MM-DD>.md`.
3. High i Critical → zadania przed wydaniem; Medium → z terminem; przejdź §Checklista.

### Wyciek sekretu
1. Zrotuj sekret; wpis w `.workflow/progress.md` (typ, `plik:linia`, rotacja — bez wartości).
2. Zasięg: oba polecenia z kroku 1 §Audyt.
3. Nowy typ sekretu → wzorzec w `.workflow/secrets-patterns.txt` (BZP-19) i test, że skaner go łapie.
4. Sekret użyty na produkcji → `16-runbooki.md` §Awaria produkcyjna; lekcja w `docs/workflow/lekcje.md`.

## Szablony i narzędzia
- `docs/security/przewodnik-bezpieczenstwa.md` §Checklisty, §Co i jak testować, §Wymagania wydania.
- `.claude/agents/security.md` — tryby przegląd / audyt; `.workflow/templates/security/` — `przeglad.md`, `ustalenie.md`.
- `.workflow/secrets-patterns.txt`, `.workflow/guard-extra.txt` — wzorce sekretów i blokady poleceń projektu.

## Checklista
- [ ] Zadanie z wyzwalaczem: `check-secrets.sh` = 0, `bramki / wynik` zielone, werdykt `security` bez `Blokuje`, test BOLA dla nowego zasobu.
- [ ] Wydanie: audyt w `docs/security/przeglad-<data>.md`, brak High i Critical, `check-key-leak.sh --history --dir` = 0, przewodnik §Wymagania wydania spełniony.
