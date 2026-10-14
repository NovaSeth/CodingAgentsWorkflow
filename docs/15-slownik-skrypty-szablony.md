# 15. Słownik, skrypty, szablony

**Cel:** referencja — definicja terminu, polecenie skryptu z kodami wyjścia, szablon do danej sytuacji. **Czyta:** każdy agent, tylko potrzebną sekcję. **Kiedy:** nieznany termin, uruchamiasz skrypt, zakładasz dokument z szablonu.

**Mapa sekcji**
- §Słownik — definicje terminów metody (jedno zdanie na termin).
- §Skale wag — mapowanie wag recenzji, bezpieczeństwa i QA.
- §Skrypty — polecenie → co robi → kody wyjścia.
- §Runbooki — sytuacje awaryjne: `16-runbooki.md`.
- §Szablony — `.workflow/templates/**` → kiedy użyć.

## Słownik

| Termin | Definicja |
|---|---|
| orkiestrator | Główna sesja agenta, która planuje, pisze briefy, wybiera wykonawców, scala i rozstrzyga, ale nie pisze kodu funkcji. |
| wykonawca | Agent albo model dostawcy z poziomem effort, któremu orkiestrator zleca zadanie z briefu. |
| implementer | Rola wykonawcy, który implementuje zadanie z briefu w TDD w swoim pasie. |
| recenzent | Wykonawca inny niż autor, który ocenia zadanie tylko do odczytu i wydaje werdykt Approved / Needs fixes. |
| designer | Rola od specu, projektu, pakietów wspólnych o dużym wpływie i decyzji wymagających osądu (najmocniejszy model). |
| agent `security` | Wykonawca tylko do odczytu, który robi przegląd bezpieczeństwa PR albo okresowy audyt i zgłasza ustalenia `SEC-<n>`. |
| PO (właściciel produktu) | Człowiek, który decyduje o zakresie i priorytetach i odbiera raporty z bramek. |
| pas (obszar) | Katalogi kodu na wyłączność jednego orkiestratora; każde zadanie pasa ma własną gałąź `feat/<obszar>-<id>` od `main` i worktree `.worktrees/<id>`; pas nie jest gałęzią. |
| zajęcie pasa | Rezerwacja pasa przez `claim.sh` z datą ważności; inne niż zajęcie wpisu kolejki drugiego dostawcy. |
| zadanie wspólne `S<n>` | Jedyna droga zmiany części wspólnych: zleca orkiestrator, wykonuje designer (albo implementer przy zmianie mechanicznej), w zespole akceptuje właściciel z CODEOWNERS. |
| poprawka przekrojowa | Zadanie wspólne `S<n>` obejmujące wszystkie pasy, gdy ustalenie wskazuje wadę wzorca. |
| nota o wpływie | Plik rozesłany pasom po scaleniu `S<n>` z listą zamian, które każdy pas wykonuje osobnym commitem. |
| brief (wspólny / zadania) | Brief wspólny to wiążące reguły dla rodzaju zadań; brief zadania to plik z wartościami jednego zadania, brany dosłownie. |
| raport | Plik wykonawcy po zadaniu ze statusem, dowodem TDD, wynikiem bramki i stanem commitów. |
| plik ustaleń | Lista ustaleń z recenzji przekazana do rundy poprawek zamiast historii sesji. |
| recenzja | Ocena zadania przez innego wykonawcę: zgodność ze specyfikacją, problemy z wagą i `plik:linia`, werdykt. |
| ponowna recenzja zawężona | Recenzja samego diffu rundy poprawek, oznaczająca każde ustalenie ADDRESSED albo NOT ADDRESSED. |
| runda poprawek | Jedno przejście poprawek według pliku ustaleń, zakończone ponowną recenzją zawężoną. |
| bramka zadania | Zestaw automatycznych sprawdzeń (typecheck, lint, testy, sekrety, E2E), który musi być zielony przed recenzją i scaleniem. |
| bramka obszaru | Kontrola obszaru, gdy wszystkie jego zadania są w `main`: przegląd krzyżowy, pełne E2E, jedna runda poprawek, raport dla PO; kończy się wpisem `task.sh gate`. |
| przegląd krzyżowy | Recenzja całego diffu obszaru modelem innego dostawcy (albo świeżym recenzentem z innym promptem). |
| ledger | Plik `.workflow/progress.md`: rulingi (`ruling.sh`) i stany zadań (`task.sh`) dopisywane chronologicznie na końcu. |
| skan przed startem | Plik `.workflow/skan-przed-startem.md`: kontrola zadań planu względem siebie i Global Constraints przed pierwszym zleceniem. |
| paczka (zadania / ustaleń / E2E) | Paczka zadania — drobne zadania z jedną recenzją; paczka ustaleń — ustalenia Minor z triażu; paczka E2E — część przebiegu E2E. |
| awaria | Zdarzenie produkcyjne albo w procesie, które wymaga lekcji (`16-runbooki.md` §Awaria produkcyjna). |
| ruling (`R<n>` / `R-<AUTOR>-<n>`) | Zapisana decyzja „co — dlaczego — koszt błędu”, której numer trafia do kodu i PR; w zespole każdy autor ma własną serię. |
| lekcje | Plik `docs/workflow/lekcje.md` z incydentami i regułami zapisanymi w turze, w której wystąpiły. |
| podręcznik orkiestratora | Plik `docs/workflow/podrecznik-orkiestratora.md` z procedurą wznowienia i zasadami pracy w tym projekcie. |
| KANON (świat danych) | Jeden spójny zbiór danych zasilający makiety, fixtures, scenariusze mock i dema. |
| Global Constraints | Niezmienniki projektu w `CLAUDE.md` i planie, pilnowane testem, generatorem albo linterem, gdzie się da. |
| Review Focus | 3–5 konkretnych scenariuszy ryzyka, które recenzent sprawdza w każdym zadaniu. |
| definicja ukończenia | Lista warunków, które jednostka (ekran, endpoint, moduł) spełnia przed uznaniem za gotową. |
| budżet maszyny | Jeden łączny limit agentów, ciężkich poleceń i zasobów, sprawdzany `budget.sh` przed każdym zleceniem. |
| router | `route.mjs`, który dla typu zadania wybiera wykonawcę według kolejności kandydatów, limitów i karty wyników. |
| karta wyników | Plik `.workflow/routing/scorecard.jsonl` z rundami i przepuszczonymi ustaleniami każdego wykonawcy per typ zadania. |

