# 05. Jak kodować z agentami

**Cel:** kod pisany równolegle przez agentów jest spójny, a błędy wychodzą w testach. **Czyta:** implementer, recenzent, orkiestrator, designer. **Kiedy:** zakładanie repo, zadanie, recenzja kodu.

**Mapa sekcji**
- §Architektura repo — wspólne vs pasy, kontrakt, świat danych, generatory (KOD-1–20).
- §Zapisy — idempotencja klient + serwer, nieznany wynik (KOD-21–31).
- §Odczyt i strażnicy — błąd ≠ pusto, Wstecz, granica błędu, tokeny, platformy (KOD-32–40).
- §Backend — monolit, strangler fig, outbox, dzierżawcy, tryby, API (KOD-41–56).
- §TDD i E2E (KOD-57–66) · §Paczka, dokumentacja, plik reguł (KOD-67–72) · §Bramki w kodzie (KOD-73–76).
- §Profile stosów — szkielet, bramka, workery (KOD-77–81).
- §Migracje i dokumentacja API — expand/contract, OpenAPI, deprecjacja (KOD-82–86).
- §Procedura · §Checklista. „Dotyczy:” pod nagłówkiem zawęża sekcję do typu projektu.

## Reguły

### Architektura repo

**KOD-1.** Regułę obowiązującą zawsze egzekwuj testem, generatorem, lintem albo hookiem — sama instrukcja nie działa.
**KOD-2.** Części wspólne: `packages/*` (kontrakt, świat danych, klient API, tokeny, UI, katalog) i `src/platform/`; pasy: `apps/<app>/src/features/<obszar>`, `src/modules/<moduł>`.
**KOD-3.** Pas zmienia tylko swój katalog; części wspólne, manifest pakietów, lockfile i konfigurację lint / kompilatora zmienia **wyłącznie** zadanie wspólne `S<n>`: zleca orkiestrator, wykonuje designer (zmianę mechaniczną — implementer), w zespole akceptuje właściciel z CODEOWNERS.
**KOD-4.** Brak w części wspólnej: przerwij z `NEEDS_CONTEXT`, opisz w „Luki wspólne” (plik, pole, konsument); **NIE WOLNO** robić lokalnej kopii ani obejścia.
**KOD-5.** Kontrakt najpierw: jeden pakiet schematów i typów dla klienta i serwera; klient typowany z tras serwera; OpenAPI z kontraktu (KOD-85).
**KOD-6.** Nazwy pól jak w API systemu zewnętrznego; pole bez źródła `// luka <kod>`, wyliczane `// pochodne`; typy `XInput` (wejście) i `X` (po parsowaniu).
**KOD-7.** Jedno źródło: `INTERNAL_KEYS` wyznacza typ publiczny i obie strony usuwają klucze tą samą funkcją; progi i predykaty (`isOverdue`) dzielą serwer, świat danych i UI.
**KOD-8.** Sformatowane etykiety (kwoty, daty, statusy) daje serwer; ekran nie składa fraz.
**KOD-9.** Kontrakt zmieniaj addytywnie z wpisem w changelogu API (KOD-86); zmiana łamiąca jawnie z listą konsumentów, w API publicznym = `/v2`; `PATCH`: `null` czyści, pominięte = bez zmian.
**KOD-10.** Jeden świat danych z KANON na każdym ekranie i w każdym teście (`03-discovery-research-makiety.md` §KANON — zasady zmian).
**KOD-11.** `worldAt(zegar, scenariusz)` = świat bazowy → wariant scenariusza → zdarzenia z `at ≤ zegar`; porównuj momenty bezwzględne.
**KOD-12.** Scenariusz zmienia dane tylko tam, gdzie wymaga stan ekranu; stan z czasu = inny zegar; **NIE WOLNO** sterować stanami flagami.
**KOD-13.** Nie zgaduj danych: brak w KANON = `undefined`; niespójności makiet opisz w README świata danych z rulingiem.
**KOD-14.** **NIE WOLNO** importować świata danych ani atrap w kodzie aplikacji — tylko backend mock.
**KOD-15.** BFF ma tryb mock ze scenariuszem i zegarem z nagłówków `x-scenario`, `x-clock` albo deep linku — każdy stan ekranu jednym linkiem.
**KOD-16.** Testy komponentów: backend mock w procesie (`app.request`), bez sieci, reset przed renderem.
**KOD-17.** Katalog, trasy, motyw, ikony i raport luk generuj i commituj z `// GENERATED — DO NOT EDIT`; **NIE WOLNO** edytować wyniku.
**KOD-18.** Generator ma `--check` (kod 1 = nieaktualny), waliduje trasy względem `worldAt`, ma test determinizmu (dwa przebiegi bajt w bajt), nie nadpisuje plików ekranów (tylko typy), trzyma tabelę tras u siebie.
**KOD-19.** Import innego modułu tylko przez interfejs publiczny (`index.ts` / `__init__.py`); zależności wiąże plik kompozycji; platforma nie importuje modułów; rozstrzyga test architektury (pełny graf, z dynamicznymi).
**KOD-20.** Jedyny klient API zewnętrznego to moduł warstwy antykorupcyjnej, bez publicznych tras.

