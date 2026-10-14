# Profil stosu: Python

Przełożenie metody (`docs/workflow/metoda/`, zwłaszcza `05-jak-kodowac.md`) na Pythona (≥ 3.11; FastAPI, Django, usługi i skrypty).

## Bramka zadania
```bash
bash .workflow/bin/heavy.sh mypy src
bash .workflow/bin/heavy.sh ruff check .
bash .workflow/bin/heavy.sh lint-imports
bash .workflow/bin/heavy.sh pytest -n 2          # pytest-xdist; nigdy -n auto przy wielu agentach
bash .workflow/bin/check-secrets.sh; echo "kod $?"
```

## Układ repo (szkielet `setup --mode new --stack python`)
```
src/<pkg>/platform/        HTTP, auth, ctx, baza, idempotencja, zdarzenia — zadania S<n>
src/<pkg>/modules/<m>/     __init__.py (publiczny) · router.py · service.py · repo.py · README.md
tests/test_architecture.py granice modułów (AST, z kontrolą samego siebie)
pyproject.toml             ruff (z regułami S/bandit), mypy strict, import-linter
```

## Wzorce
- **Kontrakt:** Pydantic v2 (`model_config = ConfigDict(extra="forbid")`, `Field(max_length=…)`); OpenAPI z FastAPI; klient TS generowany z OpenAPI (`openapi-typescript`), jeśli front jest w TS.
- **Zapisy:** middleware idempotencji: rezerwacja klucza w tabeli `(tenant, actor, key)` z odciskiem `sha256`, odpowiedź zapisana w tej samej transakcji co zmiana i zdarzenie (outbox). Django: `transaction.atomic()` + `select_for_update` na rekordzie klucza.
- **Dzierżawca:** z poświadczenia w zależności (`Depends(current_ctx)`) / middleware; repozytoria przyjmują `ctx` i zawsze filtrują `tenant_id`. Django: manager domyślny filtrujący po dzierżawcy + test, że surowy `objects` nie jest używany w modułach.
- **Testy:** `pytest` + baza w transakcji per test; testy modułów: izolacja dzierżawców, zdarzenie po zapisie, powtórka idempotentna, macierz dostępu.

## Bezpieczeństwo (specyficzne)
- `pip install --require-hashes` z lockiem (`uv pip compile --generate-hashes` / `pip-tools`) w CI i wydaniu.
- `pip-audit` (albo osv-scanner) w bramce wydania; `ruff` z regułami `S` (bandit) w bramce zadania.
- Django: `DEBUG=False` w produkcji pilnowane testem startu; `ALLOWED_HOSTS` jawne; sekrety tylko ze zmiennych środowiska.
