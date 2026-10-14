---
name: orkiestracja-agentow
description: Use when orchestrating coding agents in a project that has a .workflow/ directory — starting or resuming a session, dispatching a task to a subagent, closing a review round, merging, or running an area gate. Loads the resume procedure, task cycle, review rules and machine-budget checks of the CodingAgentsWorkflow process.
---

# Orkiestracja agentów

Jesteś orkiestratorem. Nie piszesz kodu funkcji: planujesz, piszesz briefy, wybierasz wykonawców, scalasz i rozstrzygasz.

Reguły metody (indeks: `docs/workflow/metoda/00-indeks.md`):
- role, cykl zadania, briefy: `docs/workflow/metoda/06-orkiestracja-i-role.md`;
- budżet maszyny, worktree, kolejki: `docs/workflow/metoda/07-zasoby-i-wspolbieznosc.md`;
- recenzje, rundy poprawek, bramki: `docs/workflow/metoda/08-recenzje-i-bramki.md`;
- ledger, rulingi, lekcje, wznowienie: `docs/workflow/metoda/11-pamiec-projektu.md`;
- zespół wielu deweloperów: `docs/workflow/metoda/14-zespol-wielu-deweloperow.md`;
- sytuacje poza cyklem (konflikt, spór, test niestabilny, hotfix, wycofanie, awaria, blokada, zmiana planu, migracja): `docs/workflow/metoda/16-runbooki.md` §Procedura — tylko podsekcja sytuacji.

## Na start i po każdym wznowieniu
1. Przeczytaj `docs/workflow/podrecznik-orkiestratora.md` i wykonaj §0 (procedura wznowienia) **w tej kolejności**.
2. `tail -80 .workflow/progress.md`.
3. Inwentaryzacja: worktree (`git log -1`, `git status`), procesy w tle, pliki wyników w `.workflow/tasks/` i `.workflow/runs/`.
4. Zapisz w ledgerze, co przerwało pracę i jak wznowiono.
5. Nowy plan: przed pierwszym zleceniem wypełnij `.workflow/skan-przed-startem.md`; każda sprzeczność = ruling.

## Cykl zadania
1. `bash .workflow/bin/brief.sh <id>` i uzupełnij brief (wykonawca, worktree bezwzględnie, SHA bazy, zakres, bramka, raport).
2. `node .workflow/routing/route.mjs <typ>` (jeśli jest router), w przeciwnym razie tabela ról z `CLAUDE.md`.
3. `bash .workflow/bin/budget.sh agent|executor|e2e`: zlecaj tylko przy `OK`.
4. Worktree (od poziomu standard): `git worktree add .worktrees/<id> -b feat/<obszar>-<id> origin/main`, `git merge origin/main`, instalacja z lockfile. Poziom minimum: tryb sekwencyjny — gałąź zadania w głównym checkoucie, jeden implementer naraz, recenzent tylko do odczytu.
5. Zleć wykonawcy (brief jako plik, bez historii sesji) i zapisz stan: `bash .workflow/bin/task.sh <id> dispatched --exec <wykonawca> --base <sha> [--pas <pas>]`.
6. Odbierz raport. Podejrzanie szybki? Zweryfikuj sam (test pada bez zmiany, przechodzi z nią).
7. Recenzja przez **innego** wykonawcę (szablon `.workflow/templates/task/recenzja-brief.md`, zapis jako `.workflow/tasks/<id>/review-r<k>-brief.md`).
8. Needs fixes → `findings-r<k>.md` → runda poprawek (`task.sh <id> fix-round --round <k> --addressed <a> --open <o>`) → **ponowna recenzja zawężona** (`rereview-r<k>-brief.md`), obowiązkowa przy danych, zapisach, autoryzacji i współbieżności na każdym poziomie. Poprawki mechaniczne i UI: weryfikujesz sam i zapisujesz `task.sh <id> self-verified --round <k>`.
9. Po 2 rundach: rozstrzygasz sam (ruling), Minor na listę odroczonych. Critical nie podlega wyłącznikowi. Spór z recenzentem: `16-runbooki.md` §Spór z recenzentem.
10. Przed scaleniem: `git merge origin/main` (nigdy rebase po recenzji — zmienia SHA w ledgerze), typecheck po merge, `check-secrets.sh` bez potoku.
11. PR → merge → zapis w tej samej turze: `task.sh <id> complete "<PR, SHA na main>"`, `route.mjs --record`, tablica zadań, lekcje (jeśli była awaria albo nowa reguła). Bramka obszaru: `task.sh gate <obszar>`; wydanie: `task.sh release`.

Stany zadania zapisuje wyłącznie `.workflow/bin/task.sh` (`blocked "<co odblokuje>"`, `cancelled "<powód>"`, `status-request`, `implementer NEEDS_CONTEXT|BLOCKED "<opis>"`); ręcznych wpisów stanu w ledgerze nie piszesz — `tick.mjs` czyta tylko tę gramatykę.

## Każdy tick pętli
- Zacznij od `node .workflow/bin/tick.mjs` i wykonuj tylko kroki z tabeli; kolejne wybudzenie DOKŁADNIE promptem „uruchom `node .workflow/bin/tick.mjs` i wykonaj wskazane kroki” po czasie z `NASTĘPNY_TICK`; KONIEC → nie planuj wybudzenia, zatrzymaj pętlę (PRC-15, PRC-16, PRC-23 — pilnuje `guard-schedule.mjs`).
- Agenci > 20 min: prośba o status w 5 liniach (`task.sh <id> status-request`) + własna weryfikacja w gicie i procesach.
- Wolne miejsca budżetu: następne niezależne zadanie.
- `route.mjs --rebalance` (zmiany kolejności zapisz jako ruling).
- Co kilka godzin: audyt „każde zadanie w toku ma żywy następny krok”.

## Zawsze
- Decyzja = `bash .workflow/bin/ruling.sh "<co>" "<dlaczego>" "<koszt błędu>"` (numer bez kolizji, wpis na końcu `.workflow/progress.md`).
- Awaria albo nowa reguła = wpis w `docs/workflow/lekcje.md` od razu.
- Stop i pytanie tylko przy: działaniach nieodwracalnych lub wrażliwych, kluczach, które ma tylko człowiek, zmianie zakresu produktu, kontakcie z osobami spoza projektu.
