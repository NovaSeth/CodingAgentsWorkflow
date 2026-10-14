# 00. Indeks metody

**Cel:** router wiedzy — z sytuacji prowadzi do jednej sekcji jednego dokumentu, skryptu albo szablonu. **Czyta:** orkiestrator (zawsze), wykonawcy (gdy brief odsyła do metody). **Kiedy:** na start sesji i gdy nie wiesz, którą regułę zastosować.

**Jak czytać metodę:** nie czytaj dokumentów w całości. Znajdź sytuację w §Sytuacja → sekcja i przeczytaj tylko wskazaną sekcję (`grep -n '^### Brief' docs/workflow/metoda/06-*.md`). Regułę po ID: `grep -n 'KOD-7\.' docs/workflow/metoda/*.md` albo `node .workflow/bin/rules.mjs KOD-7`. Subagentowi przekazuj ścieżki i ID reguł, nie treść.

**Mapa sekcji**
- §Na start — co czyta orkiestrator i co wykonawca przed pracą.
- §Sytuacja → sekcja — sytuacja → plik §sekcja → co tam jest.
- §Dokumenty — 01–16: prefiks reguł i cel.

## Na start

| Kto | Czyta (w tej kolejności) |
|---|---|
| Orkiestrator | `CLAUDE.md` → ten indeks → `docs/workflow/podrecznik-orkiestratora.md` §0 (wznowienie) → `node .workflow/bin/tick.mjs` |
| Wykonawca | swój brief `.workflow/tasks/<id>/brief.md` → brief wspólny wskazany w briefie → tylko pliki i ID reguł z briefu |
| Nowy deweloper | `13-wdrozenie-w-projekcie.md` §D — `dev-setup.sh` na własnej maszynie |

## Sytuacja → sekcja

| Sytuacja | Plik §Sekcja | Co tam jest |
|---|---|---|
| Nowy projekt | `13-wdrozenie-w-projekcie.md` §A | kreator, `npx`, kroki po instalacji |
| Istniejący projekt | `13-wdrozenie-w-projekcie.md` §B | `--dry-run`, `CLAUDE.workflow.md` |
| Które reguły obowiązują na moim poziomie | `13-wdrozenie-w-projekcie.md` §Poziom → reguły obowiązkowe | MUSI w minimum / standard / full |
| Proces za lekki albo za ciężki | `13-wdrozenie-w-projekcie.md` §Sygnał → co dodać | objaw → element procesu |
| Podniesienie poziomu | `13-wdrozenie-w-projekcie.md` §E | `--answers .workflow/config.json`, ruling |
| Nowa wersja frameworka, plik `.kit-new` | `13-wdrozenie-w-projekcie.md` §F | `--update`, sumy plików, scalanie `.kit-new` |
| Wznowienie po przerwie, kompakcji | `docs/workflow/podrecznik-orkiestratora.md` §0 | kroki; uzasadnienie: `11-pamiec-projektu.md` §Procedura wznowienia |
| Nie pamiętam reguł | `11-pamiec-projektu.md` §Przypominanie reguł | hooki, `rules.mjs --core` |
| Tick pętli orkiestratora | `02-proces-end-to-end.md` §Pętla orkiestratora | `tick.mjs`, AKCJA / CZEKAJ / KONIEC |
| Zapis stanu zadania | `02-proces-end-to-end.md` §Stany zadania | `task.sh`: dispatched, blocked, fix-round, complete, gate |
| Pytanie do człowieka — czy wolno | `06-orkiestracja-i-role.md` §Autonomia | ORK-58, ORK-59: autonomia i lista stopów |
| Nowy produkt, zakres MVP | `03-discovery-research-makiety.md` §Procedura | faza 0, strumienie, raport decyzyjny |
| Dane do makiet, fixtures | `03-discovery-research-makiety.md` §KANON | zasada konfliktu |
| Piszę spec | `04-spec-i-plan.md` §Specyfikacja | sekcje specu |
| Piszę plan, Global Constraints | `04-spec-i-plan.md` §Plan | fazy, pasy, anatomia zadania |
| Definicja ukończenia | `04-spec-i-plan.md` §Definicja ukończenia | ekran / endpoint / moduł |
| Zmiana części wspólnej | `14-zespol-wielu-deweloperow.md` §Części wspólne | `S<n>`, nota o wpływie |
| Brief zadania | `06-orkiestracja-i-role.md` §Brief | zawartość, brief wspólny |
| Zlecam zadanie | `06-orkiestracja-i-role.md` §Procedura | brief, router, budżet, worktree |
| Kto wykona zadanie | `06-orkiestracja-i-role.md` §Router | typy, karta wyników, limity |
| Drugi dostawca | `06-orkiestracja-i-role.md` §Drugi dostawca | piaskownica, wynik do pliku |
| Agent milczy | `06-orkiestracja-i-role.md` §Nadzór | prośba o status, `task.sh status-request` |
| Raport `NEEDS_CONTEXT` / `BLOCKED` | `06-orkiestracja-i-role.md` §Statusy | reakcja orkiestratora |
| Dostaję brief (implementer) | `05-jak-kodowac.md` §Zadanie implementacyjne | od worktree do raportu |
| Kod z zapisami, ponowieniami | `05-jak-kodowac.md` §Zapisy | idempotencja, `canRetry` |
| TDD, E2E | `05-jak-kodowac.md` §TDD i E2E | dowód RED/GREEN |
| Czy mogę zlecić kolejne zadanie | `07-zasoby-i-wspolbieznosc.md` §Budżet maszyny | `budget.sh`, progi |
| Pełne testy, build | `07-zasoby-i-wspolbieznosc.md` §Kolejka ciężkich poleceń | `heavy.sh` |
| Urządzenie dla wielu agentów | `07-zasoby-i-wspolbieznosc.md` §Kolejka zasobu wyłącznego | kolejka z nadzorcą |
| Robię recenzję | `08-recenzje-i-bramki.md` §Recenzja zadania | format, wagi, werdykt |
| Ustalenia do poprawek | `08-recenzje-i-bramki.md` §Plik ustaleń | format |
| Po rundzie poprawek | `08-recenzje-i-bramki.md` §Ponowna recenzja zawężona | ADDRESSED / NOT ADDRESSED |
| Druga runda nie domknęła ustaleń | `08-recenzje-i-bramki.md` §Wyłącznik po dwóch rundach | ruling, odroczone |
| Przed recenzją albo scaleniem | `08-recenzje-i-bramki.md` §Bramka zadania | skład i dowody |
| Obszar kompletny | `08-recenzje-i-bramki.md` §Bramka obszaru | przegląd krzyżowy, E2E, `task.sh gate` |
| Raport dla PO | `08-recenzje-i-bramki.md` §Raport dla właściciela produktu | struktura raportu |
| Wagi: recenzja, bezpieczeństwo, QA | `15-slownik-skrypty-szablony.md` §Skale wag | mapowanie |
| Przegląd bezpieczeństwa PR | `09-bezpieczenstwo.md` §Przegląd PR | zakres, `SEC-<n>` |
| Wyciek sekretu | `09-bezpieczenstwo.md` §Wyciek sekretu | rotacja, sprzątanie |
| Przed wydaniem | `09-bezpieczenstwo.md` §Bramki wydania | co blokuje |
| Zmiana tokenów, komponentu DS | `10-design-system.md` §B | kroki zmiany |
| Wydanie design systemu | `10-design-system.md` §A | wersjonowanie |
| Nowa decyzja | `11-pamiec-projektu.md` §Ledger decyzji | gramatyka, `ruling.sh` |
| Awaria, nowa reguła | `11-pamiec-projektu.md` §Lekcje | format lekcji |
| Tablica zadań rozjechana z gitem | `11-pamiec-projektu.md` §Tablica zadań | audyt |
| Błąd powłoki, gita, worktree | `12-pulapki-narzedziowe.md` §Powłoka i skrypty | pułapki (też §Git i worktree) |
| Kilku deweloperów, zajęcie pasa | `14-zespol-wielu-deweloperow.md` §Zajmowanie pasów | `claim.sh`, serie, CODEOWNERS |
| Konflikt merge w worktree | `16-runbooki.md` §Konflikt merge | rozwiązanie bez rebase |
| Spór recenzent–implementer | `16-runbooki.md` §Spór z recenzentem | DISPUTED, ruling |
| Test niestabilny | `16-runbooki.md` §Test niestabilny | kwarantanna rulingiem |
| Hotfix produkcyjny | `16-runbooki.md` §Hotfix | gałąź od tagu, bramka po fakcie |
| Wycofanie zmiany | `16-runbooki.md` §Wycofanie zmiany | `git revert` przez PR |
| Awaria produkcyjna | `16-runbooki.md` §Awaria produkcyjna | zatrzymanie, fakty, lekcja |
| Zadanie zablokowane na zewnątrz | `16-runbooki.md` §Zadanie zablokowane | `task.sh blocked`, fallback |
| Zmiana planu w trakcie | `16-runbooki.md` §Zmiana planu | `cancelled`, nowy brief |
| Migracja bazy | `16-runbooki.md` §Migracja bazy | expand → migrate → contract |
| Kod zastany bez testów | `16-runbooki.md` §Kod bez testów | test charakteryzujący |
| Regresja wydajności | `16-runbooki.md` §Regresja wydajności | benchmark gałąź vs `main` |

