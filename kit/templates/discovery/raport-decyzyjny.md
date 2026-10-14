# Raport decyzyjny: budowa z części

Jeden samodzielny plik HTML złożony z numerowanych fragmentów. Agent edytuje albo generuje jedną sekcję bez dotykania całości.

```text
raport/
  01-head.part 02-css.part 03-hero.part
  04-odpowiedz.part     # teza w jednym zdaniu + liczniki + zakres w skrócie + N powodów
  05-dowody.part        # najmocniejszy dowód (pary kontrolowane)
  06-must.part 07-nice.part 08-later-nie.part
  09-ryzyka.part        # Kwestia | Co mówią dane | Rekomendacja (do dyskusji) + luki blokujące + 3 akcje z terminami
  10-<strumień>.part …  # dowody per strumień
  13-dodatek.part       # GENEROWANY przez gen_dodatek.py (skrypt projektu) z data/*.json (nie edytuj ręcznie)
  14-metoda.part        # liczniki, reguły, „czego to badanie nie dowodzi”, technika | do czego | ograniczenie
  15-close.part
budowa: python3 gen_dodatek.py && cat 0*.part 1*.part > Raport.html
```

## Karta pozycji MUST / NICE
```text
N. <Tytuł>
<co, jedną linią> · tagi: <kod potrzeby> <warunek | obowiązek prawny | x z N> <koszt S/M/L> [dowód ▸]
  Dlaczego tu jest · Jak robi to rynek (liczby, najlepsze wdrożenie) · Kto za to płaci
  · Ryzyko techniczne · Granica, której nie przekraczamy w komunikacji
```

## Pozycja NO
<pozycja> — blokuje: „<cytat / przepis / liczba>” (<źródło>). Grupa: niewykonalne / wykonalne bez popytu / pułapka techniczna.

## Po wygenerowaniu
- [ ] Sprawdź ręczne poprawki stylu nadpisane przez generator.
- [ ] Sprawdź linki rejestru (status HTTP) i obrazy.
