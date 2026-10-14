# Ledger — plan: <ścieżka planu>

Repo kodu: <ścieżka / zdalne repo>. Repo procesu: <to samo albo inne>.
Numeracja: decyzje `R<n>` (jedna osoba) albo `R-<AUTOR>-<n>` (zespół; seria per deweloper), zadania wspólne `S<n>` / `S-<AUTOR>-<n>`, ustalenia bezpieczeństwa `SEC-<n>` / `SEC-<AUTOR>-<n>` — wszystkie nadaje `.workflow/bin/ruling.sh` (`--kind S|SEC`); duplikaty wykrywa `.workflow/bin/check-ledger.mjs`.
Format decyzji: **Ruling R<n>: co — dlaczego — koszt błędu.** Korekta to nowy ruling, który cytuje stary („R<k> (korekta R<j> pkt 2)”). Słowa człowieka cytuj dosłownie.
Wznowienie: `tail -80` tego pliku, potem `docs/workflow/podrecznik-orkiestratora.md` §0.

<!--
Gramatyka wpisów w sekcji Postęp (wpisy Task/Gate/Release dopisuje .workflow/bin/task.sh; „by <AUTOR> @ <data>” obowiązkowe w zespole):
Task <id>: dispatched (BASE <sha>) — <wykonawca z routera>
Task <id>: dispatched (BASE <sha>) — <wykonawca> by <AUTOR> pas <pas> @ RRRR-MM-DD GG:MM
Task <id>: blocked (<co odblokuje>) by <AUTOR> @ RRRR-MM-DD GG:MM
Task <id>: cancelled (<powód>) by <AUTOR> @ RRRR-MM-DD GG:MM
Task <id>: self-verified r<k> [(<opis>)] by <AUTOR> @ RRRR-MM-DD GG:MM
Task <id>: status-request [(<opis>)] by <AUTOR> @ RRRR-MM-DD GG:MM
Task <id>: implementer DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT (<sha>) [(<wątpliwości>)]
Task <id>: review <k> → Approved | Needs fixes (<n> Important: …); fix round <k> wysłany (FIX_BASE <sha>)
Task <id>: fix round <k>/2 (<a> addressed, <o> open — <co>; commits <a>..<b>)
Task <id>: complete (commits <base>..<head>, review clean) — PR #<n> → main <sha>; worktree usunięty
Gate <obszar>: done [(<opis>)] by <AUTOR> @ RRRR-MM-DD GG:MM
Release: done [(<opis>)] by <AUTOR> @ RRRR-MM-DD GG:MM
Task <id>: minor (deferred → <cel>): <ustalenie>
Shared-fix backlog S<n>: <potrzeby zebrane z pasów>
Env: <zdarzenie maszyny / środowiska + jak je cofnąć>
Lekcja: … (→ docs/workflow/lekcje.md) / Awaria: …
STAN DO WZNOWIENIA (<godzina>): <co w toku, worktree, procesy w tle>
-->

## Skan przed startem

Tabela skanu: `.workflow/skan-przed-startem.md` — edytowana w miejscu, więc poza ledgerem z merge=union; każda sprzeczność z niej → ruling poniżej.

## Rulingi

<!-- Dopisuj przez: .workflow/bin/ruling.sh "<co>" "<dlaczego>" "<koszt błędu>" [--shared]; S/SEC: ruling.sh --kind S|SEC "<opis>" (numeracja bez kolizji, także w zespole) -->

## Postęp

