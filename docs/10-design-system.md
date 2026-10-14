# 10. Design system

**Cel:** jeden design system (DS) jako źródło prawdy dla makiet i kodu, egzekwowany testami. **Czyta:** designer, orkiestrator, implementer, recenzent, PO. **Kiedy:** zmiana DS, eksport, makiety, bramka obszaru z UI.

Role: **narzędzie projektowe** (biblioteka + plik makiet) · **automatyzacja** (skrypty agenta w narzędziu) · **kod** (`packages/tokens`, `packages/ui`).

**Mapa sekcji**
- §Kolejność powstawania (DSN-1…3) · §Tokeny (DSN-4…15) · §Komponenty (DSN-16…27)
- §Biblioteka tylko DS — dwa pliki, strażnik, audyty (DSN-28…32)
- §Wersjonowanie i wydanie (DSN-33…36) · §Dokumentacja (DSN-37…39)
- §Eksport do kodu — eksport, generator, „tylko tokeny”, typy (DSN-40…49)
- §Makiety konsumowalne — mapy obszarów, stany, mapa API (DSN-50…58)
- §Bramka: zachowanie — nie piksele; QA diagnostyczne (DSN-59…63)
- §Pułapki narzędzia projektowego (DSN-64)
- §Procedura — A. Wydanie DS · B. Zmiana DS · §Szablony i narzędzia

## Reguły

### Kolejność powstawania

**DSN-1.** Kolejność: makiety hi-fi w HTML (jeden zestaw tokenów i skala typografii, zasady `ZP1…ZPn`) → biblioteka skryptami z CSS makiet → makiety z instancji biblioteki → eksport do kodu → test „tylko tokeny” → bramki zachowania.
**DSN-2.** Zasada `ZP<n>` ma dowód z discovery (kod potrzeby albo URL z rejestru); opisy komponentów i „Rób / Nie rób” cytują ją po numerze.
**DSN-3.** Skrypty budujące są idempotentne i zwracają niezmienniki (liczby per kolekcja, 0 zmiennych bez zakresu lub składni, 0 semantycznych bez Dark); niespełniony = przerwij.

### Tokeny

**DSN-4.** Tokeny tworzą trzy kolekcje: Prymitywy (ukryte), Kolor semantyczny (Light i Dark, tylko aliasy), Rozmiar; tryby, zakresy i nazwy: `.workflow/templates/design-system/tokeny.md` §Kolekcje.
**DSN-5.** **NIE WOLNO** wpisać surowej wartości do kolekcji semantycznej ani użyć prymitywu wprost w komponencie.
**DSN-6.** Każdy prymityw, zmienna i styl ma opis według szablonu tokenów, §Opisy.
**DSN-7.** Kolor bez tokenu przypisz do istniejącej roli; nie twórz dla niego nowego tokenu.
**DSN-8.** Nazwę zmiennej zmieniaj w miejscu (identyfikator zostaje); skrypt sprawdza brak starych nazw.
**DSN-9.** Tryb ciemny = drugi tryb kolekcji semantycznej na ramce ekranu; **NIE WOLNO** tworzyć wariantów Light/Dark komponentów.
**DSN-10.** Wartości ciemne to nowe prymitywy wyliczone skryptem: ten sam odcień, jasność do kontrastu z zapasem (szablon tokenów, §Tryb ciemny).
**DSN-11.** Prowadź listę par kontrastu (szablon tokenów, §Pary kontrastu): tekst ≥ 4,5, UI i grafika ≥ 3,0 (WCAG 1.4.11), w każdym trybie.
**DSN-12.** Prymityw, który nie przechodzi, przyciemnij minimalnie i zapisz powód w jego opisie.
**DSN-13.** Stan **NIE MOŻE** być przekazany wyłącznie kolorem; drugi nośnik (np. waga fontu) zapisz w opisie stylu (WCAG 1.4.1).
**DSN-14.** Style tekstu: jedna rodzina fontów, nazwy według skali ról.
**DSN-15.** Scalenie lub usunięcie stylu to MAJOR: najpierw przepnij węzły na styl docelowy, potem usuń źródło; opis docelowego wymienia, co wchłonął.