### Zapisy

Dotyczy: każdy zapis przez API; KOD-27…30 — serwer.

**KOD-21.** Każdy zapis idzie przez jedną funkcję wysyłającą z `Idempotency-Key` (UUID v4); test sprawdza, że żadna definicja zapisu jej nie omija.
**KOD-22.** `mutate(vars)` = nowa operacja i nowy klucz; **NIE WOLNO** ponawiać nieudanego zapisu nowym `mutate`; 4xx = wynik znany, klucz spalony.
**KOD-23.** `canRetry` = sieć, timeout albo 5xx **i** nic w locie; tylko wtedy „Spróbuj ponownie” → `retry()` (ta sama treść i klucz); timeout = błąd sieci; spóźniona odpowiedź zastąpionej próby niczego nie zmienia.
**KOD-24.** Zapis tworzący po nieznanym wyniku blokuje formularz, zostaje tylko `retry()`; **NIE WOLNO** zerować stanu zapisu przy edycji pól — bo zgubiona odpowiedź da duplikat.
**KOD-25.** Koperta zapisu (klucz, dane, stan, błąd) przeżywa odmontowanie (magazyn sesji, `operacja:<id>`); sukces czyści ją po unieważnieniu cache; zmiana sesji — wszystkie.
**KOD-26.** UI: blokada jednego lotu w refie, zwolnienie w `onSettled`, `loading` na przycisku, po błędzie wartość z serwera; komunikat backendu tylko przy 4xx; w łańcuchu ponawiaj tylko krok, który padł.
**KOD-27.** Serwer: odcisk = hash(aktor, metoda, ścieżka znormalizowana jak w routerze, treść kanoniczna); rezerwacja klucza przed wykonaniem; inny odcisk → `422 key-reused`; zakres `(dzierżawca, aktor, klucz)`.
**KOD-28.** Odpowiedź zapisuj w transakcji zmiany i zdarzenia; powtórka zwraca ją z `x-idempotent-replay: true`; retencja ≥ okno offline; odpowiedzi 5xx **NIE** zapisuj — wycofaj transakcję, ponowienie (KOD-23) wykonuje operację od nowa.
**KOD-29.** Efekt zewnętrzny: `reserved → attempting` (commit przed wywołaniem) `→ external-done → done`; zastane `attempting` sprawdza efekt: jest → dokończ, brak → wykonaj, błąd → `503 outcome-unknown`, nie da się → `409 outcome-unknown`; pusty odczyt nie dowodzi braku.
**KOD-30.** Powtórka sprawdza bieżące uprawnienia: brak → `403` z `outcome: applied`, bez treści i wykonania.
**KOD-31.** Testy: ten sam klucz = jeden rekord (też przy zgubionej odpowiedzi); podwójne tapnięcie = jedno żądanie; offline → zabicie → sieć = jeden rekord.

### Odczyt i strażnicy

Dotyczy: KOD-33, KOD-37 — UI mobilne; reszta — każdy UI.

