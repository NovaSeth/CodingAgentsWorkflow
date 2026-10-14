## Co i dlaczego
<!-- 1–3 zdania. Zadanie: <id>. Brief: .workflow/tasks/<id>/brief.md -->

## Decyzje
<!-- Numery z ledgera: R-<AUTOR>-<n> / R<n>. Nowe decyzje zapisane przez .workflow/bin/ruling.sh -->

## Testy
- [ ] RED → GREEN pokazane w raporcie (`.workflow/tasks/<id>/report.md`)
- [ ] typecheck / lint / testy zielone (liczby: …)
- [ ] E2E gałęzi (jeśli dotyczy): …

## Recenzja
- [ ] Recenzja innego wykonawcy: `.workflow/tasks/<id>/review-r<k>.md` — Approved
- [ ] Ponowna recenzja zawężona (obowiązkowa przy danych, zapisach, autoryzacji, współbieżności)
- [ ] Przegląd bezpieczeństwa (jeśli diff dotyka auth, autoryzacji, zapisów, sekretów, linków, zależności)

## Definicja ukończenia
- [ ] Global Constraints z CLAUDE.md zachowane (tokeny, granice modułów, sekrety, idempotencja)
- [ ] Pakiety wspólne nie zmienione (albo: zadanie wspólne S<n> + akceptacja właściciela z CODEOWNERS)
- [ ] Drzewo czyste, każdy krok to osobny commit

🤖 Wspomagane przez agentów AI zgodnie z metodą `docs/workflow/metoda/`