### Komponenty

**DSN-16.** Strony biblioteki: Okładka · Jak korzystać · Changelog · Fundamenty · Atomy · Molekuły · Organizmy · Szablony.
**DSN-17.** Buduj w kolejności zależności (ikony → tekst → powierzchnia → … → ekran); na końcu: dopasowanie slotów, warianty w miejscu, naprawa odwołań do właściwości.
**DSN-18.** Tekst to instancja `Text` (wariant na styl), tło i obramowanie — instancja `Surface`; poza komponentami zostają tylko kontenery układu.
**DSN-19.** Wzorzec składany ad hoc w makietach awansuj do komponentu w przeglądzie DS.
**DSN-20.** Wariant dodawaj w miejscu (nowa oś, klucze bez zmian); przebudowa z nowym kluczem to MAJOR.
**DSN-21.** Ikonę zmieniaj właściwością podmiany instancji, nie wariantem; glif to jedna warstwa z kolorem z tokenu.
**DSN-22.** Ramka slotu dopasowuje się do treści; komponent do slotu: ramka zewnętrzna dopasowana, wnętrze stałe.
**DSN-23.** Wartości ciągłe (postęp) wyrażaj wariantami — warstw instancji nie da się skalować.
**DSN-24.** Każdy komponent ma opis: tokeny rozmiaru, użycie, odwołania do zasad `ZP<n>`.
**DSN-25.** Interfejs systemu (klawiatura, alert, arkusz udostępniania) bierz z zestawu UI platformy, nie z DS.
**DSN-26.** Audyt strony komponentów: 0 niezwiązanych wypełnień i obramowań, 0 tekstów bez stylu, 0 surowych odstępów i promieni, 0 domyślnych nazw warstw, 0 komponentów bez opisu.
**DSN-27.** Wygląd komponentu (także kolor) zmieniaj w DS (wariant w miejscu → procedura A → przebudowa makiet); **NIE WOLNO** nadpisywać go w makiecie.

### Biblioteka tylko DS

**DSN-28.** Biblioteka (tokeny, style, komponenty) i makiety (instancje **opublikowanej** biblioteki, import po kluczu) to dwa pliki; **NIE WOLNO** kopiować komponentów lokalnie do makiet.
**DSN-29.** Każde zadanie automatyzacji **MUSI** zaczynać się strażnikiem pliku: `if (fileKey !== TARGET) throw 'WRONG_FILE'`.
**DSN-30.** Klucze biblioteki (nazwa → klucz) eksportuj do pliku danych; budowniczy makiet importuje wyłącznie przez niego.
**DSN-31.** Konwersja makiet dopasowuje kolor do najbliższego tokenu dozwolonego dla zakresu i trybu, tekst do najbliższego stylu; niedopasowanie → raport, nigdy surowa wartość.
**DSN-32.** Audyt po budowie makiet: poza DS 0 tekstów, 0 ramek z własnym wyglądem, 0 wektorów; 0 klikalnych bez celu; 0 ekranów na sobie, 0 strzałek na ekranach.

### Wersjonowanie i wydanie

**DSN-33.** Semver DS: MAJOR = usunięty lub scalony token albo styl, nowy klucz komponentu; MINOR = nowy komponent, wariant, token; PATCH = poprawka wizualna albo dokumentacji.
**DSN-34.** Artefakty wydania: `VERSION`, `CHANGELOG.md`, tag `ds-vX.Y.Z`, wersja i commit na okładce i w opisie publikacji; commit wydania dotyka tylko ich i skryptów komponentów.
**DSN-35.** Okładkę i Changelog generuje skrypt z gita: ostrzega, gdy tag ≠ HEAD, dopisuje `-dirty` przy zmianach niezacommitowanych, bez danych pokazuje „?”.
**DSN-36.** Przed pierwszym wydaniem ustal rulingiem, kto publikuje; aktualizacja pliku statusu jest pozycją checklisty wydania.

