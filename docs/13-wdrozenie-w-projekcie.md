# 13. Wdrożenie w projekcie

**Cel:** dobrać poziom i cechy, zainstalować kit kreatorem, podnosić poziom po sygnale, aktualizować framework. **Czyta:** osoba wdrażająca, orkiestrator, deweloper. **Kiedy:** start projektu, nowy deweloper, sygnał z §Sygnał → co dodać, nowa wersja frameworka.

**Mapa sekcji**
- §Reguły — WDR-1…WDR-28: dobór poziomu, `CLAUDE.md`, instalacja, aktualizacja.
- §Poziom → reguły obowiązkowe — co jest MUSI w minimum, standard, full.
- §Wdrażaj przy skali — kiedy element się opłaca.
- §Sygnał → co dodać, §Proces za ciężki — objaw → co dodać / uprościć.
- §Poziomy i cechy — co instaluje poziom i cecha.
- §Procedura — A nowy projekt, B istniejący, C po instalacji, D deweloper, E podniesienie poziomu, F aktualizacja frameworka.
- §Checklista — kontrola po instalacji.

Pytania i flagi kreatora: README frameworka (sekcja „Co określa kreator”) albo `setup.mjs --help`.

## Reguły

**WDR-1.** Zacznij od najniższego pasującego poziomu; podnoś go dopiero po sygnale z §Sygnał → co dodać i zapisz rulingiem.

**WDR-2.** Reguły z §Poziom → reguły obowiązkowe stosuj na swoim poziomie bez wyjątków; element z §Wdrażaj przy skali — tylko gdy projekt spełnia kolumnę „Opłaca się”.

**WDR-3.** Projekt na kilka dni prowadź na poziomie minimum.

**WDR-4.** NIE WOLNO przenosić liczb z metody dosłownie: progi maszyny, czas do prośby o status, interwał ticku, rozmiar paczek E2E skalibruj i zapisz rulingiem.

**WDR-5.** QA wizualne oceniane modelem stosuj tylko diagnostycznie; NIE WOLNO robić z niego bramki (ZAS-16).

**WDR-6.** `CLAUDE.md` projektu zawiera tylko twarde reguły i mapę wiedzy „sytuacja → plik §sekcja” — bo jest ładowany przy każdym starcie agenta.

**WDR-7.** Trzymaj `CLAUDE.md` poniżej 10 KB (domyślnie; własna wartość rulingiem); mechanikę narzędzi przenoś do README albo `--help`, historię do ledgera.

**WDR-8.** Bez drugiego dostawcy przegląd krzyżowy na bramce obszaru wykonuje świeży recenzent tego samego dostawcy z innym promptem.

**WDR-9.** Zasób wyłączny (urządzenie, emulator) najpierw zwielokrotnij; kolejkę z nadzorcą wdrażaj tylko, gdy to niemożliwe (`07-zasoby-i-wspolbieznosc.md` §Kolejka zasobu wyłącznego — nadzorca i zasady).

**WDR-10.** Router z kartą wyników wdrażaj dopiero przy co najmniej 5 zadaniach na typ (domyślnie); wcześniej tabela ról z `CLAUDE.md`.

**WDR-11.** Termin przeglądu bezpieczeństwa (przy zadaniu wrażliwym albo zbiorczo przed wydaniem) zapisz rulingiem (`09-bezpieczenstwo.md` §Kiedy robić przegląd — warianty i koszt).

**WDR-12.** Pułapki zależne od wersji narzędzi sprawdź na własnych wersjach.

**WDR-13.** Instaluj kit wyłącznie kreatorem `setup.mjs` (także przez `npx`) albo `install.sh`; NIE WOLNO kopiować plików kitu ręcznie — bo kreator ustawia hooki, progi, sumy plików i pierwszy ruling.

**WDR-14.** Przed instalacją w istniejącym projekcie uruchom kreator z `--dry-run` i przejrzyj plan.

**WDR-15.** Przy instalacji NIE WOLNO używać `--force` w projekcie z wypełnionym ledgerem, lekcjami albo `CLAUDE.md` — bo nadpisuje je wersją startową; przy `--update` `--force` tylko dopuszcza brudne drzewo.

**WDR-16.** Gdy kreator zapisze `CLAUDE.workflow.md` (bo `CLAUDE.md` istnieje), scal jego sekcje do `CLAUDE.md` i usuń go w tym samym commicie.

**WDR-17.** Pierwsze zadanie po instalacji, nawet małe, przeprowadź w pełnym cyklu: brief → implementer → recenzja → ponowna recenzja zawężona → PR.

