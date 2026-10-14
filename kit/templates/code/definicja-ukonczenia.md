# Definicja ukończenia (jednostka: ekran / endpoint / moduł)

- [ ] Pod trasą z wygenerowanego katalogu; komponent główny nadaje deterministyczny identyfikator testowy.
- [ ] Dane wyłącznie przez warstwę API (bez importu fixtures i atrap w kodzie aplikacji).
- [ ] Każdy zaprojektowany stan osiągalny scenariuszem / zegarem / parametrem (bez flag w kodzie).
- [ ] Każdy klikalny element prowadzi tam, gdzie mówi mapa obszaru.
- [ ] Test komponentu: render + główna akcja (najpierw czerwony, potem zielony).
- [ ] Każdy zapis: klucz idempotencji, blokada jednego lotu, ponowienie tylko przez `canRetry` (wzorzec zapisów).
- [ ] Błąd odczytu odróżniony od „pusto”, z ponowieniem.
- [ ] Krok we flow E2E (asercje strukturalne).
- [ ] Maksymalne powiększenie tekstu systemu: nic nie jest ucięte ani nie nachodzi.
- [ ] Brak wartości wizualnych na sztywno (test „tylko tokeny” zielony).
- [ ] Backend: izolacja dzierżawców, zdarzenie po zapisie, autoryzacja obiektowa — każde z testem.
- [ ] typecheck + lint + testy + check-secrets zielone; drzewo czyste; gałąź wypchnięta.
- [ ] Brakuje elementu kontraktu / DS? → zatrzymane i zgłoszone, nie załatane lokalnie.