## Skale wag

| Recenzja (REV) | Bezpieczeństwo (`SEC-<n>`) | QA na bramce | Skutek |
|---|---|---|---|
| Critical | Critical, High | klasa A (wada) | blokuje scalenie; bez wyłącznika |
| Important | Medium | klasa B (luka wspólna) | runda poprawek albo `S<n>` |
| Minor | Low, Info | klasa C (przyjęte) | lista odroczonych, triaż |

Zakres decyzji w zespole podawaj listą ID albo poleceniem, np. `grep -n 'R-AA-' .workflow/progress.md`, nie zakresem `R<a>–R<b>`.

## Skrypty

| Polecenie | Co robi | Kody wyjścia |
|---|---|---|
| `npx github:NovaSeth/CodingAgentsWorkflow [flagi]` = `node scripts/setup.mjs` frameworka | kreator: nowy / istniejący projekt; `--update [ścieżka]` aktualizuje pliki frameworka (zmienione lokalnie → `<plik>.kit-new`, sumy w `kit-files.json` w `.workflow/`); `--force` przy `--update` dopuszcza brudne drzewo; `--dry-run`, `--answers` | 0 · 1 przerwane · 2 błąd albo brudne drzewo przy `--update` |
| `bash .workflow/bin/task.sh <id> dispatched\|blocked\|cancelled\|self-verified\|status-request\|fix-round\|complete …` · `gate <obszar>` · `release` | dopisuje stan zadania do ledgera w gramatyce `tick.mjs`, z autorem i czasem (`02-proces-end-to-end.md` §Stany zadania) | 0 · 2 brak ledgera albo autora · 64 złe argumenty |
| `node .workflow/bin/tick.mjs` [`--plan <ścieżka>`] [`--json`] · `--ack` · `--audit-done` | z ledgera, `.workflow/tasks/`, `.workflow/runs/` i planu wylicza następne kroki i `NASTĘPNY_TICK`; w zespole osobno „Inni (informacyjnie)”; bez planu wiersz START | 0 AKCJA · 3 CZEKAJ · 4 KONIEC · 2 błąd |
| `bash .workflow/bin/ruling.sh "<co>" "<dlaczego>" "<koszt>" [--source …] [--shared]` · `--kind S\|SEC "<opis>"` · `--next` | dopisuje ruling (`R<n>` / `R-<AUTOR>-<n>`), zadanie wspólne albo ustalenie bezpieczeństwa z numerem z licznika wspólnego dla wszystkich worktree; `--shared` = znacznik [wspólne] | 0 · 2 brak ledgera, autora albo blokady licznika · 64 złe argumenty |
| `node .workflow/bin/check-ledger.mjs [katalog]` | wykrywa zdublowane ID rulingów, `S`, `SEC` w ledgerze i inicjały w `developers.txt` (krok CI) | 0 · 1 duplikaty · 2 brak plików |
| `bash .workflow/bin/brief.sh <id> [plan.md]` | wycina „### Zadanie <id>” z planu do `.workflow/tasks/<id>/brief.md`; `FORCE=1` nadpisuje | 0 · 1 brief istnieje albo brak zadania · 2 brak planu |
| `bash .workflow/bin/budget.sh [agent\|executor\|e2e]` | sprawdza load i wolną pamięć wobec progów (zmienne środowiska > `budget.local.env` > `budget.env`; `LOAD_MAX_NORMAL/HIGH`, `FREE_MIN_NORMAL/HIGH`; `LOAD_MAX=off` wyłącza load); brak pomiaru → CZEKAJ | 0 `OK` · 1 `CZEKAJ: <powody>` · 64 nieznany rodzaj |
| `bash .workflow/bin/heavy.sh <polecenie…>` | ciężkie polecenie w jednym z `HEAVY_SLOTS` slotów (domyślnie 2) wspólnych dla wszystkich worktree projektu | kod polecenia · 64 brak polecenia |
| `bash .workflow/bin/check-secrets.sh` [`--staged` \| `--range <rewizje>`] | skan sekretów: domyślnie indeks + drzewo robocze; wynik tylko `plik:linia`; wzorce projektu w `.workflow/secrets-patterns.txt`; uruchamiaj bez potoku | 0 czysto · 1 znaleziska · 2 błąd (wynik nieważny) |
| `bash .workflow/bin/check-key-leak.sh [--env plik] [--history] [--dir k]…` | szuka wartości z `.env` w repo, historii i artefaktach; nie drukuje wartości | 0 · 1 wyciek · 2 błąd |
| `node .workflow/bin/rules.mjs <ID…>` · `--core` | pełna treść reguł po ID; `--core` — reguły z `.workflow/rules-core.txt` | 0 · 1 nieznane ID · 2 brak metody |
| hook `.claude/hooks/workflow-context.mjs` | wstrzykuje reguły „zawsze” + wynik `tick.mjs` (sesja) albo reguły wykonawcy (subagent) | — |
| hook `.claude/hooks/guard-bash.mjs` | blokuje `git stash`, potok za `check-secrets.sh`, push innej gałęzi na `main`, force push na `main` (także `git push -f` bez refspec, gdy bieżąca gałąź to `main` albo zmieniła się wcześniej w tym samym poleceniu), `--no-verify`, `commit -n`, `core.hooksPath`; w zespole też `git push origin main` i `git push` z `main`; analizuje też `bash -c`, `eval`, `$(…)`, `find -exec`; wzorce z `.workflow/guard-extra.txt` | 0 przepuść · 2 blokada |
| hook `.claude/hooks/guard-schedule.mjs` (ScheduleWakeup, CronCreate) | blokuje prompt wybudzenia bez `tick.mjs` (PRC-15) i wybudzenie, gdy tick zwraca KONIEC (PRC-16); `stop` przepuszcza | 0 przepuść · 2 blokada |
| `bash .workflow/bin/dev-setup.sh [--author XY] [--yes] [--force-hooks]` | hooki (inny menedżer hooków zostaje z ostrzeżeniem; `--force-hooks` przełącza), `workflow.author`, progi w `budget.local.env`, narzędzia stosu | 0 · 1 inicjały zajęte · 2 błąd |
| `bash .workflow/bin/claim.sh <pas> [opis]` · `--renew <pas>` · `--release <pas> [--force]` · `--list` | zajmuje pas na `CLAIM_DAYS` dni (domyślnie 7) gałęzią `claim/<pas>`; `--list` pokazuje WYGASŁO; wygasłe przejmij `--release --force` po uzgodnieniu | 0 zajęte / już twoje · 1 cudze · 2 błąd albo brak `workflow.author` |
| `bash .workflow/bin/sync-agent-rules.sh [--check]` | generuje `AGENTS.md` z `CLAUDE.md` | 0 · 1 nieaktualny · 2 brak `CLAUDE.md` |
| `bash .workflow/bin/run-other.sh <worktree> <brief> <nazwa> <tryb> <model> <effort>` | CLI drugiego dostawcy w piaskownicy; wynik `.workflow/tasks/<nazwa>/<nazwa>.last.md` | kod CLI · 1 wynik istnieje · 2 zła ścieżka albo tryb |
| `node .workflow/routing/route.mjs <typ> [worktree brief nazwa] [--critical]` | wybiera wykonawcę i drukuje polecenie zlecenia | 0 · 2 błąd · 3 wszyscy kandydaci zablokowani (bez polecenia) |
| `route.mjs --list` · `--status` · `--rebalance` · `--record <typ> <wykonawca> <rundy> <przepuszczone> …` | typy i kandydaci · limity i karta · przebudowa kolejności · wpis do karty wyników | 0 · 2 błąd |
| `route.mjs --limit <dostawca> normal\|tight\|blocked [reset ISO] [uwaga]` | stan limitu dostawcy; reset tylko jako data ISO | 0 · 2 zły stan albo data |
| `.githooks/pre-push` | `check-secrets.sh` na wypychanych commitach | 0 · 1 push zablokowany |