**WDR-18.** Każdy deweloper MUSI uruchomić `.workflow/bin/dev-setup.sh` na swojej maszynie po sklonowaniu repo, przed pierwszym zleceniem agenta.

**WDR-19.** Poziom podnoś kreatorem w trybie `existing` z wyższym `--level` i `--answers .workflow/config.json`; pliki istniejące są pomijane, `config.json` jest nadpisywany.

**WDR-20.** Po podniesieniu poziomu zapisz ruling ręcznie przez `ruling.sh` — kreator dopisuje ruling konfiguracji tylko przy pierwszej instalacji.

**WDR-21.** Nową wersję frameworka pobieraj wyłącznie przez `setup.mjs --update` (§F); NIE WOLNO kasować plików projektu, żeby wymusić nową wersję.

**WDR-22.** Po zakończeniu projektu porównaj lekcje z katalogiem pułapek i tabelami doboru; rozbieżności zgłoś jako zmianę metody.

**WDR-23.** `--update` uruchamiaj na czystym drzewie gita, na osobnej gałęzi; przy brudnym drzewie kreator odmawia (kod 2) — bo diff aktualizacji musi być oddzielony od pracy w toku.

**WDR-24.** Każdy `<plik>.kit-new` porównaj z plikiem obok, scal potrzebne zmiany i usuń `.kit-new`; NIE WOLNO scalać PR aktualizacji z plikami `.kit-new`.

**WDR-25.** Własne reguły dopisuj do plików projektu (`secrets-patterns.txt`, `guard-extra.txt`, `rules-core.txt` w `.workflow/`, `CLAUDE.md`), NIGDY do plików frameworka — bo zmieniony lokalnie przestaje się aktualizować.

**WDR-26.** Plik frameworka zmieniony lokalnie przywróć: usuń go i uruchom `setup.mjs --update`.

**WDR-27.** Pliki zgłoszone przez `--update` jako przestarzałe usuń `git rm` w PR aktualizacji — kreator ich nie usuwa.

**WDR-28.** Inicjały: `--author`, inaczej `git config workflow.author`, inaczej z `user.name`; NIE WOLNO zapisywać ich w `.workflow/config.json` — bo plik jest wspólny dla zespołu.

### Poziom → reguły obowiązkowe

„—” = nie wymagane (§Wdrażaj przy skali). Cechy (zespół, UI, backend, discovery, CI) dokładają reguły niezależnie od poziomu.

| Element (reguły) | minimum | standard | full |
|---|---|---|---|
| Spec → plan → brief, świeży agent (ZAS-3, ZAS-4) | MUSI | MUSI | MUSI |
| Gałąź zadania od `main`, PR, `git merge origin/main` zamiast rebase (ZAS-2, ORK-33) | MUSI | MUSI | MUSI |
| Worktree per zadanie (ZAS-5) | tryb sekwencyjny | MUSI | MUSI |
| Recenzja innym wykonawcą, wyłącznik po 2 rundach (ZAS-7, ZAS-10) | MUSI | MUSI | MUSI |
| Ponowna recenzja zawężona: dane, zapisy, autoryzacja, współbieżność (ZAS-8, REV-18) | MUSI | MUSI | MUSI |
| Ponowna recenzja: poprawki mechaniczne i UI | albo `task.sh <id> self-verified --round <k>` | jw. | jw. |
| TDD, bramka zadania, skaner sekretów (PRC-6, PRC-7) | MUSI | MUSI | MUSI |
| Ledger, lekcje, `task.sh`, pętla `tick.mjs` (ZAS-11, ZAS-13, PRC-18) | MUSI | MUSI | MUSI |
| Agent `security`, przegląd przy wyzwalaczu i przed wydaniem (WDR-11) | MUSI | MUSI | MUSI |
| `budget.sh` + `heavy.sh` (ZAS-18) | — | MUSI | MUSI |
| Bramka obszaru z przeglądem krzyżowym (ZAS-9) | przed wydaniem | MUSI | MUSI |
| Router z kartą wyników, okresowy audyt bezpieczeństwa | — | — | MUSI |
| Długożyjąca gałąź pasa | NIE WOLNO | NIE WOLNO | tylko rulingiem |

Tryb sekwencyjny: gałąź zadania w głównym checkoucie, jeden implementer naraz, recenzent tylko do odczytu.

### Wdrażaj przy skali