## Dokumenty

| Plik | Prefiks | Cel |
|---|---|---|
| `01-zasady-naczelne.md` | ZAS | zasady, z których wynikają pozostałe reguły |
| `02-proces-end-to-end.md` | PRC | etapy, artefakty, pętla orkiestratora, `task.sh` |
| `03-discovery-research-makiety.md` | DSC | research, wywiady, raport decyzyjny, KANON |
| `04-spec-i-plan.md` | SPC | spec, plan, zadanie, definicja ukończenia |
| `05-jak-kodowac.md` | KOD | architektura, wzorce kodu, TDD, E2E, profile stosów |
| `06-orkiestracja-i-role.md` | ORK | orkiestrator, role, brief, nadzór, worktree, router |
| `07-zasoby-i-wspolbieznosc.md` | RES | budżet maszyny, kolejki, limity API |
| `08-recenzje-i-bramki.md` | REV | recenzja, ponowna recenzja zawężona, wyłącznik, bramki |
| `09-bezpieczenstwo.md` | BZP | walidacja, przegląd PR, audyt, bramki wydania (`SEC-<n>`) |
| `10-design-system.md` | DSN | tokeny, komponenty, wersjonowanie, makiety |
| `11-pamiec-projektu.md` | MEM | ledger, lekcje, podręcznik, wznowienie, tablica |
| `12-pulapki-narzedziowe.md` | PUL | pułapki powłoki, gita, procesów, raportów |
| `13-wdrozenie-w-projekcie.md` | WDR | poziom → reguły, kreator, aktualizacja |
| `14-zespol-wielu-deweloperow.md` | ZES | kilku deweloperów z własnymi orkiestratorami |
| `15-slownik-skrypty-szablony.md` | — | słownik, skale wag, skrypty, szablony |
| `16-runbooki.md` | RUN | procedury awaryjne: merge, spór, hotfix, wycofanie, migracja |
