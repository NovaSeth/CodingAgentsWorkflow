# 04. Specyfikacja i plan

**Cel:** spec, plan i zadania z wartościami, które wykonawca bierze dosłownie, bez zgadywania. **Czyta:** designer (spec), orkiestrator (plan, briefy), recenzent (Global Constraints, Review Focus, samokontrola), implementer (anatomia zadania, definicja ukończenia). **Kiedy:** przed funkcją albo iteracją większą niż jedno zadanie; przy obudowywaniu systemu zastanego.

**Mapa sekcji**
- §Specyfikacja — nagłówek, sekcje 1–18, kryterium sukcesu i budżet wydajności, decyzje, niewiadome, późne zmiany (SPC-1–12).
- §Plan — nagłówek, Global Constraints, Review Focus, rozstrzygnięcia, pasy, pliki wspólne, fazy (SPC-13–24).
- §Zadanie — nagłówek dla `brief.sh`, pola, kroki TDD, zamknięcie planu (SPC-25–30).
- §Definicja ukończenia — jednostka, minimum dla ekranu i endpointu (SPC-31–32).
- §System zastany — inwentaryzacja, kolejność przejmowania, katalog z kodu (SPC-33–36).
- §Zespół — ID zadań z prefiksem pasa, wybór planu przez `tick.mjs` (SPC-37–38).
- §Procedura — napisz spec; napisz plan; wytnij brief.
- §Checklista — samokontrola planu.

## Reguły

### Specyfikacja

**SPC-1.** Spec = co i dlaczego; plan = kolejność, kto, jak sprawdzić; brief = wycinek planu z dokładnymi wartościami; plan NIE zmienia decyzji specu bez rulingu.
**SPC-2.** Spec pisze designer na zlecenie orkiestratora do `docs/specs/RRRR-MM-DD-<temat>.md` z `.workflow/templates/spec.md`; w pełnej autonomii spec przechodzi samorecenzję zamiast akceptacji, a decyzje trafiają do ledgera.
**SPC-3.** Nagłówek specu MUSI mieć: datę, autora (rola), zadanie z tablicy zadań, rulingi wejściowe (solo zakres `R<od>–R<do>`; w zespole lista ID albo `grep -n 'R-<AUTOR>-' .workflow/progress.md`), Wejście (specy, rulingi, ledger, repo@sha, dokumentacja, nagrania), Status przy wstrzymanej implementacji, zasadę „projekt działa bez odpowiedzi na Q<n>; każda niewiadoma ma wykrywanie i fallback”.
**SPC-4.** Spec MUSI mieć sekcje szablonu w kolejności: problem i kryterium, podejścia, decyzje, architektura, model danych, niewiadome, algorytmy, kontrakt, zdarzenia, wielodostępność, bezpieczeństwo, obserwowalność, testy, wdrożenie, ryzyka, iteracje, decyzje do zatwierdzenia, otwarte kwestie; sekcja nie dotyczy → „nie dotyczy, bo …”.
**SPC-5.** Stan obecny podawaj z dowodem `plik:linia`; kryterium sukcesu = metryka + próg (np. „0 × 503 przy N testerach”, „opóźnienie ≤ 5 min przez 95% czasu”, „istniejące E2E bez zmian”); „działa poprawnie” nie jest kryterium; ścieżka krytyczna ma w kryterium budżet wydajności (np. p95 ≤ 200 ms przy N równoległych; skalibruj), przekroczenie: `16-runbooki.md` §Regresja wydajności.
**SPC-6.** Zakres w tabeli; „Poza zakresem” wskazuje, gdzie trafia każda wyłączona rzecz (iteracja, spec).
**SPC-7.** Podejścia: tabela A/B/C z „za” i „przeciw”, potem „Wybór: X (R<n>)” i jedno zdanie, co bierzemy z odrzuconych.
**SPC-8.** Każda decyzja: `Nr | Decyzja | Dlaczego / koszt błędu` — ile kosztuje pomyłka i co czyni odwrót tanim.
**SPC-9.** Architektura: jednostki z jednym zadaniem, testowalne osobno; granice jako reguły testowalne („moduł importuje tylko X; pilnuje test architektury”); model danych jako DDL z komentarzem przy kolumnie i wersjonowaniem.
**SPC-10.** Niewiadome: `Niewiadoma | Jak wykryjemy bez odpowiedzi | Fallback`; pytanie nigdy nie blokuje pracy.
**SPC-11.** Kontrakt: ścisłe schematy z limitami długości, nagłówki niezmienione oznaczone „bez zmian”, kody błędów, semantyka danych częściowych; wdrożenie: flaga per zasób `off | shadow | on`, kryterium wyjścia z shadow, wycofanie = flaga off; iteracja = osobny PR + testy + bramka + coś widocznego dla testerów.
**SPC-12.** Późne zmiany dopisuj na końcu jako „Uzupełnienia po recenzji <X> (<data>): R<n> …”; **NIE WOLNO** poprawiać wcześniejszego tekstu po cichu.

