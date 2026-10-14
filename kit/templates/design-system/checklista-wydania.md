# Checklista wydania design systemu

- [ ] Zmiana zrobiona wyłącznie w bibliotece DS (nigdy jako nadpisanie w makietach).
- [ ] Zmiana w miejscu, jeśli się da (klucze bez zmian); nowy klucz ⇒ MAJOR.
- [ ] Audyt biblioteki czysty: 0 niezwiązanych wypełnień i obramowań, 0 tekstów bez stylu, 0 surowych odstępów i promieni, 0 domyślnych nazw warstw, każdy komponent ma opis.
- [ ] Pary kontrastu przechodzą we wszystkich trybach (tekst 4,5; UI i grafika 3,0).
- [ ] Wpis w CHANGELOG.md + podbity VERSION według semver.
- [ ] Eksport kluczy biblioteki (komponenty, ikony, zmienne, style) dla konsumentów.
- [ ] Commit + anotowany tag `ds-vX.Y.Z` (tag wskazuje na HEAD).
- [ ] Okładka i strona Changelog wygenerowane z gita i CHANGELOG (bez „-dirty”).
- [ ] Publikacja w narzędziu projektowym; opis zaczyna się od „X.Y.Z · <commit> · ds-vX.Y.Z”. Kto publikuje: <rola — rozstrzygnięte rulingiem>.
- [ ] Przebudowa makiet konsumentów (import po kluczu) → audyt warstw (0 warstw poza DS) → audyt pokrycia i kolizji.
- [ ] Ponowny eksport tokenów, ikon i komponentów do kodu; deterministyczne wygenerowanie motywu; test „tylko tokeny” i testy komponentów.
- [ ] Aktualizacja pliku statusu (aktualnie opublikowana wersja) i zamknięcie wątków komentarzy.
