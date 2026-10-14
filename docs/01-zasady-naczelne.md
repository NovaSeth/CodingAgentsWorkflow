# 01. Zasady naczelne

**Cel:** zasady, z których wynikają wszystkie pozostałe reguły metody. **Czyta:** orkiestrator, wykonawcy, PO. **Kiedy:** na start projektu i zawsze, gdy żadna szczegółowa reguła nie rozstrzyga przypadku.

**Mapa sekcji**
- §Reguły — ZAS-1…ZAS-21: podział proces/kod, spec → plan → brief, świeży kontekst, rola orkiestratora, recenzje, ledger, lekcje, jakość, bramki, budżet maszyny, autonomia, części wspólne.
- §Checklista — kontrola zgodności zadania z zasadami przed zleceniem i po scaleniu.

Obowiązkowość reguł według poziomu wdrożenia: `13-wdrozenie-w-projekcie.md` §Poziom → reguły obowiązkowe — co jest MUSI w minimum, standard, full.

## Reguły

**ZAS-1.** Trzymaj proces osobno od kodu: research, specyfikacje, plany, ledger, briefy i lekcje w `.workflow/` i `docs/` (albo w osobnym repo procesu), kod i jego dokumentację w kodzie; `02-proces-end-to-end.md` §Etapy i artefakty — gdzie leży każdy artefakt.

**ZAS-2.** Kod zmieniaj wyłącznie przez gałąź zadania i PR; zapisy procesu (ledger, briefy, raporty, recenzje, lekcje) prowadzi orkiestrator w głównym checkoucie — solo commit bezpośrednio na `main`, w zespole gałąź `process/<AUTOR>` i PR co najmniej raz dziennie i przed przekazaniem pasa (`14-zespol-wielu-deweloperow.md` §Decyzje i pliki dopisywane — scalanie ledgera w zespole).

**ZAS-3.** Zachowaj kolejność spec → plan → brief zadania; NIE WOLNO zlecać implementacji bez briefu wyciętego z planu (`04-spec-i-plan.md` §Plan — anatomia zadania w planie).

**ZAS-4.** Wykonawca NIE dostaje historii sesji: dostaje brief w pliku z dokładnymi wartościami i bierze je dosłownie.

**ZAS-5.** Jedno zadanie = jeden świeży agent = jedna gałąź od `main`; od poziomu standard zadanie MUSI mieć własny worktree, w minimum dozwolony jest tryb sekwencyjny (gałąź zadania w głównym checkoucie, jeden implementer naraz, recenzent tylko do odczytu); rundę poprawek dla agenta z kontekstem powyżej progu (domyślnie 250 tys. tokenów; zapisz własną wartość rulingiem) zlecaj świeżemu agentowi z plikiem ustaleń.

**ZAS-6.** Orkiestrator NIE pisze kodu funkcji (planuje, pisze briefy, wybiera wykonawców, scala, rozstrzyga); wyjątki są dwa: fundament F0–F1 i małe przepięcia mechaniczne weryfikowane asercjami — „szybkie zadanie” wyjątkiem nie jest (`06-orkiestracja-i-role.md` §Orkiestrator — zakres i wyjątki).

**ZAS-7.** Każde zadanie recenzuje inny wykonawca niż autor, a każda runda poprawek kończy się ponowną recenzją zawężoną (diff rundy, ADDRESSED / NOT ADDRESSED); przy poprawkach wyłącznie mechanicznych i UI orkiestrator może zweryfikować rundę sam i zapisać `task.sh <id> self-verified --round <k>` (`08-recenzje-i-bramki.md` §Ponowna recenzja zawężona — kiedy obowiązkowa i format).

**ZAS-8.** Przy zmianach danych, zapisów, autoryzacji i współbieżności własna weryfikacja orkiestratora NIE zastępuje ponownej recenzji zawężonej — na każdym poziomie wdrożenia.

**ZAS-9.** Na bramce obszaru zrób przegląd krzyżowy modelem innego dostawcy i zweryfikuj jego uwagi przed przyjęciem; bez drugiego dostawcy użyj świeżego recenzenta tego samego dostawcy z innym promptem.

