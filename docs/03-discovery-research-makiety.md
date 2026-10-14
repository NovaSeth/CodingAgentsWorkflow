# 03. Discovery: research, wywiady, raport decyzyjny, KANON

**Cel:** zakres MUST / NICE / LATER / NO z dowodem i jeden świat danych dla makiet, kodu i testów. **Czyta:** orkiestrator, agenci strumieni i syntezy, designer, PO. **Kiedy:** przed specem i pierwszą makietą.

**Mapa sekcji**
- §Faza 0 i kody potrzeb — kontekst własny, kody `N<n>` (DSC-1…2)
- §Strumienie — podział A…E, nagłówek, dossier, rejestr (DSC-3…7)
- §Dowody — źródła, cytaty, liczby, nieobecność (DSC-8…15)
- §Higiena kontekstu i pobieranie — `research/raw/`, linki (DSC-16…19)
- §Narzędzia analityczne — pary, nasycenie, listy, ranking (DSC-20…25)
- §Scalanie i kontrola krzyżowa — bloki, kontrola (DSC-26…28)
- §Synteza faktów — plik bieżący, pewność (DSC-29…30)
- §Wywiady — warstwy, werdykty, S/P (DSC-31…36)
- §Raport decyzyjny — części, zakres, karta, ryzyka (DSC-37…42)
- §Architektura informacji systemu zastanego (DSC-43…45)
- §KANON — jeden świat danych (DSC-46…50)
- §Procedura · §Szablony i narzędzia · §Checklista

## Reguły

### Faza 0 i kody potrzeb

**DSC-1.** Zanim agent wyjdzie na zewnątrz, orkiestrator tworzy `research/0-kontekst-wlasny.md` z szablonu; kod potrzeby ma status hipoteza / jedno źródło / potwierdzone, liczba — źródło.
**DSC-2.** Każde ustalenie, wiersz rankingu, pozycja zakresu i przepływ makiet **MUSI** wskazywać kod potrzeby `N<n>` — bo bez kodu nie da się odtworzyć, z jakiej potrzeby wyrosła funkcja.

### Strumienie

**DSC-3.** Jeden strumień = jeden agent, jeden plik `research/<X>-<nazwa>.md`, jedno pytanie (domyślny podział A…E poniżej); wszystkie dostają ten sam brief wspólny i kody potrzeb.
**DSC-4.** Plik strumienia zaczyna się nagłówkiem z szablonu (data odczytu metryk, zakres, konwencje, liczniki, legenda kodów potrzeb).
**DSC-5.** Każdy produkt opisz dossier w 9 punktach według `.workflow/templates/discovery/strumien-researchu.md` §N. <Produkt> — wzór dossier.
**DSC-6.** Strumień kończy się tabelą luk, rejestrem URL `[U-<X>01]` (tekst powołuje się na numery), listą obrazów i kartami produktów dla czytelnika, który ich nie zna.
**DSC-7.** Rejestr URL i luki dopisuj przyrostowo po każdym źródle — bo przerwany przebieg gubi rejestr pisany na końcu.

| Strumień | Pytanie |
|---|---|
| A | Konkurencja krajowa, także produkty wycofane i porzucone. |
| B | Ta sama kategoria za granicą (regiony przy dużym zbiorze). |
| C | Technologie sąsiednie, API platform: efekt „wow” z wykonalnością i ograniczeniami prawnymi. |
| D | Wzorce z innych branż, wytycznych platform, prawa i standardów na znane bóle. |
| E | Czego nikt nie zrobił, a jest wykonalne i trudne do skopiowania. |

### Dowody

