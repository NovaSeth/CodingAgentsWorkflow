# Changelog — CodingAgentsWorkflow

Projekty aktualizują framework przez `node scripts/setup.mjs --update --path <projekt>` (`docs/13-wdrozenie-w-projekcie.md` §F. Aktualizacja frameworka). Pliki projektu (manifest: `userOwned`) nie są nadpisywane.

## 1.5.1 · 2026-10-13
Walidacja przed wydaniem publicznym (przegląd własny i niezależny przegląd drugiego dostawcy) i poprawki.

**Bezpieczeństwo i strażniki**
- `guard-bash.mjs`: `git push` bez refspec albo z `HEAD`/`@` liczy bieżącą gałąź (`git push -f` na `main` blokowany; w zespole także zwykły `git push` z `main`); `--all`/`--branches`; aliasy gita (`-c alias.X=…` i z konfiguracji repo, także `!…`); `-c` doklejone (`-ccore.hooksPath=…`); `git config set|unset core.hooksPath`; `find -exec`; nazwa polecenia ze zmiennej (`g=git; "$g" push …`; `'$g'` w apostrofach to literał); `cd` w łańcuchu przenosi analizę do nowego katalogu (cd w powłoce potomnej nie przenosi rodzica); po `git switch`, `git checkout <gałąź>`, `git rebase <baza> <gałąź>`, aliasie powłokowym, `cd` o nieznanym celu albo w podpowłoce push bez refspec jest traktowany jak push z `main` — wymagany jawny refspec; alias powłokowy w repo z `-C`; bez fałszywego alarmu dla `sh -c 'echo "check-secrets.sh"' | cat`.
- `guard-schedule.mjs`: prompt wybudzenia musi być stałym poleceniem ticku (opcjonalnie `--plan <plik>`); dopisek stanu jest blokowany (PRC-15).
- `check-secrets.sh`: hasła ze znakami specjalnymi w cudzysłowie (także `.`, a `:` razem ze znakiem hasła), YAML bez cudzysłowu (także z komentarzem `#`); lockfile'i są skanowane (token rejestru w lockfile to realny wyciek).
- `check-key-leak.sh`: błąd narzędzia (git, grep, tr — także przy budowie listy plików i rozpoznawaniu nazw zmiennych) = kod 2, nigdy „czysto”; ostatnia linia `.env` bez `\n`, CRLF, `export `, spacje na końcu; opcje bez wartości → 2.
- CI kitu: skan sekretów na commitach PR (`--range origin/<baza>..HEAD`); krok `AGENTS.md` tylko, gdy jest `sync-agent-rules.sh`.

**Zespół i zasoby**
- `claim.sh --release`: usuwa tylko sprawdzone zajęcie (`--force-with-lease`) — nowe zajęcie innej osoby zostaje.
- `heavy.sh`: slot trzyma także uruchomione polecenie — po zabiciu samego skryptu slot nie jest przejmowany, dopóki polecenie działa.
- `budget.sh`: brak pomiaru pamięci nie wywraca skryptu (`set -u`); progi nie-liczbowe → 64; ostrzeżenie przy `FREE_MIN=0` (RES-7).
- `task.sh`, `ruling.sh`: argument z nową linią odrzucany (sfałszowany drugi wpis ledgera); `task.sh <id> implementer <STATUS>` (ORK-24).
- `dev-setup.sh`: inny menedżer hooków (`core.hooksPath`, aktywne `.git/hooks`) zostaje z ostrzeżeniem; `--force-hooks` przełącza; kreator pokazuje ostrzeżenia.

**Pętla i metoda**
- `tick.mjs`: kroki wskazują polecenia `task.sh` (zamiast ręcznych wpisów); `budget.sh` i `route.mjs --record` tylko, gdy są zainstalowane; nie scalony `CLAUDE.workflow.md` → AKCJA WDR-16.
- `workflow-context.mjs`: recenzent, `security` i `qa` dostają przypomnienie tylko do odczytu (bez TDD i commitów).
- Metoda: PRC-4, KOD-76, REV-31 zależne od poziomu; runbooki hotfixu i odblokowania z `--pas` w zespole; wycofanie znajduje commit squash; raport discovery — skrypt `gen_dodatek.py` jako zadanie projektu.
- Kreator: `--no-lockfile` (bez `npm install --package-lock-only`); bez porady `git stash`; pliki systemowe z lokalnego klonu (`.DS_Store`, `*.swp`) nie trafiają do projektu.
- Licencja MIT; README: pierwsze zadanie na poziomie minimum; CI repo: Node 18 i 24.

