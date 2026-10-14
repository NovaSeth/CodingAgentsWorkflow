# Kontrola krzyżowa — format wpisu (DSC-27)

Wstawia autor scalenia, bezpośrednio po bloku, którego dotyczy. Kontroluj każde twierdzenie, od którego zależy fala, trudność, zakres albo pozycja NO.

## Zasady
- Kontrola jest niezależna od bloku: inne źródło albo nowe zapytanie, nie ponowne czytanie tego samego URL.
- Źródło pierwotne (dokumentacja, przepis, strona producenta) wygrywa ze streszczeniem.
- Odpowiedź z zapytania zapisz w `research/raw/` i wskaż ścieżkę.
- Wynik OBALONE albo DOPRECYZOWANE → popraw `research/SYNTEZA-faktow.md` (sekcja poprawek z kontroli krzyżowych) i zakres, którego dotyczy.

## Wpis

```markdown
**Kontrola krzyżowa: <twierdzenie skrótem>** (niezależna od bloku <X>, <RRRR-MM-DD>)
- Twierdzenie: „<dosłownie z bloku>”
- Źródła: <URL pierwotny> · <zapytanie + odpowiedź: research/raw/<plik>>
- Wynik: POTWIERDZONE | OBALONE | DOPRECYZOWANE
- Konsekwencja produktowa: <fala / trudność / zakres / nowe sformułowanie>
```
