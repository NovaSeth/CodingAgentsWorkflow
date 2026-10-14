# 11. Pamięć projektu: ledger, lekcje, podręcznik, wznowienie

**Cel:** stan i decyzje projektu żyją w gicie, więc każda sesja, agent albo osoba wznawia pracę bez utraty wiedzy. **Czyta:** orkiestrator; nowy członek zespołu (§Procedura). **Kiedy:** przy każdej decyzji, po awarii, po limicie, kompakcji, restarcie i przy przekazaniu pasa.

**Mapa sekcji**
- §Elementy pamięci — pliki, kto pisze, kiedy czytać.
- §Ekonomia kontekstu — co czytać skrótowo.
- §Ledger decyzji — struktura, `ruling.sh`, `task.sh`, gramatyka wpisów, serie numerów.
- §Lekcje — format i awans do briefu wspólnego.
- §Podręcznik orkiestratora — zawartość, usługi pomocnicze.
- §Zasady współpracy — preferencje człowieka w repo.
- §Tablica zadań — statusy, audyt.
- §Plik wejścia — limit `CLAUDE.md`, `AGENTS.md`.
- §Zapis historyczny — `.workflow/tasks/`, dane osobowe.
- §Przypominanie reguł — hooki, `rules-core.txt`, strażnik, reguły w ticku.
- §Procedura — wznowienie, zapis decyzji, przekazanie, audyt tablicy.

## Reguły

### Elementy pamięci

**MEM-1.** Pamięć projektu tworzy pięć elementów z tabeli; każdy aktualizuj w tej samej turze co zdarzenie — przed kolejnym zleceniem i zanim zakończysz odpowiedź.

| Element | Plik | Kto pisze | Kiedy czytać |
|---|---|---|---|
| Ledger | `.workflow/progress.md` | orkiestrator (`ruling.sh`, `task.sh`) | `tail -80` przy wznowieniu |
| Lekcje | `docs/workflow/lekcje.md` | orkiestrator, po awarii | przed planowaniem, przy podobnym problemie |
| Podręcznik orkiestratora | `docs/workflow/podrecznik-orkiestratora.md` | orkiestrator, gdy zmienia się sposób pracy | pierwszy po wznowieniu |
| Zasady współpracy | `docs/workflow/zasady-wspolpracy.md` | orkiestrator, po preferencji człowieka | po wznowieniu, nowy członek zespołu |
| Tablica zadań | narzędzie zespołu | orkiestrator, z ledgerem | ludzie śledzący postęp |

### Ekonomia kontekstu

**MEM-2.** Stan czytaj przez `tail -80 .workflow/progress.md`; **NIE WOLNO** ładować całego ledgera do kontekstu.
**MEM-3.** Uzasadnienie decyzji znajduj przez `grep -n 'R<n>' .workflow/progress.md`, regułę metody przez `node .workflow/bin/rules.mjs <ID>`.
**MEM-4.** Dokumenty metody czytaj sekcjami — ORK-12 (`06-orkiestracja-i-role.md` §Ekonomia kontekstu — reguły zlecania).
**MEM-5.** Przy wznowieniu zaczynaj od plików wyników (`.workflow/tasks/*/`, `.workflow/runs/`) i 5-linijkowych statusów, nie od pełnych logów.
**MEM-6.** Subagent dostaje ścieżki i ID reguł — ORK-10.

### Ledger decyzji

