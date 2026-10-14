# 14. Zespół wielu deweloperów

**Cel:** prowadzić projekt kilkoma ludźmi orkiestrującymi agentów w swoich pasach, bez kolizji pasów, numerów decyzji i części wspólnych. **Czyta:** PO, deweloperzy (orkiestratorzy pasów), właściciele części wspólnych, właściciel bezpieczeństwa. **Kiedy:** więcej niż jeden deweloper, nowa osoba, pas zmienia właściciela.

**Mapa sekcji**
- §Role ludzi — kto za co odpowiada.
- §Model pracy — deweloper = orkiestrator swoich pasów; tryb zespołowy.
- §Zajmowanie pasów — `claim.sh`: termin, lista, zwolnienie, kody wyjścia.
- §Decyzje i pliki dopisywane — `ruling.sh`, `--shared`, `merge=union`.
- §Części wspólne — CODEOWNERS, zadania `S<n>`, nota o wpływie.
- §CI i ochrona gałęzi — joby `bramki`, ochrona `main`, gałąź `process/<AUTOR>`.
- §Onboarding dewelopera — `dev-setup.sh`, inicjały, progi maszyny.
- §Przekazanie pasa — stan do wznowienia, zwolnienie, przejęcie.
- §Rytm, §Skalowanie — synchronizacje; solo / 2–5 / 6+.
- §Zadania, kontrola ledgera, scalanie — ID zadań, `task.sh`, `--renew`, `check-ledger.mjs`, Merge.
- §Procedura — nowy deweloper; zajęcie i przekazanie pasa; zmiana części wspólnej.
- §Szablony i narzędzia, §Checklista.

## Reguły

### Role ludzi

| Rola | Odpowiada za |
|---|---|
| PO | zakres, priorytety, odbiór bramek obszarów, spory o pasy |
| Właściciele części wspólnych | kontrakt, tokeny, UI, rdzeń platformy, CI, skrypty procesu; akceptują `S<n>` (CODEOWNERS) |
| Orkiestratorzy pasów | każdy deweloper: agenci, briefy, recenzje, PR i decyzje w swoich pasach |
| Właściciel bezpieczeństwa | przewodnik, audyt, bramki wydania |

**ZES-1.** Przypisz każdą rolę konkretnym osobom w `docs/workflow/zespol.md` §Role ludzi; każda część wspólna i każdy pas ma właściciela.

**ZES-2.** Jedna osoba może łączyć role; autor PR nie akceptuje własnego PR — akceptuje inna osoba, przy części wspólnej jej właściciel.

### Model pracy

**ZES-3.** Każdy deweloper jest orkiestratorem swoich pasów (`06-orkiestracja-i-role.md` §Orkiestrator — obowiązki i zakazy).

**ZES-4.** **NIE WOLNO** zlecać agentom pracy w pasie zajętym przez inną osobę.

**ZES-5.** Przypisania (osoby, pasy, katalogi, rytm) trzymaj w `docs/workflow/zespol.md`; zmiany przez PR.

**ZES-6.** Tryb zespołowy włącza `"multiDev": true` w .workflow/config.json (kreator dla zespołu 2–5 i 6+); bez niego `ruling.sh` numeruje `R<n>` i serie kolidują.

### Zajmowanie pasów

**ZES-7.** Jeden pas = jeden orkiestrator naraz.

**ZES-8.** Zajmij pas `bash .workflow/bin/claim.sh <pas> [opis]` przed pierwszym zleceniem w nim; nazwa: małe litery, cyfry, `.`, `_`, `-`; wymaga `git config workflow.author`.

**ZES-9.** Zajęcie to gałąź `claim/<pas>` na zdalnym repo (`WORKFLOW_REMOTE`, domyślnie `origin`) z pustym commitem „claim <pas> by <AUTOR> <data> do <RRRR-MM-DD>”; serwer odrzuca drugi push, więc zajęcie jest atomowe.

**ZES-10.** Kod 1 przy zajęciu: pas ma inną osobę — uzgodnij z nią; **NIE WOLNO** obchodzić mechanizmu.

**ZES-11.** Sprawdzaj `claim.sh --list` przed zajęciem i na synchronizacji dziennej; `WYGASŁO` oznacza rozmowę z właścicielem, nie wolny pas.

**ZES-12.** Zwolnij swój pas `claim.sh --release <pas>` przy przekazaniu i po zakończeniu pracy.

**ZES-13.** Cudzy albo wygasły pas zwalniaj `claim.sh --release <pas> --force` wyłącznie po uzgodnieniu z właścicielem (gdy nieosiągalny — z PO) i zapisz rulingiem; wygasłe zajęcie nie przechodzi samo.