### Plan

**SPC-13.** Plan pisze orkiestrator do `docs/plans/RRRR-MM-DD-<temat>.md` z `.workflow/templates/plan.md`; zaczyna się blokiem „Dla agentów” (proces, kroki z polami wyboru, postęp na tablicy i w ledgerze, nie w planie).
**SPC-14.** Nagłówek planu: cel, architektura, stos z dokładnymi wersjami, spec (wiążący), ledger, podręcznik orkiestratora, reguła pierwszeństwa, repo i SHA bazy, lista kodu przeczytanego do planu.
**SPC-15.** Reguła pierwszeństwa: nazwy z raportu zadania wygrywają z nazwami w planie; implementer używa nazwy z raportu, orkiestrator poprawia plan.
**SPC-16.** Global Constraints: domyślnie 5–12 niezmienników wiążących każde zadanie, identycznych w planie i `CLAUDE.md`; każdy, który się da, pilnowany testem, generatorem albo lintem (`05-jak-kodowac.md` §Architektura repo — KOD-1).
**SPC-17.** Global Constraints obejmują co najmniej: porty, prefiks API, obowiązkowe nagłówki, kody błędów; stałe czasowe (progi, TTL, retencja idempotencji); dzierżawcę wszędzie z testem izolacji; zdarzenie w transakcji; granice modułów; sekrety tylko po stronie serwera i skaner przed pushem; świat danych KANON; tylko tokeny; bramkę = zachowanie i dane, nie piksele; commit na krok, zakaz `git stash`, `main` tylko przez PR.
**SPC-18.** Przy migracji Global Constraints **MUSZĄ** zawierać KOD-60 (`05-jak-kodowac.md` §TDD i E2E — pliki istniejących testów bez zmian).
**SPC-19.** Review Focus: 3–5 ponumerowanych scenariuszy ryzyka, każdy z dokładnym oczekiwanym zachowaniem i zadaniem lub testem, który go dowodzi (np. „podwójne tapnięcie: jeden zapis, przycisk w ładowaniu”, „zewnętrzny zapis OK, lokalny pada: ponowienie nie woła systemu zewnętrznego”).
**SPC-20.** Rozstrzygnięcia planu `P1…Pn`: niejasność zostawiona przez spec, rozstrzygnięta jako „co — dlaczego — koszt błędu” i zapisana w ledgerze.
**SPC-21.** Pasy: `Pas | Katalog na wyłączność | Zadania (kolejno) | Start po`; równoległość wynika z rozłącznych katalogów; dwa pasy **NIE WOLNO** dzielić katalogu.
**SPC-22.** Plan wymienia pliki wspólne (kontrakt, tokeny, UI, katalog, platforma, manifest pakietów, lockfile, konfiguracja); pas ich nie zmienia — zmienia je wyłącznie zadanie wspólne `S<n>` (zleca orkiestrator; `05-jak-kodowac.md` §Architektura repo — KOD-3, KOD-4).
**SPC-23.** Domyślne fazy: F0 środowisko, reguły, repo, CI (orkiestrator); F1 fundament: kontrakt, świat danych, eksport DS, szkielet backendu, UI, klient API (sekwencyjnie); F2 obszary w pasach (domyślnie 3–5 implementerów; skalibruj rulingiem); F3 offline, kolejki, konflikty, brzegi; F4 prawdziwe systemy zewnętrzne (zależne od kluczy); F5 utwardzenie, bezpieczeństwo, wydanie.
**SPC-24.** Pasy startują dopiero, gdy istnieją kontrakt i świat danych; praca czekająca na zewnętrzne klucze to osobna, późna faza; fazę zamyka bramka obszaru każdego jej obszaru (`08-recenzje-i-bramki.md` §Bramka obszaru — przegląd krzyżowy, pełne E2E na świeżym buildzie, raport dla PO).

