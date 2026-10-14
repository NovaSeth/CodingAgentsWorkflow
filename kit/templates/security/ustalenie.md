### SEC-<zadanie>-<n> (<Critical|High|Medium|Low|Info>): <krótki tytuł>
- **Obszar / miejsce:** <obszar> · `ścieżka/plik:LINIA[,LINIA]`
- **Opis:** <co robi kod, z dowodem plik:linia; jakiej kontroli brakuje>
- **Scenariusz nadużycia:** <aktor z modelu zagrożeń, warunki, klasa problemu (np. API1 BOLA), skutek> — bez exploita krok po kroku
- **Uzasadnienie wagi:** wektor <sieć/lokalnie>, uprawnienia <brak/niskie/wysokie>, interakcja <tak/nie>, wpływ C/I/A <…>; <tylko lokalny stos dev → obniżona>; <założenie, które zmieniłoby wagę>
- **Rekomendacja:** <poprawka; decyzja polityki od PO, jeśli potrzebna>
- **Test:** <jednostkowy / integracyjny / E2E / skrypt / narzędzie, które udowodni poprawkę>
- **Relacja:** <nowe | pogarsza SEC-x | naprawia SEC-y>