**ZES-14.** Ochrona gałęzi **NIE MOŻE** obejmować wzorca `claim/*`; gałęzi `claim/*` nie scalaj i nie otwieraj z nich PR.

| Polecenie | Kod 0 | Kod 1 | Kod 2 |
|---|---|---|---|
| `claim.sh <pas> [opis]` | zajęto na `CLAIM_DAYS` dni (domyślnie 7) albo już Twój | pas cudzy (komunikat: kogo) | błąd remote / sieci / hooka, brak autora, zła nazwa |
| `claim.sh --renew <pas>` | przedłużono o `CLAIM_DAYS` | pas cudzy | jw. |
| `claim.sh --release <pas> [--force]` | zwolniono albo pas wolny | cudzy bez `--force` | jw. |
| `claim.sh --list` | `pas → claim … by … do …`; przeterminowane `WYGASŁO` | — | brak dostępu do remote |

### Decyzje i pliki dopisywane

**ZES-15.** Numery decyzji nadaje wyłącznie `ruling.sh "<co>" "<dlaczego>" "<koszt błędu>"`: w zespole `R-<AUTOR>-<n>`, `--kind S` → `S-<AUTOR>-<n>`, `--kind SEC` → `SEC-<AUTOR>-<n>`, `--next` — podgląd; licznik wspólny dla wszystkich worktree, wpis na końcu ledgera; **NIE WOLNO** numerować ręcznie.

**ZES-16.** AUTOR to `git config workflow.author` z `dev-setup.sh` (nie `config.json`); bez niego w zespole `ruling.sh`, `claim.sh` i `task.sh` kończą się kodem 2.

**ZES-17.** Decyzję dotyczącą innych pasów lub części wspólnych zapisz z `--shared` (znacznik **[wspólne]**) i omów na najbliższej synchronizacji dziennej.

**ZES-18.** Pliki tylko dopisywane mają `merge=union` w `.gitattributes` (lista poniżej); dopisuj wyłącznie na końcu, **NIE WOLNO** edytować ani usuwać istniejących linii — bo union zostawia obie wersje edytowanej linii.

**ZES-19.** Lekcje dopisuj do `docs/workflow/lekcje.md` od razu po awarii lub pomyłce, z inicjałami.

```
.workflow/progress.md merge=union
.workflow/developers.txt merge=union
.workflow/routing/scorecard.jsonl merge=union
.workflow/routing/routing-changes.md merge=union
docs/workflow/lekcje.md merge=union
```

### Części wspólne

**ZES-20.** Wymień części wspólne z właścicielami w `.github/CODEOWNERS`; kreator wpisuje `CLAUDE.md`, `AGENTS.md`, `.claude/`, `.githooks/`, `.gitattributes`, `.workflow/bin/`, `config.json`, `rules-core.txt`, `guard-extra.txt`, `secrets-patterns.txt`, `routing.json`, `.github/`, `docs/security/`, `docs/workflow/metoda/` i części wspólne stosu (kontrakt, tokeny, UI, manifest, lockfile).

**ZES-21.** Części wspólne zmienia wyłącznie zadanie wspólne `S<n>`: zleca orkiestrator, wykonuje designer (albo implementer przy zmianie mechanicznej), w zespole akceptuje właściciel z CODEOWNERS; pas zgłasza brak w raporcie, nie robi kopii ani obejścia.

**ZES-22.** Przed scaleniem `S<n>` autor scala próbnie każdy pas (`git merge --no-commit`, `--abort`) i spisuje notę o wpływie (`.workflow/templates/task/wplyw-na-pasy.md`).

**ZES-23.** Po scaleniu `S<n>` autor rozsyła notę o wpływie; każdy orkiestrator pasa robi `git merge origin/main` i przepięcie osobnym commitem `refactor(<obszar>): przepięcie po S<n>`.

**ZES-24.** Przy każdej kontroli statusu agenta sprawdzaj pliki wspólne w diffie (`12-pulapki-narzedziowe.md` §Agenci i raporty — PUL-35).

### CI i ochrona gałęzi

**ZES-25.** Utrzymuj `.github/workflows/bramki.yml` (każdy PR i push do `main`, `contents: read`): `bramki / proces` (`check-secrets.sh` bez potoku, `check-ledger.mjs`, `AGENTS.md`), `bramki / jakosc` (`npm ci` przy lockfile, typecheck, lint, testy), `bramki / wynik` (zbiorczy).

**ZES-26.** Przypinaj akcje CI do pełnego SHA z komentarzem wersji.

**ZES-27.** Chroń `main`: wymagany tylko check `bramki / wynik` (nowy job nie zmienia ochrony), akceptacja Code Owners, co najmniej 1 akceptacja człowieka, brak bezpośredniego pushu (strażnik blokuje `git push origin main` w zespole).