### Zadanie

**SPC-25.** Zadanie MUSI zaczynać się nagłówkiem `### Zadanie <id>: <tytuł>` z unikalnym `<id>` — `.workflow/bin/brief.sh <id>` wycina zadanie po nim do następnego nagłówka `##`+ poza blokiem kodu.
**SPC-26.** Wewnątrz zadania **NIE WOLNO** używać nagłówków markdown poza blokami kodu — `brief.sh` utnie zadanie na pierwszym z nich.
**SPC-27.** Zadanie ma pola: Pliki (Utwórz / Zmień / Test), Interfejsy (Konsumuje: symbol + zadanie, które go produkuje; Produkuje: dokładne sygnatury, typy, tabele, nagłówki), kroki z polami wyboru, Bramka (polecenia, gałąź `feat/<obszar>-<id>`), Akceptacja w jednej sprawdzalnej linii.
**SPC-28.** Kroki: RED z pełnym kodem testu → uruchom (dokładne polecenie, „Oczekiwane: FAIL (<powód>)”) → implementacja → uruchom („Oczekiwane: PASS”) → flow E2E / QA → commit z wiadomością.
**SPC-29.** Plan zamykają: definicja ukończenia, szacunek `Faza | Czas | Wąskie gardło`, ryzyka, samokontrola `§ specu | Zadania`.
**SPC-30.** Późne rulingi dopisuj na końcu planu jako „Korekta <data>: wiąże ponad wcześniejszymi sekcjami”; **NIE WOLNO** wplatać ich w tekst.

### Definicja ukończenia

**SPC-31.** Definicja ukończenia per jednostka (ekran, endpoint, moduł) jest w planie i w `CLAUDE.md`, dopasowana z `.workflow/templates/code/definicja-ukonczenia.md`; zadanie bez niej spełnionej nie jest `DONE`.
**SPC-32.** Ekran minimum: trasa z katalogu i stabilny identyfikator testowy; dane tylko przez warstwę API; każdy stan z makiety osiągalny scenariuszem mock; przejścia zgodne z mapą obszaru; test renderu i głównej akcji; krok we flow E2E. Endpoint / moduł: izolacja dzierżawców, zdarzenie po zapisie, autoryzacja per obiekt, powtórka idempotentna — każde z testem.

### System zastany

**SPC-33.** Gdy nowy system obudowuje stary (`05-jak-kodowac.md` §Backend — strangler fig, KOD-43), zadania przejmowania powstają z inwentaryzacji API zastanego: liczby (operacje wg etapów, endpointy udokumentowane, wołane, nieużywane, wadliwe), tabela `Endpoint | Operacje | Kto używa | Etap dziś | Etap docelowy | Zależności | Ryzyko | Wartość H/M/L | Iteracja`, rozbieżności rejestru z kodem.
**SPC-34.** Kolejność przejmowania: (1) co odblokowuje klientów, (2) obejście wadliwych endpointów, (3) funkcje bez źródła w starym systemie, (4) zasoby tylko do odczytu; odstępstwo = rozstrzygnięcie planu.
**SPC-35.** Pytania do zespołu systemu zastanego: ponumerowane, testowalne, każde z „Fallback dziś: …”, w pliku TODO w repo; **NIE WOLNO** blokować nimi pracy.
**SPC-36.** Katalog operacji generuj z kodu (rejestr, trasy), nie z dokumentacji, i wzbogacaj sekcjami z inwentaryzacji; raport luk z rejestru sprawdza bramka przez `git diff --exit-code`.

### Zespół

**SPC-37.** W zespole ID zadania **MUSI** zaczynać się nazwą pasa: `### Zadanie <pas>-<id>: <tytuł>` (np. `koszyk-F0.1`) — bo inaczej katalogi `.workflow/tasks/<id>/` orkiestratorów kolidują.
**SPC-38.** Plan wskaż w nagłówku ledgera `# Ledger — plan: <ścieżka>`; w zespole nazwa planu zawiera pas (`RRRR-MM-DD-<pas>-<temat>.md`); `tick.mjs` wybiera: `--plan` → plany z nazwą moich pasów → nagłówek ledgera → wszystkie.