**DSC-8.** **NIE WOLNO** stawiać twierdzenia bez pełnego URL źródła ani podawać szacunków z pamięci.
**DSC-9.** „Nie ustalono” zapisuj zawsze z przyczyną (403, brak domeny, robots, strona renderowana JS, brak publicznego źródła); luki są pełnoprawnym wynikiem.
**DSC-10.** Bierz źródła w kolejności z `.workflow/templates/discovery/strumien-researchu.md` §Kolejność źródeł; serwisy z recenzjami tylko jako opinie.
**DSC-11.** Cytuj dosłownie, w oryginale, z autorem i datą (opinie także z wersją), zwłaszcza negatywnie; cytat bez daty odrzuć — bo produkt mógł się zmienić.
**DSC-12.** Pisz liczby, nie przymiotniki („ocena 1,5 przy n=128”); licz wdrożenia, nie oceniaj ich.
**DSC-13.** Nie wymyślaj nazw funkcji, API ani limitów; czego producent nie nazywa, tego nie nazywasz.
**DSC-14.** Wszystkie odczyty metryk rób w jednym oknie czasowym zapisanym w briefie wspólnym; datę podawaj przy każdej metryce.
**DSC-15.** Nieobecność zapisuj jako „nie znaleziono publicznie komunikowanego wdrożenia w zbiorze N=<n>”; **NIE WOLNO** pisać „nie istnieje”.

### Higiena kontekstu i pobieranie

**DSC-16.** **NIE WOLNO** wczytywać surowego HTML do kontekstu agenta: pobieraj do `research/raw/`, pola wyciągaj skryptem, analizuj tylko pola.
**DSC-17.** Pusty szkielet (renderowanie JS) i 403 zapisuj jako lukę z przyczyną, nie brak funkcji; parser URL testuj na adresach kończących się nawiasem — bo ucięty URL daje fałszywe 404.
**DSC-18.** Recenzje ze sklepów: `.workflow/templates/discovery/strumien-researchu.md` §Recenzje ze sklepów — API albo weryfikacja parowania gwiazdek.
**DSC-19.** Linki rejestru i obrazy sprawdzaj skryptem (status HTTP, typ treści); każdy wynik inny niż 200 ma wpisaną przyczynę.

### Narzędzia analityczne

**DSC-20.** Pary kontrolowane (najmocniejszy dowód, zawsze na początku): wszystko stałe poza jedną zmienną; sekcje jak w szablonie strumienia.
**DSC-21.** Liczniki nasycenia (tabela w szablonie strumienia); zero wyróżnij z ostrzeżeniem, że puste pole bywa skutkiem przeszkody prawnej lub platformowej, nie okazją.
**DSC-22.** Trzy listy: stawka wejścia (funkcja + liczba niezależnych wdrożeń), wyróżniki (produkt + metryka + URL), świadomie porzucone (kto + cytat + URL).
**DSC-23.** Ranking z trudnością S/M/L/XL (z uzasadnieniem) i falą 1/2/3: `.workflow/templates/discovery/strumien-researchu.md` §Ranking — kolumny i skale.
**DSC-24.** „Odradzam” `O1…On`: każda pozycja z cytatem blokującym z dokumentacji lub przepisu; numeracja ciągła w całym discovery.
**DSC-25.** Przy każdym ruchu flagowym zapisz hipotezy „dlaczego nikt tego nie zrobił” i sposób sprawdzenia, czy powód nie jest dobry.

### Scalanie i kontrola krzyżowa

**DSC-26.** Duży strumień buduj jako bloki w `research/tmp/` (treść, rejestr, obrazy, luki, synteza); skleja je skrypt scalający w stałej kolejności z kopią celu; **NIE WOLNO** edytować scalonego pliku ręcznie.
**DSC-27.** Autor scalenia wstawia po bloku niezależną kontrolę krzyżową każdego twierdzenia, od którego zależy fala, trudność, zakres lub NO; format: `.workflow/templates/discovery/kontrola-krzyzowa.md`.
**DSC-28.** Część syntetyczna strumienia kończy się deklaracją, że nie wprowadza źródła spoza rejestru.

### Synteza faktów

