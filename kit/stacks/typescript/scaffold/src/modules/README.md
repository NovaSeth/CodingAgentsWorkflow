# Moduły domenowe

Każdy moduł w `src/modules/<nazwa>/`:
- `index.ts` — interfejs publiczny (jedyne miejsce, które importują inne moduły),
- `router.ts` / `service.ts` / `repo.ts` — warstwy; tabele z prefiksem `<nazwa>_`,
- `README.md` — szablon: `.workflow/templates/code/module-README.md`.

Reguły (pilnuje `tests/architecture.test.ts` i ESLint):
- import innego modułu tylko przez jego `index.ts`;
- `src/platform` nie importuje modułów;
- dzierżawca i aktor tylko z poświadczenia (`ctx`), każde zapytanie filtruje po dzierżawcy;
- każda zmiana stanu emituje zdarzenie w tej samej transakcji.