**ZAS-10.** Po dwóch rundach poprawek rozstrzygnij pozostałe ustalenia niekrytyczne sam, rulingiem; trzeciej rundy nie zlecaj, ustalenia Minor przenieś na listę odroczonych.

**ZAS-11.** Każdą decyzję zapisz w ledgerze jako „Ruling R<n>: co — dlaczego — koszt błędu” (w zespole `R-<AUTOR>-<n>`) przez `.workflow/bin/ruling.sh` (`11-pamiec-projektu.md` §Ledger decyzji — struktura i gramatyka wpisów).

**ZAS-12.** Numer rulingu umieszczaj w kodzie, komentarzu i PR, których dotyczy; NIE WOLNO zmieniać zachowania oznaczonego rulingiem bez nowego rulingu — bo agent bez kontekstu „naprawi” świadomą decyzję.

**ZAS-13.** Awarię i nową regułę zapisuj w lekcjach od razu: MEM-21; regułę, która wraca w recenzjach, przenieś do briefu wspólnego jako wiążącą.

**ZAS-14.** Buduj działającą aplikację: dane z prawdziwego źródła albo trwałego zapisu, luki oznaczone jawnie (np. odpowiedź 501); NIE WOLNO zgłaszać sukcesu zapisu, który się nie wykonał (`05-jak-kodowac.md` §Zapisy — idempotencja, ponowienia, nieznany wynik).

**ZAS-15.** Czego nie da się zrobić porządnie do terminu, zgłoś wprost w raporcie; kolejność priorytetów: jakość, termin, oszczędność limitów.

**ZAS-16.** Bramka sprawdza zachowanie, nie piksele: blokuje wada funkcjonalna, błędne dane albo ekran nieużywalny; drobne różnice wizualne trafiają na listę poprawek.

**ZAS-17.** Regułę, którą da się sprawdzić automatycznie, egzekwuj testem strażnikiem, generatorem z `--check`, linterem, hookiem albo skryptem bramki — bo agent pominie instrukcję, ale nie przejdzie czerwonego testu.

**ZAS-18.** Przed każdym zleceniem agenta, wykonawcy zewnętrznego albo przebiegu E2E uruchom `.workflow/bin/budget.sh` i zlecaj tylko przy `OK`; ciężkie polecenia uruchamiaj przez `heavy.sh`; liczbę równoległych agentów ogranicza orkiestrator (skrypt mierzy load i pamięć) — szczegóły: RES-2 (`07-zasoby-i-wspolbieznosc.md` §Budżet maszyny — progi i tryby).

**ZAS-19.** Autonomia orkiestratora (co rozstrzyga sam, rulingiem): ORK-58.

**ZAS-20.** Zatrzymaj pracę i zapytaj człowieka tylko w przypadkach z listy stopów ORK-59 (działania nieodwracalne lub wrażliwe, dostępy człowieka, zmiana zakresu produktu, kontakt z osobami spoza projektu).

**ZAS-21.** Części wspólne zmienia wyłącznie zadanie wspólne `S<n>`: zleca orkiestrator, wykonuje designer (albo implementer przy zmianie mechanicznej), w zespole akceptuje właściciel z CODEOWNERS.

## Checklista

- [ ] Zadanie ma brief z planu, a wykonawca nie dostał historii sesji (ZAS-3, ZAS-4).
- [ ] Zadanie ma własną gałąź i świeżego agenta; od standard także własny worktree (ZAS-5).
- [ ] Recenzent jest inny niż autor; każda runda poprawek ma ponowną recenzję zawężoną albo — tylko przy poprawkach mechanicznych i UI — wpis `self-verified` (ZAS-7, ZAS-8).
- [ ] Każda decyzja ma ruling w ledgerze, a jego numer jest w kodzie i PR (ZAS-11, ZAS-12).
- [ ] Awaria z tej tury jest w lekcjach (ZAS-13).
- [ ] `budget.sh` zwrócił `OK` przed zleceniem (ZAS-18).
- [ ] Pytanie do człowieka dotyczy wyłącznie punktu z listy stopów (ZAS-20).
- [ ] Zmiana części wspólnej idzie jako `S<n>` (ZAS-21).