| Element | Opłaca się | Balast | Włącz |
|---|---|---|---|
| Pasy (obszary), `S<n>`, noty o wpływie | 3+ agentów na wspólnym kodzie | jeden agent | standard |
| Przegląd krzyżowy innym dostawcą | zapisy, autoryzacja, współbieżność | brak drugiego dostawcy (WDR-8) | `--second-provider` |
| Kolejka zasobu wyłącznego | jedno urządzenie dla wielu agentów | zasób da się zwielokrotnić | WDR-9 |
| Discovery, KANON | nowy produkt, zakres MVP | jasny backlog | `--discovery` |
| Design system z wersjonowaniem | UI rozwijany miesiącami | prototyp | `--ui` |
| Idempotencja, dzierżawcy, `canRetry` (`05-jak-kodowac.md` §Zapisy) | zapisy, dane wielu użytkowników | brak trwałego zapisu | `--backend` |
| Zajmowanie pasów, serie rulingów, CODEOWNERS, CI | 2+ deweloperów z orkiestratorami | jedna osoba | `--team zespol` |

### Sygnał → co dodać

| Sygnał | Co dodać |
|---|---|
| Ten sam błąd wraca w recenzjach trzeci raz | sekcja wiążąca w briefie wspólnym, test strażnik |
| Agenci zderzają się na tych samych plikach | pasy, części wspólne przez `S<n>` |
| Maszyna zwalnia | `heavy.sh`, `budget.sh` |
| Trudno wrócić po przerwie | podręcznik z procedurą wznowienia |
| Limity dostawcy kończą się przed końcem dnia | router, drugi dostawca |
| Losowe wyniki E2E przy wielu agentach | zwielokrotnienie środowiska, kolejka zasobu |
| Recenzje przepuszczają błędy | przegląd krzyżowy innym dostawcą, karta wyników |
| Drugi deweloper prowadzi własnych agentów | cecha zespołu (`14-zespol-wielu-deweloperow.md` §Procedura — start zespołu) |

### Proces za ciężki

| Sygnał | Co zrobić |
|---|---|
| Ledger i tablica zabierają więcej czasu niż rozstrzyganie | stany `task.sh`, decyzje `ruling.sh`, tablica: `mechanic` |
| Recenzja czeka dłużej, niż trwa implementacja | łącz drobne zadania w paczki zadań z jedną recenzją |
| Router ma mniej niż 5 zadań na typ | wróć do tabeli ról (WDR-10) |
| Rundy poprawek dotyczą stylu | reguła do lintera i Global Constraints |

### Poziomy i cechy

Poziomy są kumulatywne; lista plików: `manifest.json` frameworka albo `setup.mjs --dry-run`.
- **minimum:** metoda, `CLAUDE.md`, ledger, `ruling.sh`, `task.sh`, `tick.mjs`, `check-ledger.mjs`, `.workflow/skan-przed-startem.md`, hooki `.claude/hooks/`, lekcje, podręcznik, `implementer`, `reviewer`, `security` z przewodnikiem, szablony, `check-secrets.sh` + `pre-push`, `dev-setup.sh`.
- **standard:** + `designer`, `qa`, `mechanic`, skill orkiestracji, `heavy.sh`, `budget.sh`, `check-key-leak.sh`, brief wspólny, szablony bramek i audytów.
- **full:** + router `.workflow/routing/`, `run-other.sh`.
- Cechy: **zespół** — `claim.sh`, `zespol.md`, CODEOWNERS (m.in. `.claude/`, `rules-core.txt`, `guard-extra.txt`, `secrets-patterns.txt`, `docs/workflow/metoda/`, `config.json`), `merge=union`, serie `R-<AUTOR>-<n>`; **UI** — szablony DS; **discovery** — szablony discovery; **backend** — Global Constraints idempotencji i dzierżawców w `CLAUDE.md`; **drugi dostawca** — `run-other.sh`, dostawca `other` w routerze; **CI** — workflow z jobami `bramki / proces`, `bramki / jakosc`, `bramki / wynik` (`npm ci` przy lockfile, `check-ledger.mjs`) + szablon PR.

## Procedura

### A. Nowy projekt

1. Uruchom kreator (`--answers plik.json` wczytuje odpowiedzi, `--dry-run` pokazuje plan):
   ```bash
   npx github:NovaSeth/CodingAgentsWorkflow            # bez klonowania frameworka
   node <ścieżka-do-frameworka>/scripts/setup.mjs --yes --mode new --path ~/Code/projekt --team solo --level standard --backend --no-ui
   ```
2. Kreator robi `git init`, kopiuje pliki, wypełnia `CLAUDE.md`, zapisuje sumy plików (`kit-files.json` w `.workflow/`), uruchamia `dev-setup.sh`, dopisuje ruling konfiguracji i commit startowy. Wykonaj procedurę C.

### B. Istniejący projekt

