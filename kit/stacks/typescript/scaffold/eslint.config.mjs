// Granice modułów (Global Constraint): moduł importuje inny moduł tylko przez jego index.ts,
// platforma nie importuje modułów. Lint to obrona w głąb (zakłada płaskie moduły; przy podkatalogach może dać
// fałszywe trafienia) — rozstrzyga tests/architecture.test.ts.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', '.worktrees', '.workflow', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly' },
    },
  },
  {
    files: ['src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ regex: '^\\.\\./(?!\\.)[^/]+/(?!index(\\.ts)?$).+', message: 'Import innego modułu tylko przez jego index.ts' }],
      }],
    },
  },
  {
    files: ['src/platform/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ regex: '/modules/', message: 'Platforma nie importuje modułów' }] }],
    },
  },
);