**MEM-7.** Ledger `.workflow/progress.md` jest chronologiczny i tylko dopisywany na końcu; `.gitattributes` ma dla niego `merge=union`.
**MEM-8.** Struktura ledgera: nagłówek (plan, repo, konwencje numeracji, odesłanie do `.workflow/skan-przed-startem.md`), potem wpisy chronologiczne — rulingi i stany zadań przeplecione, bez osobnej sekcji rulingów.
**MEM-9.** Skan przed startem prowadź w `.workflow/skan-przed-startem.md` (edytowany w miejscu, poza ledgerem): każde zadanie planu wewnętrznie, z innymi zadaniami i z Global Constraints; każda sprzeczność staje się rulingiem przed pierwszym zleceniem.
**MEM-10.** Każdą decyzję zapisuj `.workflow/bin/ruling.sh "<co>" "<dlaczego>" "<koszt błędu>" [--source "<źródło>"] [--shared]`; skrypt nadaje numer i dopisuje na końcu ledgera `- Ruling <ID> (<data> <autor>) (źródło: …): co — dlaczego — koszt błędu: ….`
**MEM-11.** Serie: jedna osoba — `R<n>`, `S<n>`, `SEC-<n>`; zespół (`"multiDev": true`) — `R-<AUTOR>-<n>`, `S-<AUTOR>-<n>`, `SEC-<AUTOR>-<n>` (`ruling.sh --kind S|SEC`); `AUTOR` = `git config workflow.author`; licznik jest wspólny dla worktree, duplikaty wykrywa `node .workflow/bin/check-ledger.mjs` (kod 1, krok CI).
**MEM-12.** Każdy ruling podaje koszt błędu.
**MEM-13.** Numer rulingu pojawia się w kodzie, komentarzu i PR przy zmianie, której dotyczy.
**MEM-14.** Korekta to nowy ruling cytujący stary (`--source "korekta R<k> pkt 1–2"`); **NIE WOLNO** edytować starych wpisów ledgera.
**MEM-15.** Słowa człowieka cytuj dosłownie jako źródło (`--source "PO: «…»"`).
**MEM-16.** Partie decyzji ze specu zatwierdzaj listą ID („R4, R5, R7 zatwierdzone (autonomia)”), w zespole listą albo poleceniem `grep -n 'R-<AUTOR>-' .workflow/progress.md`.
**MEM-17.** Zmiany kolejności routera, progów budżetu i trybów pracy też są rulingami; każde poluzowanie ma warunek powrotu.
**MEM-18.** Decyzja dotycząca innych pasów lub części wspólnych ma znacznik `[wspólne]` (`ruling.sh --shared`; `14-zespol-wielu-deweloperow.md` §Decyzje i pliki dopisywane — synchronizacja zespołu).
**MEM-19.** Wpisy stanu zadania pisze wyłącznie `.workflow/bin/task.sh` (autor i czas zawsze; `--help`): `<id> dispatched --exec <w> --base <sha> [--pas <pas>]` (`--pas` w zespole) · `blocked "<co odblokuje>"` · `cancelled "<powód>"` · `self-verified --round <k>` · `status-request` · `implementer <STATUS>` · `fix-round --round <k> --addressed <a> --open <o>` · `complete "<opis>"` · `task.sh gate <obszar>` · `task.sh release`; **NIE WOLNO** pisać ich ręcznie — bo `tick.mjs` czyta je dosłownie.
**MEM-20.** Przed przerwą, końcem sesji i przekazaniem pasa dopisz `STAN DO WZNOWIENIA (<godzina>)`: co w toku, worktree, procesy w tle.

```
Task <id>: dispatched (BASE <sha>) — <wykonawca> by <AUTOR> pas <pas> @ RRRR-MM-DD GG:MM
Task <id>: blocked (<co odblokuje>) by <AUTOR> @ …   ·   Task <id>: cancelled (<powód>) by … @ …
Task <id>: self-verified r<k> by … @ …   ·   Task <id>: status-request by … @ …
Task <id>: implementer DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED (<opis>) by … @ …
Task <id>: fix round <k>/2 (<a> addressed, <o> open) by … @ …
Task <id>: complete (<commits, PR, SHA na main>) by … @ …
Gate <obszar>: done by … @ …   ·   Release: done by … @ …
--- ręcznie ---
Task <id>: review <k> → Approved | Needs fixes (<n> Important: …)
Task <id>: minor (deferred → <cel>): <ustalenie>
Env: <zdarzenie + jak cofnąć>   ·   Lekcja: …   ·   Awaria: …   ·   STAN DO WZNOWIENIA (<godzina>): …
```

Wpis może zaczynać się od „- ”.

### Lekcje

**MEM-21.** Lekcję dopisuj do `docs/workflow/lekcje.md` w tej samej turze co awaria albo nowa reguła.
**MEM-22.** Lekcja ma źródło (ruling albo data awarii), objaw, przyczynę i regułę.
**MEM-23.** Lekcja wracająca w recenzjach awansuje do briefu wspólnego (ORK-16), a sprawdzalna automatycznie — do testu strażnika.
**MEM-24.** Lekcje ogólne (powłoka, git, procesy) trzymaj osobno; katalog startowy: `12-pulapki-narzedziowe.md` §Reguły — pułapki do przeniesienia na swój stos.