**KOD-32.** Błąd odczytu ≠ pusto: stany ładowanie, pusto, błąd (przyczyna, następny krok, ponowienie); **NIE WOLNO** pokazać błędu jako „brak danych”.
**KOD-33.** Wstecz: `useTabBack(fallback)` w zakładkach, `dismissTo(<ekran główny>)` na stosie; **NIE WOLNO** `back()` na historii globalnej; bramka wymaga testu wejścia z innej zakładki i deep linku na prawdziwym drzewie layoutów.
**KOD-34.** Nawigacja po sukcesie zapisu przez wspólny hook, który nie nawiguje z odmontowanego ekranu.
**KOD-35.** Błąd w ≥ 2 miejscach naprawiaj jedną poprawką wspólną `S<n>`, nie łatkami w pasach.
**KOD-36.** Jedna granica błędu w powłoce, wewnątrz providerów; odzyskanie: wyczyść parametry trasy startowej → zamontuj od niej → nawiguj do celu; awarię testuje w E2E trasa rzucająca przy renderze.
**KOD-37.** Powierzchnie systemowe (powiadomienie, blokada, udostępnianie, biometria) nie są ekranami: implementuj wywołanie i cel przejścia; treść powiadomień buduje backend.
**KOD-38.** Wygląd tylko z tokenów; pilnuje `.workflow/templates/code/global-constraints.test.ts` (`10-design-system.md` §Eksport do kodu — co test odrzuca).
**KOD-39.** Strażnik (tokeny, architektura, skaner) ma kontrolę samego siebie (złe wejście złapane, dobre przepuszczone) i asercję zakresu; **NIE WOLNO** jej osłabiać.
**KOD-40.** Zmiana globalna trafia na wszystkie platformy w jednym PR; luka platformy jawna w teście (`itPlatformBGap(<zadanie>)`); **NIE WOLNO** po cichu wyłączać testów.

### Backend

Dotyczy: backend wielodostępny (cecha `backend`); KOD-43…47 — obudowa systemu zastanego; KOD-53…55 — tryb demo.

**KOD-41.** Modularny monolit: moduł = `index`, `router`, `service`, `source`, `repo`, `README.md`, tabele `<moduł>_*` — bo zapis do starego systemu, nowej warstwy i outboxu to jedna transakcja.
**KOD-42.** Spec podaje kryteria i mechanikę wydzielenia modułu do usługi (skala, zespół, cykl wdrożeń, izolacja awarii).
**KOD-43.** Strangler fig: rejestr etapów = mapa migracji; etap: `legacy` → `legacy+own` → `own+writeback` → `own`; osobno `demo`.
**KOD-44.** Trasa nie istnieje bez wpisu w rejestrze (test kompletności w obu kierunkach); przejęcie = wpis + migracja + test.
**KOD-45.** Odpowiedź niesie `x-source`; brak źródła w live → `501 {reason: not-implemented, task}`, dla trybu → `503`; dane tylko z nowej warstwy oznacz w UI.
**KOD-46.** Raport luk generuj z rejestru; bramka: generowanie + `git diff --exit-code`.
**KOD-47.** **NIE WOLNO** pisać fałszywego serwera systemu zewnętrznego: mappery testuj na zanonimizowanych nagraniach, awarię — nieosiągalnym adresem i „wymuś demo”.
**KOD-48.** Zapis HTTP = jedna synchroniczna transakcja bez `await`; wywołania zewnętrzne przed nią.
**KOD-49.** Każda zmiana stanu zapisuje zdarzenie `<zasób>.<czasownik>` w tej samej transakcji; brak zdarzenia = odrzucenie w recenzji.
**KOD-50.** Konsument przesuwa kursor w transakcji przetworzenia, dogania od kursora na starcie; handlery idempotentne.
**KOD-51.** Dzierżawca w każdym rekordzie, kluczu, zdarzeniu i `ctx`; dzierżawca i aktor **wyłącznie** z poświadczenia, nigdy od klienta.
**KOD-52.** Każde zapytanie filtruje po dzierżawcy (osobiste też po właścicielu); cudzy zasób → `404`; test izolacji dla każdego zasobu; replika z dzierżawcą w `WHERE`.
**KOD-53.** Monitor zdrowia z histerezą (domyślnie 3 porażki → demo, 1 sukces → live; skalibruj); przełączenie podbija trwałą epokę.
**KOD-54.** Odpowiedzi niosą tryb i epokę; klient przy zmianie czyści cache i pokazuje baner demo; zapis w złym trybie → `409 mode-mismatch`.
**KOD-55.** Moduł demo = pełny świat mock w modelu domenowym; test parytetu z live.
**KOD-56.** API: listy `{items, total}`, ID z prefiksem typu, ISO-8601 z przesunięciem, `If-Match` → `409 version-conflict`, `partial` = `null` bo nieznane (`not-fetched`, `upstream-unavailable`, `outcome-unknown`), błąd `{error, message, details}`; klient decyduje po `error` i `details.reason`.

