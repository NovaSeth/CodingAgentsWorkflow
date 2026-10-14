# Zespół: kto prowadzi co

Kto prowadzi które pasy, kto pilnuje części wspólnych, jak się synchronizujemy. Każdy deweloper jest orkiestratorem swoich pasów. Reguły: `docs/workflow/metoda/14-zespol-wielu-deweloperow.md`.

Konfiguracja: `.workflow/config.json`. Deweloperzy i ich identyfikatory decyzji: `.workflow/developers.txt`.

## Role ludzi

| Rola | Kto | Odpowiada za |
|---|---|---|
| Właściciel produktu (PO) | {{PO}} | zakres, priorytety, odbiór bramek obszarów |
| Właściciele części wspólnych | {{OWNERS}} | kontrakt, tokeny, komponenty UI, rdzeń platformy, CI; akceptują zmiany `S<n>` (CODEOWNERS) |
| Orkiestratorzy pasów | patrz tabela pasów | agenci w swoich pasach, briefy, recenzje, PR, ledger |

## Pasy (obszary)

| Pas | Katalogi | Orkiestrator | Zajęcie |
|---|---|---|---|
{{AREAS_TABLE}}

Kto aktualnie prowadzi pas, pokazuje `bash .workflow/bin/claim.sh --list` (przeterminowane: WYGASŁO). Zajmujesz pas przed pierwszym zleceniem (`claim.sh <pas>`) i zwalniasz go, gdy go oddajesz (`claim.sh --release <pas>`).

- Zajęcie jest ważne `CLAIM_DAYS` dni (domyślnie 7); pracujesz dłużej — przedłuż je przed terminem: `claim.sh --renew <pas>`.
- Wygasłe zajęcie nie przechodzi samo: przejęcie tylko po uzgodnieniu z poprzednią osobą, `claim.sh --release <pas> --force`, potem `claim.sh <pas>`.
- Kody: 0 zajęte albo już Twoje · 1 pas cudzy · 2 błąd (remote, brak `git config workflow.author`).

## Zasady współpracy

1. **Decyzje mają serię per osoba:** `R-<AUTOR>-<n>`, nadawane przez `.workflow/bin/ruling.sh`. Decyzja, która dotyczy innych pasów albo części wspólnych, ma w treści znacznik **[wspólne]** i trafia na synchronizację.
2. **Części wspólne zmienia wyłącznie zadanie wspólne `S<n>`:** zleca orkiestrator (`ruling.sh --kind S "<opis>" --shared`), wykonuje designer (albo implementer przy zmianie mechanicznej), akceptuje właściciel z CODEOWNERS. Po scaleniu autor rozsyła notę o wpływie na pasy (`.workflow/templates/task/wplyw-na-pasy.md`).
3. **Jeden pas = jeden orkiestrator naraz.** Dwóch deweloperów w jednym pasie oznacza konflikt worktree, gałęzi i ledgera.
4. **CI egzekwuje bramki**, a nie dobra wola: sekrety, typecheck, lint, testy, zgodność `AGENTS.md` i spójność ledgera (`node .workflow/bin/check-ledger.mjs` — duplikaty ID rulingów, S, SEC i inicjałów). Ochrona gałęzi `main`: wymagany check `bramki / wynik` (job zbiorczy) + 1 akceptacja człowieka.
5. **Budżet maszyny jest per maszyna** (`.workflow/budget.local.env` z `dev-setup.sh`). Każdy pilnuje swojej.
6. **Lekcje są wspólne:** `docs/workflow/lekcje.md` scala się bez konfliktów (merge=union). Dopisuj od razu, z inicjałami.
7. **Zapisy procesu** (ledger, briefy, raporty, recenzje, lekcje) commitujesz na gałęzi `process/<AUTOR>` w głównym checkoucie i otwierasz PR co najmniej raz dziennie oraz przed przekazaniem pasa. Merge lokalny respektuje `merge=union`; przycisk Merge w serwisie gita może pokazać konflikt — wtedy scal lokalnie (`git merge origin/main` na `process/<AUTOR>`, push). Kod idzie tylko przez gałąź zadania i PR.
8. **Przekazanie pasa:** wpis „STAN DO WZNOWIENIA” w ledgerze (co w toku, worktree, procesy w tle), PR z `process/<AUTOR>`, `claim.sh --release <pas>`, a nowa osoba robi `claim.sh <pas>` i procedurę wznowienia z podręcznika §0.

## Rytm

| Kiedy | Co | Kto |
|---|---|---|
| codziennie, 10 min | decyzje [wspólne] z ostatniej doby (`grep '\[wspólne\]' .workflow/progress.md`), blokady, potrzebne zadania S<n> | orkiestratorzy + właściciele części wspólnych |
| po każdej bramce obszaru | raport dla PO | orkiestrator pasa |
| co tydzień | przegląd lekcji: co awansuje do briefu wspólnego, CLAUDE.md albo testu strażnika; triaż odroczonych Minor | wszyscy |
| przed wydaniem | audyt bezpieczeństwa najmocniejszym modelem, bramki wydania | właściciel bezpieczeństwa: {{SECURITY_OWNER}} |