### Dokumentacja

**DSN-37.** Dokumentację biblioteki generuje skrypt: Fundamenty z próbkami w obu trybach i tabelą kontrastu, komponenty z opisem, właściwościami, podglądem ciemnym.
**DSN-38.** „Jak korzystać”: kolekcje, nazewnictwo, składnia w kodzie, tryb ciemny, „Rób / Nie rób” z numerami zasad (w „Nie rób”: prymitywy wprost, warianty Light/Dark, odłączanie instancji).
**DSN-39.** Repo kodu ma `docs/design-system.md` (potok narzędzie → `tokens.json` → `theme.ts` → UI → ekrany, tabela komponent ↔ DS, zasady z testami, procedura B), linkowany z README pakietów.

### Eksport do kodu

**DSN-40.** Eksport = jedno zadanie automatyzacji tylko do odczytu ze strażnikiem pliku: `packages/tokens/tokens.json`, `design/icons/*.svg` (`currentColor`), `design/components.json` (klucze, właściwości, użycia), `design/screens/<id>.png|.json`.
**DSN-41.** Rozbieżność eksportu z innymi źródłami rozstrzyga narzędzie projektowe; konflikt makiet rozstrzyga DS, makiety idą na listę poprawek.
**DSN-42.** `packages/tokens/scripts/build.mjs` generuje `src/theme.ts` (GENERATED): rozwiązuje aliasy, niezgodność z wartościami trybów przerywa build; geometria spoza zmiennych żyje w generatorze; test determinizmu.
**DSN-43.** Global Constraint: „Wszystkie kolory, odstępy, promienie i typografia pochodzą z pakietu tokenów. Wartości wpisane na sztywno nie przechodzą przeglądu.”
**DSN-44.** Pilnuje go test z `.workflow/templates/code/global-constraints.test.ts` (odrzucane wzorce), z kontrolą samego siebie i asercją zakresu.
**DSN-45.** Test smoke pada, gdy nowo wyeksportowany komponent nie ma testu.
**DSN-46.** Kolor przekazuj nazwą tokenu (`color="onSurfaceMuted"`), czytaj przez `useColors()`; surowy motyw importuje jeden plik.
**DSN-47.** Typy wymuszają dostępność: klikalny ma rolę, cel ≥ `size/touch` i `testID`; `disabled` wymaga `disabledReason` (dla czytnika ekranu).
**DSN-48.** Nazwa komponentu w kodzie = nazwa w bibliotece (`Record row` → `RecordRow`); wariant = właściwość (`variant="primary"`).
**DSN-49.** Zmiana DS to wyłącznie zadanie wspólne `S<n>` (zleca orkiestrator, wykonuje designer, w zespole akceptuje właściciel z CODEOWNERS), nigdy przy okazji ekranu; brak komponentu lub tokenu → implementer przerywa i zgłasza.

### Makiety konsumowalne

**DSN-50.** Makiety biorą dane z KANON (`03-discovery-research-makiety.md` §KANON — reguły świata).
**DSN-51.** Strona obszaru: ekran główny, **wszystkie** stany (ładowanie, pusto, brak sieci, brak wyników, błąd, konflikt), drzewo ekranów osiągalnych kliknięciem; strzałka od pierwszego wywołania, dalej numerowana pigułka.
**DSN-52.** Ekran ma wysokość treści (minimum wysokość urządzenia), poza pełnoekranowymi.
**DSN-53.** Numery rzędów map są stałe; usunięty rząd zostawia lukę — bo cytują je zadania i testy.
**DSN-54.** Ekrany wycięte z zakresu przenieś przed przebudową na stronę „Poza zakresem” z numerem komentarza; **NIE WOLNO** ich usuwać.
**DSN-55.** API opisuj obok mapy: `design/spec.json` (odczyty, zapisy, luki per ekran) generuje karty i `design/MAPA-API.md` (luki `API-<n>`); lista luk wyznacza zakres backendu.
**DSN-56.** Przebudowa przepina powiązania po nazwach ekranów i przerywa się przy brakujących ramkach, **zanim** usunie starą sekcję.
**DSN-57.** `testID="screen-<id z makiety>"` nadaje komponent główny ekranu, nie ręcznie.
**DSN-58.** Komentarze recenzentów: odpowiedź w wątku, zamknięcie po realizacji, otwarte tylko czekające na PO; przed przebudową odczytaj świeże.

