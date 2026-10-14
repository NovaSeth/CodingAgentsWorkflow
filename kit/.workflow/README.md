# .workflow: warsztat orkiestratora

Zapis procesu budowy projektu przez agentów: decyzje, briefy, raporty, recenzje, router wykonawców i skrypty. Metoda: `docs/workflow/metoda/00-indeks.md`.

```
.workflow/
  progress.md            ledger: decyzje R<n>, S<n>, SEC-<n> i stany zadań (dopisywany na końcu, merge=union)
  skan-przed-startem.md  skan planu przed pierwszym zleceniem (edytowany w miejscu, poza ledgerem)
  kit-files.json         rejestr plików frameworka z sumami (setup.mjs --update; nie edytuj)
  budget.mode            „normalny” albo „wysoki” (poza gitem; wysoki = człowiek nie pracuje na maszynie)
  budget.env             opcjonalne progi budżetu maszyny (KEY=VALUE); pierwszeństwo: zmienne środowiska > budget.local.env > budget.env
  secrets-patterns.txt   wzorce sekretów projektu dla check-secrets.sh (należy do projektu)
  rules-core.txt         reguły „zawsze” wstrzykiwane po starcie i kompakcji (należy do projektu, ≤ 15 pozycji)
  guard-extra.txt        własne blokady poleceń dla strażnika .claude/hooks/guard-bash.mjs (należy do projektu)
  task-map.json          opcjonalna mapa gałęzi na zadania tablicy
  briefs/                briefy wspólne (wiążące reguły dla rodzaju zadań)
  tasks/<id>/            łańcuch plików zadania: brief.md → report.md → review-r<k>-brief.md → review-r<k>.md → findings-r<k>.md
                         → rereview-r<k>-brief.md → rereview-r<k>.md (+ *.diff); runda poprawek = „## Runda poprawek <k>” w report.md
  templates/             szablony dokumentów (spec, plan, zadanie, bramka, bezpieczeństwo, DS, discovery, kod, audyty)
  routing/               router wykonawców: route.mjs, routing.json, scorecard.jsonl, limits.json, routing-changes.md
  bin/
    brief.sh             wycina „### Zadanie <id>” z planu do tasks/<id>/brief.md
    heavy.sh             kolejka ciężkich poleceń (sloty, nice, limit wątków)
    budget.sh            budżet maszyny przed każdym zleceniem: agent | executor | e2e
    check-secrets.sh     skan sekretów: indeks + drzewo (domyślnie), --staged, --range <rewizje> (0 czysto / 1 trafienia / 2 błąd)
    check-key-leak.sh    skan prawdziwych wartości z .env w repo, historii i artefaktach
    sync-agent-rules.sh  AGENTS.md generowany z CLAUDE.md (--check do bramki)
    run-other.sh         szablon uruchomienia wykonawcy innego dostawcy w piaskownicy
    ruling.sh            nowa decyzja w ledgerze z numerem bez kolizji (R<n> / R-<AUTOR>-<n>; --kind S|SEC, --shared)
    task.sh              stany zadań w ledgerze: dispatched, blocked, cancelled, fix-round, self-verified, status-request, complete; gate, release
    check-ledger.mjs     duplikaty ID rulingów, S, SEC i inicjałów (kod 1; krok CI)
    claim.sh             zajęcie pasa w zespole na CLAIM_DAYS dni (--renew, --release, --list)
    rules.mjs            treść reguł metody po ID; --core: reguły „zawsze” z rules-core.txt
    tick.mjs             tick pętli: stan zadań i przebiegów → następne kroki, NASTĘPNY_TICK, KONIEC
    dev-setup.sh         konfiguracja dewelopera na jego maszynie (hooki, autor decyzji, progi budżetu)
  runs/                  logi przebiegów w tle (poza gitem, ale NIE w /tmp — restart czyści /tmp)
```

## Szybki start

```bash
bash .workflow/bin/budget.sh agent                       # czy można zlecać
bash .workflow/bin/brief.sh F1.3                         # brief z planu
bash .workflow/bin/task.sh F1.3 dispatched --exec claude:implementer --base "$(git rev-parse origin/main)"
node .workflow/routing/route.mjs implement-lane          # kto ma to zrobić
bash .workflow/bin/heavy.sh npm test                     # testy przez kolejkę
bash .workflow/bin/check-secrets.sh; echo "kod $?"       # bramka sekretów (bez potoku!)
node .workflow/routing/route.mjs --record implement-lane claude:implementer 1 0 F1.3 "" 2
bash .workflow/bin/task.sh F1.3 complete "PR #12, main abc1234"
node .workflow/bin/check-ledger.mjs; echo "kod $?"         # duplikaty ID w ledgerze
tail -80 .workflow/progress.md                           # stan przy wznowieniu
```

## Zasady
- Pliki w `tasks/` to zapis historyczny: nie poprawia się ich po fakcie.
- Ścieżki w briefach zawsze bezwzględne. Recenzje zawsze tylko do odczytu.
- Każda decyzja ma numer R<n> w `progress.md` (nadaje `ruling.sh`). Numer pojawia się w kodzie, komentarzach i PR.
- Stany zadań zapisuje tylko `task.sh` — `tick.mjs` czyta wyłącznie tę gramatykę.
- Przed pierwszym zleceniem planu wypełnij `skan-przed-startem.md`; każda sprzeczność = ruling.
- Plików frameworka nie zmieniaj lokalnie: `setup.mjs --update` zapisze nową wersję obok jako `<plik>.kit-new`. Przywrócenie: usuń plik i uruchom `setup.mjs --update`.