### TDD i E2E

**KOD-57.** Najpierw test: uruchom, pokaż czerwień i jej powód w raporcie, potem zieleń.
**KOD-58.** Krok planu = commit; na koniec drzewo czyste — recenzent odrzuca brudne.
**KOD-59.** Test rozróżnia (poprawne przechodzi / jedna zmiana pada); nawigację i współbieżność sprawdzaj mutacją.
**KOD-60.** Przy migracji i refaktoryzacji pliki istniejących testów E2E zostają bez zmian (wolno zmienić konfigurację) — bo to dowód braku zmiany zachowania.
**KOD-61.** Testy modułu: izolacja dzierżawców A/B, zdarzenie po zapisie, powtórka idempotentna, macierz dostępu.
**KOD-62.** Testy obciążeniowe (domyślnie p95 < 20 ms, 0 × 429; pomiar w README) tylko na własnym stosie lokalnym lub testowym (inne: BZP-34); skrypty powłoki testuj z atrapami narzędzi na `PATH`.
**KOD-63.** Flow E2E startuje od linku deweloperskiego (reset, scenariusz, zegar) i sprawdza ID ekranu; przebieg od rozgrzewki; pod-flow pomocnicze to nie testy.
**KOD-64.** Asercje E2E strukturalne, ID z API; na live **NIE WOLNO** asertować nazw ani kwot; zapisy demo są odwracalne.
**KOD-65.** Porażka nigdy nie jest OK: usuń stary wynik; błąd narzędzia → `{verdict: null}`, kod 2; cel (urządzenie, przeglądarka, port) w logu, inaczej wynik nieważny.
**KOD-66.** Wspólne urządzenie tylko przez kolejkę (`07-zasoby-i-wspolbieznosc.md` §Kolejka zasobu wyłącznego — blokada, limity, kody).

### Paczka, dokumentacja, plik reguł

**KOD-67.** Implementer dostaje brief i paczkę: katalog, makiety, API ze specu i `/openapi.json`, komponenty DS, definicję ukończenia, Global Constraints z `CLAUDE.md`.
**KOD-68.** Skrypt paczki kończy się błędem, gdy brakuje bloku — nigdy nie daje pustego briefu.
**KOD-69.** Pakiet i moduł mają README z `.workflow/templates/code/module-README.md`; usługa: rozdziały `01`–`07`, słownik, pytania z fallbackiem.
**KOD-70.** Źródłem prawdy jest kod: różnice wobec specu oznaczaj wprost; świadoma decyzja w kodzie ma numer rulingu.
**KOD-71.** Treść i rozmiar `CLAUDE.md`: MEM-42, MEM-43 (`11-pamiec-projektu.md` §Plik wejścia).
**KOD-72.** `AGENTS.md` tylko z generatora: MEM-45.

### Bramki w kodzie

**KOD-73.** `.githooks/pre-push` blokuje push przy kodzie skanera 1 i 2; włącza go `dev-setup.sh`.
**KOD-74.** CI uruchamia to co bramka zadania, z generatorami i `sync-agent-rules.sh` (`--check`).
**KOD-75.** Kody: `0` czysto, `1` znalezisko, `2` błąd narzędzia (nigdy „czysto”); **NIE WOLNO** puszczać bramki przez potok.
**KOD-76.** Ciężkie polecenia przez `.workflow/bin/heavy.sh` (minimum: bezpośrednio); limit workerów: KOD-81.