### Podręcznik orkiestratora

**MEM-25.** Podręcznik czytaj jako pierwszy po limicie, kompakcji, nowej sesji i restarcie; zawiera procedurę wznowienia (§0), autonomię, architekturę pracy, limity i zasady produktu z numerami rulingów.
**MEM-26.** Aktualizuj podręcznik w tej samej turze, w której zmienia się sposób pracy.
**MEM-27.** Każdy proces, od którego zależy praca (nadzorca kolejki, pętla, monitor logów, blokada usypiania), ma w §0 polecenie statusu i startu; proces przeżywający restart instaluj jako usługę systemową.
**MEM-28.** Zanim zlecisz zadanie od nowa, sprawdź, czy jego proces w tle nie pracuje dalej.

### Zasady współpracy

**MEM-29.** Preferencję człowieka zapisz w `docs/workflow/zasady-wspolpracy.md` w tej samej turze jako „**reguła** — dlaczego (data albo ruling)”; **NIE WOLNO** trzymać jej tylko w pamięci agenta.
**MEM-30.** Preferencja zmieniająca sposób pracy dostaje też ruling z dosłownym cytatem i trafia do podręcznika.
**MEM-31.** Wpis bez „dlaczego” nie obowiązuje: uzupełnij albo usuń.

### Tablica zadań

**MEM-32.** Tablicę aktualizuj razem z ledgerem: zlecenie → „w toku”, recenzja OK → „zrobione” z PR.
**MEM-33.** Każda nowa praca (poprawka, bramka, przepięcie, follow-up, `S<n>`) dostaje zadanie od razu.
**MEM-34.** „W toku” tylko przy realnej pracy.
**MEM-35.** Zamykając zadanie nadrzędne, zamknij albo przenieś podzadania.
**MEM-36.** Flagę statusu (np. „zweryfikowane”) zdefiniuj rulingiem: „tak” dopiero po bramce.
**MEM-37.** Opcjonalnie: mapę gałęzi na zadania tablicy trzymaj w `.workflow/task-map.json`.
**MEM-38.** Status „zablokowane” wymaga powodu: co je odblokuje (`task.sh <id> blocked "<co>"`).
**MEM-39.** Audyt tablicy (typ `audit`, szablon `.workflow/templates/audits/audyt-tablicy.md`) rób po każdym wznowieniu i co 3 h pracy autonomicznej (domyślnie; rytm rulingiem).
**MEM-40.** W audycie **NIE WOLNO** zmieniać statusu bez dowodu (PR, commit, wpis w ledgerze).
**MEM-41.** Każde zadanie „w toku” ma żywy następny krok (agent, wpis kolejki, przebieg); bez niego wraca do „do zrobienia”.

### Plik wejścia

**MEM-42.** `CLAUDE.md` ma mniej niż 10 KB (domyślnie; własny limit rulingiem) — bo ładuje się do kontekstu każdego agenta przy każdym starcie.
**MEM-43.** `CLAUDE.md` zawiera tylko: polecenia, Global Constraints, Review Focus, role, definicję ukończenia, zasady gita i mapę wiedzy (sytuacja → plik §sekcja).
**MEM-44.** Rozmiar `CLAUDE.md` sprawdzaj przy audycie (`wc -c CLAUDE.md`); po przekroczeniu przenieś szczegóły zgodnie z MEM-43.
**MEM-45.** `AGENTS.md` generuj z `CLAUDE.md` przez `.workflow/bin/sync-agent-rules.sh` (`--check` w bramce); **NIE WOLNO** go edytować ręcznie.

### Zapis historyczny

**MEM-46.** Briefy, raporty, recenzje i diffy w `.workflow/tasks/` to zapis historyczny; **NIE WOLNO** ich poprawiać po fakcie.
**MEM-47.** Gdy repo zmienia właściciela, dodaj README: ścieżki, konta i imiona w tych plikach są historyczne; plików nie przepisuj.
**MEM-48.** Przepisanie historii gita wymaga decyzji człowieka (ORK-59) — bo psuje odwołania do commitów w ledgerze.
**MEM-49.** Dane osobowe i klientów (transkrypcje, nagrania) trzymaj w repo prywatnym albo poza repo.
**MEM-50.** Przed przeniesieniem repo sprawdź ścieżki lokalne, nazwiska, dane osób trzecich i sekrety w historii (`.workflow/bin/check-key-leak.sh --history`).