## Szablony

| Szablon | Kiedy użyć |
|---|---|
| `.workflow/templates/spec.md` | nowa funkcja lub system → `docs/specs/` |
| `.workflow/templates/plan.md` | plan wdrożenia specu → `docs/plans/` |
| `.workflow/templates/task/brief.md` | brief zadania (po `brief.sh`) |
| `.workflow/templates/task/raport.md` | raport wykonawcy po zadaniu |
| `.workflow/templates/task/recenzja-brief.md` | brief dla recenzenta |
| `.workflow/templates/task/recenzja.md` | treść recenzji |
| `.workflow/templates/task/ustalenia.md` | plik ustaleń do rundy poprawek |
| `.workflow/templates/task/rereview.md` | brief ponownej recenzji zawężonej |
| `.workflow/templates/task/wplyw-na-pasy.md` | nota o wpływie po `S<n>` |
| `.workflow/templates/code/definicja-ukonczenia.md` | definicja ukończenia jednostki |
| `.workflow/templates/code/global-constraints.test.ts` | test strażnik „tylko tokeny” z kontrolą samego siebie |
| `.workflow/templates/code/module-README.md` | README modułu: odpowiedzialność, interfejs publiczny |
| `.workflow/templates/gate/raport-dla-PO.md` | raport po bramce obszaru |
| `.workflow/templates/gate/qa-klasyfikacja.md` | klasyfikacja wyników QA na bramce |
| `.workflow/templates/security/przeglad.md` | raport przeglądu bezpieczeństwa → `docs/security/` |
| `.workflow/templates/security/ustalenie.md` | jedno ustalenie `SEC-<n>` |
| `.workflow/templates/audits/audyt-tablicy.md` | audyt tablicy zadań względem gita i ledgera |
| `.workflow/templates/audits/triaz-minor.md` | triaż odroczonych ustaleń Minor |
| `.workflow/templates/design-system/CHANGELOG.md` | changelog design systemu (semver) |
| `.workflow/templates/design-system/checklista-wydania.md` | checklista wydania design systemu |
| `.workflow/templates/discovery/0-kontekst-wlasny.md` | faza 0 discovery → `research/` |
| `.workflow/templates/discovery/strumien-researchu.md` | jeden strumień researchu |
| `.workflow/templates/discovery/synteza-wywiadow.md` | synteza wywiadów |
| `.workflow/templates/discovery/raport-decyzyjny.md` | raport decyzyjny składany z części |
| `.workflow/templates/discovery/architektura-informacji.md` | architektura informacji systemu zastanego |
| `.workflow/templates/discovery/KANON.md` | KANON — świat danych |

## Runbooki

Sytuacje awaryjne (konflikt merge, spór z recenzentem, test niestabilny, hotfix, wycofanie, awaria produkcyjna, zadanie zablokowane, zmiana planu, migracja bazy, kod bez testów, regresja wydajności): `16-runbooki.md` — krótkie procedury z regułami RUN.