### Bramka: zachowanie

**DSN-59.** Bramka obszaru z UI = testy, E2E z asercjami zachowania i danych, recenzja kodu — nie piksele; różnice wizualne idą na listę poprawek, blokuje tylko ekran nieużywalny (warunek: DSN-32, DSN-44, komponenty 1:1).
**DSN-60.** QA wizualne par makieta–aplikacja tylko diagnostycznie (duża zmiana DS, zlecenie PO): deep link → `testID` → zrzut; pasek statusu maskowany, czas z KANON.
**DSN-61.** Różnica pikseli to sygnał; werdykt wydaje model (oba obrazy, stały prompt): `{id, verdict: ok|drobne|błąd, diffs:[…]}`.
**DSN-62.** Najpierw liczby z JSON; obrazy otwieraj dla „błąd” lub wzrostu ponad próg (domyślnie 1 pp; skalibruj); po podmianie wspólnego komponentu obejrzyj wszystkie pary z nim.
**DSN-63.** Klasyfikuj według `.workflow/templates/gate/qa-klasyfikacja.md` (A wada ekranu · B luka wspólna · C przyjęta rulingiem · do decyzji); agentowi QA **NIE WOLNO** tworzyć rulingów.

### Pułapki narzędzia projektowego

**DSN-64.** Pułapki narzędzia projektowego: `.workflow/templates/design-system/pulapki-narzedzia.md`.

## Procedura

### A. Wydanie DS

1. Przejdź checklistę wydania pozycja po pozycji (DSN-26, DSN-11, DSN-33…36).
2. Wpis z szablonu do `CHANGELOG.md`, podbity `VERSION`, potem:
   ```bash
   git add CHANGELOG.md VERSION <skrypty komponentów> && git commit -m "ds: vX.Y.Z"
   git tag -a ds-vX.Y.Z -m "ds-vX.Y.Z"
   ```
3. Publikacja (rola z rulingu); opis: `X.Y.Z · <commit> · ds-vX.Y.Z`.
4. Przebudowa makiet importem po kluczu (DSN-32), dalej procedura B od kroku 3.

### B. Zmiana DS

Zadanie wspólne `S<n>` (DSN-49).
1. Zmiana w bibliotece (w miejscu, jeśli się da).
2. Wydanie: procedura A, kroki 1–3.
3. Eksport (DSN-40).
4. Build tokenów, przegląd diffu motywu:
   ```bash
   node packages/tokens/scripts/build.mjs && git diff -- packages/tokens/src/theme.ts
   ```
5. Przegląd dotkniętych komponentów UI (nowy wariant = nowa właściwość); README pakietu UI i `docs/design-system.md`.
6. Testy: tokeny → UI („tylko tokeny”, smoke) → typecheck → aplikacja → E2E.

## Szablony i narzędzia

- `.workflow/templates/design-system/`: `tokeny.md` (DSN-4…15), `pulapki-narzedzia.md` (DSN-64), `checklista-wydania.md`, `CHANGELOG.md` (procedura A).
- `.workflow/templates/code/global-constraints.test.ts` (DSN-44), `.workflow/templates/gate/qa-klasyfikacja.md` (DSN-63).