**DSC-29.** `research/SYNTEZA-faktow.md` aktualizuj po każdym strumieniu: liczby per strumień, pary kontrolowane na początku, „Czego nikt nie robi” (x z N), ustalenia zmieniające narrację, decyzje do podjęcia, zastrzeżenia, poprawki z kontroli krzyżowych.
**DSC-30.** Pewność wyrażaj jakościowo, nigdy liczbą; podawaj wielkość próby, małą oznacz jako nieistotną (domyślnie n<10; skalibruj rulingiem); oznacz liczby wewnętrzne niesprawdzalne publicznie.

### Wywiady

**DSC-31.** Warstwy: transkrypcje (plik na sesję) → notatki z ustaleniami i `[hh:mm:ss]`, pogrupowane tematycznie → synteza budowana z notatek, nie z transkrypcji.
**DSC-32.** Wywiady wydają werdykty dla hipotez desk researchu (słownik werdyktów w szablonie syntezy); **NIE WOLNO** traktować ich jako nowej listy życzeń.
**DSC-33.** Każdy cytat i ustalenie oznacz S (spontanicznie) albo P (po podpowiedzi); podpowiedzi moderatora wypisz ze znacznikami czasu w ograniczeniach.
**DSC-34.** Ustalenie: teza, x z N, cytaty, „Co to znaczy dla produktu” z mierzalnym progiem; pozycja MVP: Co · Dowód · **Gotowe, gdy** (obserwowalne kryterium) · „Czego nie robić”.
**DSC-35.** Ograniczenia **MUSZĄ** wymienić sesje nieodbyte (x z planowanych), przechylenie próby wobec rekrutacji i tematy niezadane („brak danych z żadnej metody”).
**DSC-36.** Repo z transkrypcjami **MUSI** być prywatne; nagrania usuwaj po anonimizacji w terminie ustalonym rulingiem i zapisanym w syntezie.

### Raport decyzyjny

**DSC-37.** Raport to jeden samodzielny HTML sklejany z części `raport/NN-*.part` (kolejność z nazw); agent edytuje albo generuje jedną część, nigdy całość.
**DSC-38.** Części z danymi generuj skryptem z `raport/data/*.json`; **NIE WOLNO** przepisywać ich ręcznie; po generowaniu sprawdź ręczne poprawki stylu.
**DSC-39.** Zakres: MUST (pierwsze pozycje to często warunki, nie funkcje) · NICE (przewaga) · LATER (kolejka, nie odrzucone) · NO (każda pozycja z blokującym cytatem, przepisem albo liczbą).
**DSC-40.** Karta pozycji: kod potrzeby, tag (warunek / obowiązek prawny / x z N), koszt S/M/L, rozwijany dowód według `.workflow/templates/discovery/raport-decyzyjny.md` §Karta pozycji MUST / NICE.
**DSC-41.** Ryzyka: tabela `Kwestia | Co mówią dane | Rekomendacja` (rekomendacja = propozycja do dyskusji, nie decyzja), luki blokujące decyzję i trzy akcje zamykające większość z nich (termin, liczby do dostarczenia).
**DSC-42.** Raport i każda synteza zaczynają się od odpowiedzi w jednym zdaniu, a kończą sekcją „Czego to badanie nie dowodzi”.

### Architektura informacji systemu zastanego

**DSC-43.** Produkt obok istniejącego systemu: przed ustaleniem zakresu zmapuj ten system (żywe UI, konto z pełnym dostępem, odczyt DOM) do `research/architektura-informacji.md`.
**DSC-44.** Wyniki badań na mapie **MUSZĄ** być sprawdzone z raportem pierwotnym przed publikacją (odsetki, liczebności, liczba zbadanych obszarów); streszczenie wtórne nie jest źródłem.
**DSC-45.** **NIE WOLNO** wpisywać liczb dla niezbadanych modułów; brak danych to nie brak problemów.

### KANON