### Profile stosów

**KOD-77.** Przed pierwszym zadaniem czytaj `.workflow/stacks/<stos>/README.md`; stos bez profilu: orkiestrator opisuje go w `CLAUDE.md` przed F1.
**KOD-78.** Szkielet (`platform/`, `modules/<m>/` z interfejsem publicznym, test architektury, konfiguracja lintu) bierz z profilu stosu.
**KOD-79.** Granice rozstrzyga test architektury z kontrolą samego siebie; nowa reguła = para „złapany / przepuszczony”; brak szkieletu → zadanie `S<n>`.
**KOD-80.** ESLint i import-linter to obrona w głąb; ich luki opisują komentarze w plikach szkieletu.
**KOD-81.** Bramka i flagi workerów: `.workflow/stacks/<stos>/README.md` §Bramka zadania; workery domyślnie 2 (skalibruj z budżetem maszyny); **NIE WOLNO** `-n auto`.

### Migracje i dokumentacja API

Dotyczy: KOD-82…84 — projekt z bazą danych; KOD-85…86 — projekt z API.

**KOD-82.** Schemat bazy zmieniaj etapami expand → migrate → contract, każdy osobnym wdrożeniem; kod działa ze schematem sprzed i po etapie (`16-runbooki.md` §Migracja bazy).
**KOD-83.** Migracja ma krok w dół sprawdzony testem (w górę → w dół → w górę); nieodwracalna: ruling, zgoda PO (ZAS-20), kopia danych.
**KOD-84.** Plik migracji: `<timestamp>-<AUTOR>-<opis>` — bo numery kolejne kolidują między pasami; migracje i schemat to część wspólna (KOD-3).
**KOD-85.** OpenAPI generuj z kontraktu (KOD-5) i commituj; generator ma `--check` w bramce zadania i CI; **NIE WOLNO** edytować wyniku.
**KOD-86.** Zmiana kontraktu = wpis w changelogu API (dodane / zmienione / przestarzałe / usunięte); wycofywane pole lub endpoint oznacz `deprecated` z następcą i datą usunięcia, usunięcie = zmiana łamiąca.

## Procedura

### Zadanie implementacyjne

1. Czytaj brief, reguły o ID z briefu, `CLAUDE.md`, `.workflow/briefs/wspolny-implementer.md`.
2. `git merge origin/main`, instalacja z lockfile; poza zakresem → `NEEDS_CONTEXT`.
3. Krok: test → czerwień → kod → zieleń → commit.
4. Bramka:
   ```bash
   bash .workflow/bin/heavy.sh <polecenie bramki>   # każde z profilu osobno
   <generatory> --check
   bash .workflow/bin/check-secrets.sh; echo "kod $?"
   git status --porcelain     # pusto
   ```
5. Checklista → raport z `.workflow/templates/task/raport.md`.

### Nowy projekt (orkiestrator)

1. Kreator ze stosem; `dev-setup.sh` na każdej maszynie; bramka z profilu zielona.
2. `CLAUDE.md` z planu (`04-spec-i-plan.md` §Plan); fundament jako `S<n>` przed pasami.

## Szablony i narzędzia

- `.workflow/stacks/<stos>/`, `.workflow/templates/code/`, `.workflow/templates/task/raport.md`, `.workflow/bin/`.

## Checklista

- [ ] Zakres briefu; braki jako `NEEDS_CONTEXT` (KOD-3, KOD-4).
- [ ] RED z powodem, GREEN, mutacje (KOD-57, KOD-59); strażnik z kontrolą (KOD-39).
- [ ] Zapisy KOD-21–26, KOD-31; błąd ≠ pusto (KOD-32); tokeny (KOD-38); platformy (KOD-40).
- [ ] Backend KOD-49, KOD-51, KOD-52, KOD-61; migracje KOD-82–84; API KOD-9, KOD-85, KOD-86.
- [ ] `GENERATED` nietknięte (KOD-17).
- [ ] Bramka przez `heavy.sh`, skaner bez potoku, kod 0 (KOD-75, KOD-76).
- [ ] Commit na krok, drzewo czyste, bez `git stash` (KOD-58); raport zapisany.