## 1.5.0 · 2026-10-13
- Strażnik pętli `.claude/hooks/guard-schedule.mjs` (PreToolUse: ScheduleWakeup, CronCreate): blokuje prompt wybudzenia bez `tick.mjs` (prompt opisujący stan przeterminowuje się — PRC-15) i każde wybudzenie, gdy tick zwraca KONIEC (PRC-16); zatrzymanie pętli przechodzi zawsze. Nowa reguła PRC-23; dokładny prompt wybudzenia w podręczniku i skillu.

## 1.4.0 · 2026-10-13
Przegląd (błędy w kodzie, symulacja zespołu dwóch deweloperów, spójność metody) i poprawki.

**Bezpieczeństwo**
- Hook `pre-push` skanuje WYPYCHANE commity (`check-secrets.sh --range`), nie drzewo robocze; tryby `--range`, `--staged`; wynik tylko `plik:linia` (bez treści); `.env` w każdym katalogu; wzorce camelCase / YAML / JSON; `SYNTH` tylko w treści linii.
- Strażnik `guard-bash.mjs` przepisany na tokenizer powłoki: łapie `git -C … stash`, cytowane słowa, `bash -lc`, `eval`, push dowolnym refspec na `main`, `+main`, `commit -n`, `core.hooksPath`; bez fałszywych alarmów w treści commitów i heredoców; zwykły push `main` blokowany tylko w zespole.
- `run-other.sh` bez wstrzyknięcia przez placeholdery.

**Zespół**
- `ruling.sh`: licznik wspólny dla worktree (koniec duplikatów numerów), `--kind S|SEC`, `--shared`.
- `task.sh` (nowy): stany zadań w ledgerze (`dispatched … by <AUTOR> pas <pas>`, `blocked`, `cancelled`, `self-verified`, `status-request`, `fix-round`, `complete`, `gate`, `release`).
- `check-ledger.mjs` (nowy, w CI): duplikaty ID rulingów i inicjałów.
- `claim.sh`: kody 0/1/2 (już twój / cudzy / błąd), data ważności, `--renew`, wymaga `workflow.author`.
- `tick.mjs`: zadania swoje vs „Inni”, sygnały z ledgera i raportów zamiast mtime, ścisłe werdykty, START w świeżym projekcie, KONIEC dopiero po bramce, BLOCKED/NEEDS_CONTEXT, Critical bez wyłącznika.
- Skan przed startem w osobnym pliku (`.workflow/skan-przed-startem.md`).

**Kreator i aktualizacje**
- `--update`: odmowa przy brudnym drzewie, `.workflow/kit-files.json`, lokalne zmiany zachowane (`<plik>.kit-new`), przestarzałe pliki zgłaszane.
- CI zielone od pierwszego pushu (lockfile, ESLint ignoruje `.claude`), job zbiorczy `bramki / wynik`; CODEOWNERS dla hooków, reguł i metody.
- Cecha `backend`; szablony DS/discovery tylko z cechami; inicjały poza `config.json` (transliteracja PL); odporne scalanie `settings.json`; `npx github:NovaSeth/CodingAgentsWorkflow`.
- `heavy.sh` wspólny dla worktree; `budget.sh` fail closed, zmienne środowiska mają pierwszeństwo; `route.mjs` waliduje daty, kod 3 gdy wszyscy zablokowani; router: implementacja bez drugiego dostawcy (ORK-8).

