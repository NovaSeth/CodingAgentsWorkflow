// Test strażnik „tylko tokeny” — szablon (Jest / Vitest). Dopasuj SRC, wykluczenia i reguły do stosu.
// Pilnuje Global Constraint: wszystkie kolory, odstępy, promienie i typografia pochodzą z pakietu tokenów.
// Ma kontrolę samego siebie: znane złe wejście musi zostać złapane, a znane dobre — nie.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', 'src');
const EXCLUDE = [/\.generated\./, /iconData\.ts$/, /theme\.ts$/];

const RULES: Array<[string, RegExp]> = [
  ['kolor hex', /#[0-9a-fA-F]{3,8}\b/],
  ['rgb/hsl', /\b(rgba?|hsla?)\s*\(/],
  ['fontSize liczbowy', /fontSize\s*:\s*\d/],
  ['fontWeight', /fontWeight\s*:/],
  ['fontFamily tekstowy', /fontFamily\s*:\s*['"`]/],
  ['lineHeight / letterSpacing liczbowy', /(lineHeight|letterSpacing)\s*:\s*-?\d/],
  ['wymiar / odstęp liczbowy ≠ 0',
    /\b(width|height|minWidth|maxWidth|minHeight|maxHeight|padding\w*|margin\w*|gap|rowGap|columnGap|border\w*(Width|Radius)|top|left|right|bottom)\s*:\s*-?[1-9]\d*(\.\d+)?\b/],
  ['atrybut JSX liczbowy', /\b(width|height|size|strokeWidth|r|rx|ry)=\{\s*\d/],
  ['kolor jako tekst w atrybucie', /\b(fill|stroke|backgroundColor|borderColor|color)=["'](?!none|currentColor)/],
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx?|jsx?)$/.test(f) && !EXCLUDE.some((re) => re.test(p)) ? [p] : [];
  });
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const offenders = (code: string) => RULES.filter(([, re]) => re.test(code)).map(([name]) => name);

describe('Global Constraints: tylko tokeny', () => {
  const all = files(SRC);

  it('skanuje wszystkie pliki komponentów (zakres)', () => {
    expect(all.length).toBeGreaterThan(5); // dopasuj do liczby komponentów
  });

  it('reguły naprawdę coś wykrywają (kontrola samego testu)', () => {
    expect(offenders("backgroundColor: '#2875D1'")).toContain('kolor hex');
    expect(offenders('padding: 12')).toContain('wymiar / odstęp liczbowy ≠ 0');
    expect(offenders('padding: theme.space.md')).toEqual([]);
    expect(offenders('margin: 0')).toEqual([]);
  });

  it('brak wartości wizualnych na sztywno', () => {
    const bad = all.flatMap((p) => {
      const code = stripComments(readFileSync(p, 'utf8'));
      return code.split('\n').flatMap((line, i) =>
        offenders(line).map((rule) => `${relative(SRC, p)}:${i + 1} ${rule}: ${line.trim()}`));
    });
    expect(bad).toEqual([]);
  });
});
