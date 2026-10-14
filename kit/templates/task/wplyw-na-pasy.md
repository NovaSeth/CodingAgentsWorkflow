# Zmiany w pasach po S<n> (PR #<x>)

Zrób jako osobny commit `refactor(<obszar>): przepięcie po S<n>` — po `git merge origin/main`. Potem QA dotkniętych <ekranów / modułów> (<co się widocznie zmienia>).

- **Wszystkie pasy:** <zamiany API / komponentów; usuń lokalne obejścia; usuń znaczniki TODO(S<n>)>
- **<Pas A>:** <plik:linia → dokładna zamiana>
- **<Pas B>:** …
- Oczekiwany szum w QA: <znana, przyjęta różnica + ruling>

Przed scaleniem S<n> orkiestrator wykonał próbne scalenie każdego pasa (`git merge --no-commit` + `--abort`) i spisał wpływ powyżej.