1. Podejrzyj plan (WDR-14); `install.sh` to ścieżka bez pytań:
   ```bash
   node <ścieżka-do-frameworka>/scripts/setup.mjs --mode existing --path . --dry-run
   ```
2. Zainstaluj bez `--dry-run`, scal `CLAUDE.workflow.md` (WDR-16), wykonaj procedurę C.

### C. Kroki po instalacji

1. Uzupełnij `CLAUDE.md` (WDR-6): polecenia, Global Constraints (zacznij od 5–8), Review Focus, definicja ukończenia.
2. Dopisz wzorce własnych tokenów do `.workflow/secrets-patterns.txt` i uruchom bez potoku: `bash .workflow/bin/check-secrets.sh; echo "kod $?"`.
3. Po pierwszym planie wypełnij `.workflow/skan-przed-startem.md`; sprzeczności zapisz rulingami przed pierwszym zleceniem.
4. Skalibruj progi (`budget.local.env` albo `budget.env` w `.workflow/`), sprawdź `budget.sh agent`, zapisz rulingiem.
5. Standard i wyżej: uzupełnij podręcznik orkiestratora (§0, §7) i przewodnik bezpieczeństwa.
6. Full: dopasuj `.workflow/routing/routing.json` (`route.mjs --list`).
7. Przepisz do lekcji pułapki Twojego stosu z `12-pulapki-narzedziowe.md` §Reguły — katalog pułapek (WDR-12).
8. Zespół: wypchnij, chroń `main` (wymagany tylko check `bramki / wynik`, Code Owners, 1 akceptacja), zajmij pas (`14-zespol-wielu-deweloperow.md` §Zajęcie i przekazanie pasa — `claim.sh`).
9. Pierwsze zadanie w pełnym cyklu (WDR-17).

### D. Deweloper na swojej maszynie

1. Po sklonowaniu: `.workflow/bin/dev-setup.sh --author <INICJAŁY>` (`15-slownik-skrypty-szablony.md` §Skrypty — opis i kody); inicjały trafiają do `git config workflow.author` (WDR-28).
2. Zespół: zacommituj dopisaną linię `.workflow/developers.txt`; kod 1 = inicjały zajęte (np. `--author MG2`).

### E. Podniesienie poziomu

1. Podejrzyj zmiany; cechę dokładasz flagą (`--second-provider`, `--team zespol`, `--backend`):
   ```bash
   node <ścieżka-do-frameworka>/scripts/setup.mjs --answers .workflow/config.json --mode existing --path . --level standard --yes --dry-run
   ```
2. Uruchom bez `--dry-run`, scal `CLAUDE.workflow.md` (WDR-16), zapisz ruling (WDR-20).
3. Wykonaj kroki 5, 6 i 8 procedury C właściwe dla nowego poziomu.

### F. Aktualizacja frameworka

1. Czyste drzewo, osobna gałąź (WDR-23); z klonu najpierw `git -C <ścieżka-do-frameworka> pull`:
   ```bash
   npx github:NovaSeth/CodingAgentsWorkflow --update .
   ```
2. Kreator czyta `.workflow/config.json` i sumy SHA-256 z `kit-files.json` w `.workflow/`:

   | Plik | `--update` |
   |---|---|
   | frameworka, niezmieniony lokalnie | zastępuje |
   | frameworka, zmieniony lokalnie | zostawia; nowa wersja → `<plik>.kit-new` + ostrzeżenie |
   | projektu (`userOwned`), nowy szablon | zostawia; szablon → `<plik>.kit-new` |
   | identyczny | pomija |
   | nieobecny w nowym kicie | zgłasza jako przestarzały |

   Na końcu zapisuje sumy i ruling aktualizacji (gdy coś się zmieniło).
3. Scal `.kit-new` (WDR-24), usuń przestarzałe (WDR-27), przejrzyj `git diff`, uruchom bramkę zadania, scal przez PR.

## Checklista

- [ ] `--dry-run` przejrzany; `CLAUDE.workflow.md` nie istnieje (WDR-14, WDR-16).
- [ ] `CLAUDE.md` ma tylko twarde reguły i mapę wiedzy (WDR-6).
- [ ] Wzorce w `secrets-patterns.txt`; `check-secrets.sh` zwraca 0 bez potoku (WDR-25).
- [ ] Progi budżetu skalibrowane rulingiem (WDR-4); skan przed startem wypełniony.
- [ ] Każdy deweloper uruchomił `dev-setup.sh` (WDR-18); zespół: ochrona `main` z checkiem `bramki / wynik`.
- [ ] Po `--update`: brak `.kit-new` i plików przestarzałych (WDR-24, WDR-27).
- [ ] Pierwsze zadanie przeszło pełny cykl (WDR-17).
