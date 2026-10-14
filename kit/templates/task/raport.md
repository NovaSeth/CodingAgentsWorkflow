# Raport: <tytuł> (<id>)
<!-- Zapis: .workflow/tasks/<id>/report.md. Linia „Status:” ma jedną wartość: DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT albo BLOCKED (czyta ją tick.mjs; liczy się ostatnia). Raport jest zapisem historycznym: w rundzie poprawek nie zmieniaj starych sekcji, dopisz nową z własną linią „Status:”. -->

Worktree / gałąź: <…>. Commity: <sha> (RED), <sha> (GREEN), … Push: <tak/nie>. Zakres dotknięty: <…>.
Status: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>

## Decyzje
1. <punkt celu 1>: <co zrobiono i dlaczego>
2. …

## Pliki
- <ścieżka>: <zmiana>

## RED / GREEN
- RED: <test> padał, bo <powód> (wynik: …)
- GREEN: <liczby po implementacji>

## Bramka
| Polecenie | Wynik | Kod |
|---|---|---|
| typecheck | | |
| lint | | |
| testy | | |
| check-secrets | | |
<powtórki niestabilnych testów — wyjaśnienie>

## Asercje E2E przejrzane
## Luki wspólne (dla orkiestratora)
- <pakiet / plik / pole / konsument>
## Kontekst
<przeczytane pliki i zakresy linii; reguły metody — po ID (grep), nie całe dokumenty>

## Otwarte kwestie / odstępstwa od briefu
## Proponowana wiadomość commita (jeśli wykonawca nie commituje)

<!-- Kolejne rundy dopisuj na końcu, jedna sekcja na rundę (k = numer rundy, cyfra):

## Runda poprawek <k> (findings-r<k>.md)
| Ustalenie | Poprawka | RED / GREEN | Commit |
|---|---|---|---|
Bramka: <tabela jak wyżej>.
Status: <DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED>

## DISPUTED (tylko przy sporze z ustaleniem — bez poprawki tego ustalenia)
- <ID ustalenia>: <argument> — dowód: <test / plik:linia>
-->
