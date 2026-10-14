# <moduł> — <iteracja / zadanie>

Jeden akapit: za co moduł odpowiada; czego wprost nie robi (poza zakresem / należy do <inny moduł>).

## Interfejs publiczny (`index.ts`)
`create<Moduł>Module(platform, deps)` → `{ service, … }`; `service.<operacja>(ctx, …)` — `ctx` zawsze pierwszy; zwraca typy kontraktu.
Zależności od innych modułów: przez `deps` (wiąże je plik kompozycji).

## Zasoby domenowe
Trasy, schematy kontraktu, które źródło obsługuje każdy tryb, emitowane nagłówki.

## Źródło i etapy
| Operacja | Etap (legacy / legacy+own / own+writeback / own) | Endpointy systemu zewnętrznego | Pola nakładki | Luki |
|---|---|---|---|---|

## Zapisy
Zakres transakcji, emitowane zdarzenia (`<zasób>.<czasownik>`), idempotencja, reguła odzyskiwania po nieznanym wyniku per operacja.

## Polityka dostępu (autoryzacja per obiekt)
Kto czyta / widzi zamaskowane / edytuje; kody błędów (403 <kod>, cudzy obiekt = 404); świeżość danych uprawnień; zachowanie przy powtórce.

## Dane
Tabele (`<moduł>_*`), migracje (tylko dopisywane), filtry dzierżawcy i aktora.

## Znane ograniczenia i świadome odstępstwa (z numerami decyzji)

## Testy
Obowiązkowe: izolacja dzierżawców, zdarzenie po zapisie, powtórka idempotentna, macierz dostępu.