**Metoda**
- Rozstrzygnięte sprzeczności (zapisy procesu, model gałęzi, merge zamiast rebase, ponowna recenzja na każdym poziomie, worktree od standard / tryb sekwencyjny, części wspólne przez `S<n>`).
- Nowy rozdział `16-runbooki.md`: konflikt merge, spór z recenzentem, test niestabilny, hotfix, wycofanie, awaria produkcyjna, blokada zewnętrzna, zmiana planu, migracja bazy, kod bez testów, regresja wydajności.
- Duplikaty reguł zamienione na odesłania; tabele „poziom → reguły obowiązkowe” i skale wag; dokumenty w limitach rozmiaru; odwołania § dokładne (test).

## 1.3.0 · 2026-10-13
- Przypominanie reguł automatem (MEM-51–54): hooki Claude Code dołączane do `.claude/settings.json` (scalanie, istniejące ustawienia zostają):
  - `SessionStart` (start, wznowienie, kompakcja) → reguły „zawsze” z `.workflow/rules-core.txt` + wynik `tick.mjs` + polecenie procedury wznowienia;
  - `SubagentStart` → krótkie reguły wykonawcy;
  - `PreToolUse: Bash` → strażnik `guard-bash.mjs` blokuje `git stash`, potok za `check-secrets.sh`, push `HEAD:main`, wymuszony push na `main`, `--no-verify` (+ wzorce projektu z `.workflow/guard-extra.txt`).
- `rules.mjs`: treść reguły po ID, `--core`. `tick.mjs`: pod tabelą treść reguł tylko dla kroków bieżącego ticku; etykiety zamienione na konkretne ID.
- Nowe reguły: BZP-46 (`--no-verify`), PUL-48 (wymuszony push na `main`).

## 1.2.0 · 2026-10-13
- `.workflow/bin/tick.mjs` (od minimum): tick pętli orkiestratora wylicza ze stanu (ledger, `.workflow/tasks/`, `.workflow/runs/`, plan) tabelę „zadanie → stan → następny krok → reguła”, odstęp do kolejnego ticku i KONIEC; `--ack`, `--audit-done`, `--json`.
- PRC-10, PRC-15–17: stały prompt wybudzenia („uruchom tick.mjs i wykonaj kroki”), odstęp z `NASTĘPNY_TICK`, zatrzymanie pętli przy KONIEC; ORK-5 i podręcznik ujednolicone (koniec rozbieżnych interwałów).

## 1.1.0 · 2026-10-13
- Bezpieczeństwo od poziomu minimum: agent `security`, przewodnik i szablony bezpieczeństwa instalowane zawsze.
- Wzorce sekretów projektu w `.workflow/secrets-patterns.txt` (plik projektu); `check-secrets.sh` należy do frameworka. **Migracja:** wzorce dopisane wcześniej ręcznie do `check-secrets.sh` przenieś do `.workflow/secrets-patterns.txt` przed `--update`.
- KOD-27/KOD-28: odcisk idempotencji ze ścieżki znormalizowanej; odpowiedzi 5xx nie są zapisywane.
- Przewodnik bezpieczeństwa: log 500 bez komunikatu wyjątku.
- Szablony raportu, recenzji i ponownej recenzji: sekcja „Kontekst” (przeczytane pliki i zakresy).
- `brief.sh`: stopka zależna od poziomu, pola „Reguły (ID)” i „Do przeczytania”.
- `CLAUDE.md` i podręcznik: linie warunkowe (`<!--if:…-->`) — brak odwołań do narzędzi nieinstalowanych na danym poziomie; podręcznik i zasady współpracy od poziomu minimum.
- REV-33: scalanie bez zdalnego repo (`merge --no-ff` + ruling).
- Agent `security`: audyt zależności może odpytać rejestr pakietów.
- CI frameworka (`.github/workflows/testy.yml`).

## 1.0.0 · 2026-10-13
- Metoda 00–15 (reguły z ID, mapa sekcji, odwołania „plik §sekcja”), kreator `setup.mjs` (nowy / istniejący projekt, `--answers`, `--dry-run`, `--update`), praca zespołowa (`ruling.sh`, `claim.sh`, `dev-setup.sh`, CODEOWNERS, CI, `merge=union`), profile TypeScript i Python, router wykonawców, skrypty budżetu i bezpieczeństwa.