**DSC-46.** Przed pierwszą makietą ustal `research/KANON.md`: jedna zalogowana osoba, jeden dzień, te same rekordy na każdym ekranie, zegar na ekranie jako część scenariusza.
**DSC-47.** KANON jest jedynym źródłem danych makiet, fixtures (jeden plik świata), trybu mock backendu (scenariusz i zegar odtwarzają stan makiety) i asercji testów.
**DSC-48.** W konflikcie dane świata wygrywają nad liczbą w makiecie; każdą przyjętą różnicę zapisz jako ruling.
**DSC-49.** Świat tylko się rozszerza (nowe zdarzenia tego samego dnia); **NIE WOLNO** zmieniać istniejących wartości.
**DSC-50.** Zmiany stanu w ciągu dnia zapisuj jawnie: „przed HH:MM X, od HH:MM Y; dotyczy przepływów a, b, c”.

## Procedura

1. Faza 0 (orkiestrator, DSC-1):
   ```bash
   mkdir -p research/raw research/tmp raport/data
   cp .workflow/templates/discovery/0-kontekst-wlasny.md research/
   ```
2. System zastany: mapa z szablonu architektury informacji (DSC-43…45).
3. Brief wspólny strumieni (DSC-8…19, kody potrzeb, okno odczytu metryk) + brief na strumień; A…E równolegle.
4. Strumień: `research/raw/` → pola skryptem → dossier → analiza → luki, rejestr, karty → kontrola linków.
5. Duży strumień: bloki → skrypt scalający → kontrole krzyżowe (DSC-26…28).
6. Po każdym strumieniu: `research/SYNTEZA-faktow.md` (DSC-29).
7. Wywiady: scenariusz z hipotez → transkrypcje → notatki → synteza z szablonu (DSC-31…36).
8. Raport z części (`.workflow/templates/discovery/raport-decyzyjny.md`); dodatek generuje skrypt projektu `raport/gen_dodatek.py` (zleć go implementerowi: `raport/data/*.json` → `13-dodatek.part`); potem złóż i skontroluj wynik:
   ```bash
   cd raport && python3 gen_dodatek.py && cat 0*.part 1*.part > Raport.html
   ```
9. PO decyduje o zakresie; decyzje zapisz jako rulingi.
10. `cp .workflow/templates/discovery/KANON.md research/` i wypełnij (DSC-46…50); dalej `10-design-system.md` §Kolejność powstawania — DS i makiety, potem `04-spec-i-plan.md` §Specyfikacja — spec z MUST.

## Szablony i narzędzia

| Szablon | Wynik |
|---|---|
| `.workflow/templates/discovery/0-kontekst-wlasny.md` | `research/0-kontekst-wlasny.md` |
| `.workflow/templates/discovery/strumien-researchu.md` | `research/<X>-<nazwa>.md` |
| `.workflow/templates/discovery/kontrola-krzyzowa.md` | wpis po bloku w `research/<X>-<nazwa>.md` |
| `.workflow/templates/discovery/synteza-wywiadow.md` | `research/wywiady/synteza.md` |
| `.workflow/templates/discovery/raport-decyzyjny.md` | `raport/*.part` → `raport/Raport.html` |
| `.workflow/templates/discovery/architektura-informacji.md` | `research/architektura-informacji.md` |
| `.workflow/templates/discovery/KANON.md` | `research/KANON.md` |

## Checklista

- [ ] Plik fazy 0 istnieje przed startem strumieni; kody potrzeb mają status.
- [ ] Strumień: nagłówek z licznikami, dossier, luki z przyczynami, rejestr URL, karty; linki sprawdzone skryptem.
- [ ] Synteza wywiadów: werdykty, S/P, pełne ograniczenia.
- [ ] Pozycja raportu: kod potrzeby i dowód; NO z blokadą; ryzyka z trzema akcjami i terminami.
- [ ] KANON gotowy przed pierwszą makietą.