**ZES-28.** Zapisy procesu (ledger, briefy, raporty, recenzje, lekcje) orkiestrator commituje w głównym checkoucie na gałęzi `process/<AUTOR>` i otwiera z niej PR co najmniej raz dziennie i przed przekazaniem pasa; kod tylko przez gałąź zadania i PR.

**ZES-29.** Wypełniaj `.github/pull_request_template.md` (zadanie, decyzje, RED → GREEN, recenzja, przegląd bezpieczeństwa, `S<n>`).

**ZES-30.** Bez CI na platformie repo uruchom te same bramki lokalnie i wklej wynik (liczby, kody wyjścia) do PR.

### Onboarding dewelopera

**ZES-31.** Po sklonowaniu uruchom `bash .workflow/bin/dev-setup.sh [--author XY]` przed zajęciem pasa; idempotentny: hooki, `branch.autoSetupMerge simple`, `workflow.author`, wpis w rejestrze deweloperów, progi maszyny.

**ZES-32.** Inicjały: 2–4 litery i opcjonalna cyfra, unikalne w .workflow/developers.txt; przy kolizji (kod 1) wybierz inne (`--author XY2`), a dopis do rejestru zacommituj (gałąź + PR).

**ZES-33.** Budżet maszyny jest per maszyna: .workflow/budget.local.env (poza gitem, z `dev-setup.sh`) nadpisuje wspólne progi; skalibruj go (`07-zasoby-i-wspolbieznosc.md` §Budżet maszyny — progi i skrypt).

**ZES-34.** Przed pierwszym zleceniem przeczytaj `CLAUDE.md`, `docs/workflow/zespol.md` i `docs/workflow/podrecznik-orkiestratora.md`.

### Przekazanie pasa

**ZES-35.** Oddając pas, dopisz do ledgera „STAN DO WZNOWIENIA” (co w toku, worktree, gałęzie, procesy w tle, otwarte ustalenia), wypchnij gałęzie i PR `process/<AUTOR>`, zatrzymaj procesy w tle, zwolnij pas.

**ZES-36.** Przejmujący zajmuje pas i wykonuje `docs/workflow/podrecznik-orkiestratora.md` §0 — procedura wznowienia.

**ZES-37.** Po przekazaniu zmień orkiestratora pasa w tabeli pasów `docs/workflow/zespol.md`.

### Rytm

| Kiedy | Co | Kto |
|---|---|---|
| codziennie, domyślnie 10 min | decyzje [wspólne], `claim.sh --list`, blokady, potrzebne `S<n>`, PR `process/<AUTOR>` | orkiestratorzy pasów, właściciele części wspólnych |
| po bramce obszaru | raport dla PO | orkiestrator pasa |
| co tydzień | przegląd lekcji (awans do briefu wspólnego, `CLAUDE.md`, testu), triaż Minor | wszyscy |
| przed wydaniem | audyt, bramki wydania | właściciel bezpieczeństwa |

**ZES-38.** Prowadź synchronizacje według tabeli; długość i częstotliwość to wartości domyślne — własne zapisz rulingiem.

**ZES-39.** Przed wydaniem właściciel bezpieczeństwa zleca audyt i prowadzi bramki (`09-bezpieczenstwo.md` §Audyt — zakres i model; §Bramki wydania — warunki).

### Skalowanie

| | Solo | Zespół 2–5 | Duży 6+ |
|---|---|---|---|
| Kreator (`team`) | `solo` | `zespol` | `duzy` |
| Decyzje | `R<n>` | `R-<AUTOR>-<n>` | `R-<AUTOR>-<n>` |
| Pasy | jeden orkiestrator | `claim.sh` | rozłączne zestawy pasów per zespół |
| Zapisy procesu | commit na `main` (ZAS-2) | `process/<AUTOR>` + PR | `process/<AUTOR>` + PR |
| Akceptacja `S<n>` | — | osoby w CODEOWNERS | zespół platformowy w CODEOWNERS |
| CI i ochrona `main` | zalecane | wymagane | wymagane |
| Synchronizacja | ledger | dzienna | dzienna + tygodniowa z zespołem platformowym |

**ZES-40.** Wybierz skalę według liczby deweloperów; zmianę skali zapisz rulingiem i włącz brakujące elementy (tryb zespołowy, CODEOWNERS, CI, ochrona `main`).

**ZES-41.** W skali 6+ przypisz każdy pas dokładnie jednemu zespołowi w `docs/workflow/zespol.md`; orkiestrator pasa pochodzi z tego zespołu.

**ZES-42.** W skali 6+ zespół platformowy jest właścicielem części wspólnych w CODEOWNERS i akceptuje zadania `S<n>` (ZES-21).

