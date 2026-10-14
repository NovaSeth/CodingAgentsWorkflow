# Profil stosu: TypeScript

Przełożenie metody (`docs/workflow/metoda/`, zwłaszcza `05-jak-kodowac.md`) na TypeScript (Node ≥ 24 z natywnym usuwaniem typów; backend, web, React Native).

## Bramka zadania
```bash
bash .workflow/bin/heavy.sh npm run typecheck
bash .workflow/bin/heavy.sh npm run lint
bash .workflow/bin/heavy.sh npm test            # node --test --test-concurrency=2
bash .workflow/bin/check-secrets.sh; echo "kod $?"
```
Limity workerów w briefach: `node --test --test-concurrency=2`, Jest `--maxWorkers=2`, Vitest `--maxWorkers=2`. Sprawdź, jak Twój menedżer pakietów przekazuje `--` (pnpm ≥ 10 przekazuje je dosłownie, Jest daje wtedy „No tests found”).

## Układ repo (szkielet `setup --mode new --stack typescript`)
```
src/platform/         HTTP, auth, ctx (dzierżawca, aktor), baza, idempotencja, zdarzenia — zadania S<n>
src/modules/<m>/      index.ts (publiczny) · router.ts · service.ts · repo.ts · README.md
tests/architecture.test.ts   granice modułów (z kontrolą samego siebie)
eslint.config.mjs     no-restricted-imports: obrona w głąb
```
W monorepo (pnpm/npm workspaces) dochodzą `packages/contract` (zod + typy dla klienta i serwera), `packages/fixtures` (świat danych z KANON), `packages/tokens`, `packages/ui`, `apps/*`.

## Wzorce
- **Kontrakt:** zod; `XInput = z.input`, `X = z.infer`; ścisłe obiekty (`.strict()`), limity długości (`.max()`), OpenAPI z kontraktu (np. `@hono/zod-openapi`). Klient typowany z tras serwera.
- **Zapisy:** jedna funkcja wysyłająca z `Idempotency-Key` (`crypto.randomUUID()`), `canRetry`, koperta zapisu poza komponentem (magazyn sesji), blokada w `useRef`, zwolnienie w `onSettled` (TanStack Query). Serwer: odcisk `sha256(aktor|metoda|ścieżka|kanoniczny JSON)`, odpowiedź w tej samej transakcji co zmiana i zdarzenie.
- **Baza w testach:** `node:sqlite` w pamięci albo kontener; testy modułów sprawdzają izolację dzierżawców, zdarzenie po zapisie i powtórkę idempotentną.
- **Testy komponentów:** backend mock w procesie (`app.request`), bez sieci, reset przed renderem.
- **Tokens only (UI):** `.workflow/templates/code/global-constraints.test.ts`.
- **E2E:** Playwright (web) / Detox lub Maestro (mobile) — zawsze z jawnym celem i rozgrzewką.

## Bezpieczeństwo (specyficzne)
- `npm ci` / `pnpm install --frozen-lockfile`; skrypty instalacyjne: pnpm `onlyBuiltDependencies` / `allowBuilds`, npm `--ignore-scripts` tam, gdzie się da.
- `npm audit --omit=dev --audit-level=high` w bramce wydania.
- Zmienne `EXPO_PUBLIC_*` / `VITE_*` / `NEXT_PUBLIC_*` trafiają do paczki klienta: nigdy sekrety. `check-key-leak.sh --dir dist --forbid-name <NAZWA_SEKRETU>`.
