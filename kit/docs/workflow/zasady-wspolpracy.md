# Zasady współpracy z właścicielem produktu (PO)

Reguły pracy z PO. Preferencje PO zapisuj tutaj, nie w lokalnej pamięci agenta.

Format: **reguła** — dlaczego (data albo numer rulingu R<n>).

Procedura wznowienia i architektura pracy: `podrecznik-orkiestratora.md`. Wnioski z budowy: `lekcje.md`. Zasady naczelne metody: `docs/workflow/metoda/01-zasady-naczelne.md`.

## 1. Rola i autonomia
- **Orkiestrator decyduje sam.** Decyzje zakresowe, techniczne i konflikty w planie zapisuje w ledgerze jako ruling i pokazuje zbiorczo w raporcie po bramce. — <dlaczego, data>
- **Bez pytań o warianty.** Nie pyta o wybór między wariantami ani o akceptację sekcji specu i planu: pisze, robi samorecenzję, planuje, realizuje. — <dlaczego, data>
- **Stop tylko przy:** działaniach nieodwracalnych lub wrażliwych (sekrety, publikacja poza repo, przepisanie historii), kluczach i dostępach, które ma tylko PO, zmianach zakresu produktu i priorytetów, kontakcie z osobami spoza projektu.
- **Do `main` tylko przez PR.** Scalanie po bramce robi orkiestrator.
- **Raport po bramce** w języku PO: wyniki testów, zrzuty jako dowód, linki do PR, rulingi zbiorczo. Język komunikacji: <polski>.

## 2. Bramki
- **Bramka = funkcjonalność i dane, nie piksele.** Blokuje wada funkcjonalna, błędne dane albo ekran nieużywalny. — <dlaczego, data>
- **Każda runda poprawek kończy się ponowną recenzją zawężoną.** Własna weryfikacja jej nie zastępuje przy danych, zapisach, autoryzacji i współbieżności.
- **Bezpieczeństwo:** <przy zadaniach dotykających obszarów wrażliwych + audyt przed wydaniem | zbiorczo przed wydaniem (koszt: luki dłużej w gałęziach)>. — <dlaczego, data>
- **Wolne miejsca budżetu wypełniaj od razu.** — <dlaczego, data>

## 3. Tablica zadań
- **Aktualizuj na bieżąco**, w tej samej turze co ledger. — PO śledzi postęp na tablicy.
- **„W toku” tylko przy realnej pracy.** Zaplanowane, ale niepodjęte to „do zrobienia”.
- **Każda nowa praca dostaje zadanie od razu.**

## 4. Wykonawcy
- **Wykonawcę wybiera router, nie pamięć.** — <dlaczego, data>
- **Jakość jest ważniejsza niż oszczędność:** słaby wynik tańszego wykonawcy podnosi poziom.
- <reguły dotyczące drugiego dostawcy, jeśli jest>

## 5. Status długich agentów
- **Agent ponad 20 min dostaje prośbę o status w 5 liniach**, a orkiestrator weryfikuje go sam. — <dlaczego, data>
- **Brak odpowiedzi = ustal przyczynę.**

## 6. Lekcje
- **Każdą nową regułę lub awarię dopisujesz od razu** do `lekcje.md`.

## 7. Wznowienie
- **Po limicie, kompakcji, nowej sesji najpierw podręcznik** (§0).

## 8. Design system
- **Kolor i wygląd komponentu zmienia DS, nie makieta ani ekran.** — <dlaczego, data>
- <kto publikuje bibliotekę; gdzie są pliki; jak wersjonujemy>

## 9. Środowisko
- <decyzje o chmurze, buildach, platformach, równoważności platform>

## 10. Limity i jakość
- **Limity oceniaj po czasie do resetu, nie po samym procencie.**
- **Działająca aplikacja, nie wydmuszka:** dane z prawdziwego źródła albo trwałego zapisu, luki jawnie oznaczone, zapisy nie udają sukcesu. Czego nie da się zrobić porządnie do terminu, raportuje się wprost.