## Procedura

### Napisz spec (designer)

1. Wejście: KANON, raport decyzyjny, rulingi (`tail -80 .workflow/progress.md`), kod z `plik:linia`, nagrania.
2. Skopiuj `.workflow/templates/spec.md` do `docs/specs/RRRR-MM-DD-<temat>.md`; wypełnij nagłówek (SPC-3).
3. Napisz §1–§3: kryterium mierzalne, podejścia, decyzje z kosztem błędu (SPC-5–SPC-8).
4. Napisz architekturę, model, niewiadome z fallbackiem, kontrakt, testy, wdrożenie (SPC-9–SPC-11).
5. Rozbij na iteracje; propozycje decyzji wpisz do „Decyzje do zatwierdzenia”, zatwierdzone zapisz:
   ```bash
   bash .workflow/bin/ruling.sh "<co>" "<dlaczego>" "<koszt błędu>"
   ```

### Napisz plan (orkiestrator)

1. Skopiuj `.workflow/templates/plan.md` do `docs/plans/RRRR-MM-DD-<temat>.md`; wypełnij nagłówek i regułę pierwszeństwa (SPC-13–SPC-15).
2. Spisz Global Constraints i Review Focus; przenieś je dosłownie do `CLAUDE.md` (SPC-16–SPC-19).
3. Rozstrzygnij niejasności specu jako `P<n>` i zapisz w ledgerze (SPC-20).
4. Wyznacz pasy, pliki wspólne, strukturę plików z zadaniem tworzącym każdy plik, fazy (SPC-21–SPC-24).
5. Napisz zadania według SPC-25–SPC-28; zamknij plan (SPC-29); przejdź checklistę.

### Wytnij brief (orkiestrator)

```bash
bash .workflow/bin/brief.sh <id> docs/plans/<plan>.md     # → .workflow/tasks/<id>/brief.md
```
Kod 1 „nie znaleziono” = zły nagłówek albo `<id>` (SPC-25). Uzupełnij sekcję „Uzupełnia orkiestrator” i listę ID reguł (`06-orkiestracja-i-role.md` §Brief — pola briefu).

## Szablony i narzędzia

- `.workflow/templates/spec.md`, `.workflow/templates/plan.md` — szablony specu i planu.
- `.workflow/templates/code/definicja-ukonczenia.md` — definicja ukończenia do dopasowania.
- `.workflow/bin/brief.sh` — wycina zadanie do briefu; `.workflow/bin/ruling.sh` — ruling w ledgerze.

## Checklista

Samokontrola planu przed pierwszym briefem:
- [ ] Każdy § specu ma zadania w tabeli samokontroli; żadne zadanie bez § specu albo `P<n>`.
- [ ] Global Constraints 5–12, identyczne z `CLAUDE.md`; każdy ma strażnika albo powód, czemu go nie ma.
- [ ] Review Focus 3–5, każdy z oczekiwanym zachowaniem i zadaniem dowodzącym.
- [ ] Pasy mają rozłączne katalogi; pliki wspólne wypisane; zmiany wspólne jako `S<n>`.
- [ ] Pasy startują po kontrakcie i świecie danych; zależne od kluczy w osobnej fazie.
- [ ] Każde zadanie: `### Zadanie <id>:` unikalne (w zespole z prefiksem pasa), bez nagłówków w środku, `brief.sh <id>` przechodzi.
- [ ] Ścieżka krytyczna ma budżet wydajności w kryterium sukcesu; plan wskazany w nagłówku ledgera.
- [ ] Każde zadanie ma Pliki, Interfejsy, RED z kodem testu, polecenia z oczekiwanym wynikiem, Bramkę, Akceptację.
- [ ] Interfejs konsumowany wskazuje zadanie, które go produkuje, wcześniejsze w kolejności pasa.
- [ ] Definicja ukończenia dopasowana; szacunek czasu i ryzyka wypełnione.
- [ ] Rozstrzygnięcia `P<n>` zapisane w ledgerze.