### Zadania, kontrola ledgera, scalanie

**ZES-43.** W zespole nadawaj zadaniom ID z prefiksem pasa (`<pas>-<n>`, np. `api-7`) — bo ID wyznacza katalog `.workflow/tasks/<id>/` i worktree `.worktrees/<id>`.

**ZES-44.** Stany zadań zapisuj `task.sh` (`dispatched --exec <wykonawca> --base <sha> --pas <pas>`, `--pas` wymagany w zespole); wpis ma „by <AUTOR> pas <pas>”, a `tick.mjs` pokazuje cudze zadania w sekcji „Inni (informacyjnie)”, bez akcji.

**ZES-45.** Przedłużaj zajęcie `claim.sh --renew <pas>`, dopóki pracujesz w pasie; termin domyślny (`CLAIM_DAYS`) zmień rulingiem.

**ZES-46.** `check-ledger.mjs` (CI, `bramki / proces`) zwraca kod 1 przy zdublowanym ID (R, S, SEC) albo inicjałach; zdublowanemu wpisowi nadaj nowy numer (`ruling.sh --next`) — jedyny wyjątek od ZES-18; inicjały zmień `dev-setup.sh --author XY2`.

**ZES-47.** PR z plikami `merge=union` (ledger, lekcje) scalaj lokalnie `git merge`, gdy przycisk Merge na platformie repo pokazuje konflikt — bo platforma nie stosuje `merge=union`.

## Procedura

### Nowy deweloper w projekcie
1. Sklonuj repo i uruchom konfigurację:
   ```bash
   bash .workflow/bin/dev-setup.sh --author XY
   git switch -c process/XY && git add .workflow/developers.txt && git commit -m "chore: deweloper XY"
   ```
2. PR z `process/XY` (ZES-28); dodaj osobę w `docs/workflow/zespol.md`.
3. Przeczytaj pliki z ZES-34; sprawdź pasy: `bash .workflow/bin/claim.sh --list`.

### Zajęcie i przekazanie pasa
1. Zajmij: `bash .workflow/bin/claim.sh <pas> "<opis>"`; kod 1 → uzgodnij z osobą z komunikatu; przedłużaj `--renew`.
2. Pracuj jako orkiestrator pasa: decyzje `ruling.sh` (`--shared`, gdy dotyczą innych), stany `task.sh … --pas <pas>`.
3. Oddaj: „STAN DO WZNOWIENIA”, push gałęzi i PR `process/<AUTOR>`, zatrzymanie procesów w tle, `bash .workflow/bin/claim.sh --release <pas>`.
4. Przejmujący: `claim.sh <pas>`, procedura wznowienia, zmiana w `docs/workflow/zespol.md`.

### Zmiana części wspólnej w zespole
1. Pas zgłasza brak (plik, pole, konsument) właścicielowi części wspólnej; `ruling.sh --kind S "<opis>" --shared`.
2. Orkiestrator zleca `S<n>` (ZES-21) we własnym worktree.
3. Przed scaleniem: próbne scalenie każdego pasa i nota o wpływie (ZES-22).
4. PR z akceptacją Code Owners i zielonym `bramki / wynik`; po scaleniu rozesłanie noty (ZES-23).
5. Orkiestratorzy pasów: `git merge origin/main`, przepięcie osobnym commitem, bramka zadania.

## Szablony i narzędzia
- `.workflow/bin/claim.sh`, `.workflow/bin/ruling.sh`, `.workflow/bin/task.sh`, `.workflow/bin/check-ledger.mjs`, `.workflow/bin/dev-setup.sh`.
- `docs/workflow/zespol.md` — role, pasy, rytm; `.workflow/templates/task/wplyw-na-pasy.md` — nota o wpływie.
- `.github/CODEOWNERS`, `.github/workflows/bramki.yml`, `.github/pull_request_template.md`, `.gitattributes` — kreator w trybie zespołowym.

## Checklista
- [ ] `dev-setup.sh` uruchomiony; `workflow.author` ustawiony; wpis w rejestrze deweloperów scalony przez PR.
- [ ] Ochrona `main`: wymagany `bramki / wynik`, Code Owners, 1 akceptacja; `claim/*` niechronione.
- [ ] Pas zajęty `claim.sh` przed pierwszym zleceniem, termin aktualny w `--list`.
- [ ] Decyzje tylko przez `ruling.sh`, dotyczące innych z `--shared`; `check-ledger.mjs` = 0.
- [ ] Zmiany części wspólnych tylko w `S<n>` z notą o wpływie.
- [ ] Oddanie pasa: STAN DO WZNOWIENIA, push, PR `process/<AUTOR>`, `claim.sh --release`.