### Przypominanie reguł

**MEM-51.** Reguły przypomina automat, nie pamięć agenta: hook `SessionStart` (start, wznowienie, kompakcja) wstrzykuje reguły z `.workflow/rules-core.txt` i wynik `tick.mjs`; hook `SubagentStart` — krótkie reguły wykonawcy (`.claude/hooks/workflow-context.mjs`).
**MEM-52.** `.workflow/rules-core.txt` trzyma ≤ 15 pozycji (ID reguł albo własne twarde reguły) — bo każda to stały koszt kontekstu; dopisuj regułę wracającą w recenzjach albo lekcjach.
**MEM-53.** Regułę sprawdzalną po treści polecenia egzekwuj strażnikiem `PreToolUse` (polecenia: `.claude/hooks/guard-bash.mjs`, własne wzorce w `.workflow/guard-extra.txt`; wybudzenia pętli: `.claude/hooks/guard-schedule.mjs`, PRC-23) zamiast przypominania (ZAS-17); blokada podaje ID reguły.
**MEM-54.** Sytuacyjne reguły daje `tick.mjs` (treść reguł tylko dla kroków bieżącego ticku); pojedynczą regułę czytaj `node .workflow/bin/rules.mjs <ID>`.

## Procedura

### Procedura wznowienia

0. Przeczytaj `CLAUDE.md` i `docs/workflow/zasady-wspolpracy.md`.
1. Przeczytaj `docs/workflow/podrecznik-orkiestratora.md`.
2. `tail -80 .workflow/progress.md` — co w toku, ostatni `STAN DO WZNOWIENIA`; `node .workflow/bin/tick.mjs`.
3. Inwentaryzacja:
   ```bash
   for w in .worktrees/*; do echo "== $w"; git -C "$w" log -1 --oneline; git -C "$w" status --short; done
   pgrep -fl '<testy>|<e2e>|<cli wykonawcy>'          # PPID 1 = podejrzana sierota
   ls -t .workflow/tasks/*/ .workflow/runs/ | head -40
   ```
4. Tablica: „w toku” i zmiany.
5. Wznów: krótkie zadanie — wiadomość do agenta; duży kontekst — świeży agent z plikiem ustaleń (ORK-28).
6. Ledger: co przerwało pracę i jak ją wznowiono (`Env:` albo `Awaria:`).
7. Usługi pomocnicze z §0 podręcznika, pętla, monitor logów (`EXIT` w `.workflow/runs/*.log`).
8. Blokada usypiania (`caffeinate -dimsu` na macOS, `systemd-inhibit` na Linuksie).
9. Skill procesu: `.claude/skills/orkiestracja-agentow/SKILL.md`.

### Zapis decyzji

1. `bash .workflow/bin/ruling.sh --next` — podgląd numeru.
2. `bash .workflow/bin/ruling.sh "<co>" "<dlaczego>" "<koszt błędu>" --source "<cytat | korekta R<k>>" [--shared]`.
3. Numer do kodu, komentarza i PR; preferencja człowieka → także `zasady-wspolpracy.md`.

### Przekazanie pasa lub koniec sesji

1. `STAN DO WZNOWIENIA` (MEM-20).
2. Commit i push wszystkich worktree; tablica zgodna z ledgerem.
3. Zespół: `bash .workflow/bin/claim.sh --release <pas>`; nowa osoba `claim.sh <pas>` i procedura wznowienia.

### Audyt tablicy: kroki

1. Porównaj tablicę z gitem (scalone PR, gałęzie, worktree) i z ledgerem.
2. Zmiany tylko z dowodem (MEM-40).
3. Wypisz zadania „w toku” bez następnego kroku (MEM-41), pracę z ledgera bez zadania i pozycje „do decyzji”.
4. Rozmiar `CLAUDE.md` (MEM-44).

## Szablony i narzędzia

`.workflow/progress.md`, `.workflow/skan-przed-startem.md`, `.workflow/bin/ruling.sh`, `.workflow/bin/task.sh`, `.workflow/bin/check-ledger.mjs`, `.workflow/bin/claim.sh`, `docs/workflow/lekcje.md`, `docs/workflow/podrecznik-orkiestratora.md`, `docs/workflow/zasady-wspolpracy.md`, `.workflow/templates/audits/audyt-tablicy.md`.
