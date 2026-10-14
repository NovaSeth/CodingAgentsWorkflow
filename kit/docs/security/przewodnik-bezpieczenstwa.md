# Przewodnik bezpieczeństwa: <projekt>

Czytają: agent `security` przed każdym przeglądem, implementer przy zadaniach dotykających obszarów wrażliwych, orkiestrator przed wydaniem. Ustalenie z przeglądu, które wynika z ogólnej reguły, dopisz do checklisty (§3). Reguły i procedura przeglądów: `docs/workflow/metoda/09-bezpieczenstwo.md`.

Przeglądy: `docs/security/przeglad-<data>.md`. Ustalenia: `SEC-<n>` (audyt) i `SEC-<zadanie>-<n>` (PR).

---

## 1. Model zagrożeń

### Aktorzy
| Aktor | Zaufanie | Przykład zagrożenia |
|---|---|---|
| Sesja użytkownika | uwierzytelniony, niezaufany co do obiektów | odczyt cudzych rekordów przez podmianę identyfikatora (BOLA) |
| Menedżer / administrator | podwyższone | nadużycie uprawnień, eskalacja przez źle zdefiniowane zakresy |
| Token integracji (API, MCP) | ograniczony zakresem | działanie poza zakresem, masowy eksport |
| Inny dzierżawca | brak | dostęp do danych innej firmy |
| Złośliwa aplikacja lub strona na urządzeniu | brak | przechwycenie deep linku, odczyt magazynu, schowek |
| Złodziej urządzenia | fizyczny dostęp | odczyt danych lokalnych, sesja po reinstalacji |
| Atakujący w sieci | brak | cleartext, MITM, DNS rebinding na usługi lokalne |
| Deweloper / agent AI | zaufany, ale omylny | sekret w repo lub logu, trasa dev w wydaniu, wyłączona walidacja |
| Łańcuch dostaw | zewnętrzny | złośliwy pakiet, skrypt instalacyjny, typosquatting |

### Aktywa
- Dane osobowe: <jakie>.
- Poświadczenia: <typy i prefiksy tokenów>.
- Integralność danych w systemach zewnętrznych: <jakich>.
- Dostępność i budżet zapytań do <system zewnętrzny>.

### Granice zaufania
- Klient ↔ BFF / API: klient jest niezaufany.
- BFF ↔ API główne: tożsamość z poświadczenia, nie z nagłówków BFF.
- API ↔ system zewnętrzny: <jeśli klucz jest wspólny dla firmy, API główne samo pilnuje uprawnień per użytkownik>.
- Aplikacja ↔ system operacyjny: deep linki, powiadomienia, kopie zapasowe, magazyn kluczy, schowek.
- Repo i maszyna deweloperska ↔ świat: pliki env, katalogi danych, logi, porty lokalne.

## 2. Zasady
- Dzierżawca i użytkownik tylko z poświadczenia. Każdy odczyt i zapis obiektu sprawdza dzierżawcę **i** prawo do obiektu. Cudzy obiekt daje 404.
- Sekrety tylko po stronie serwera (env 0600, `.gitignore`). Nigdy w publicznych zmiennych klienta, repo, logach, raportach ani błędach.
- Narzędzia dev za podwójną bramką: flaga środowiska serwera **i** build debug klienta. Produkcja z flagą dev odmawia startu. Jawna zmienna środowiska wygrywa z plikiem env.
- Każde wejście ma walidację schematem z limitem długości, obiekty są ścisłe. Limity rozmiaru treści. Limity zapytań per poświadczenie.
- Fail closed: brak konfiguracji oznacza odmowę.
- Krótkie tokeny dostępu, rotujący token odświeżania, unieważnienie przy wylogowaniu.
- Tokeny z prefiksem typu, bo prefiks umożliwia skanowanie.

## 3. Checklisty

### 3.1 Klient (mobilny / webowy)
- [ ] Tokeny tylko w bezpiecznym magazynie (dostęp tylko na tym urządzeniu); nigdy w bazie lokalnej, magazynie klucz-wartość, localStorage ani cache zapytań.
- [ ] Dane osobowe lokalnie z TTL; czyszczone przy końcu sesji i zmianie konta.
- [ ] Brak logowania tokenów, danych klientów i treści notatek.
- [ ] Trasy dev nieosiągalne w wydaniu (test z `debug=false`).
- [ ] Parametry deep linków niezaufane: żadnej akcji bez potwierdzenia, wolny tekst nie jest pokazywany jako fakt.
- [ ] Otwieranie URL z listy dozwolonych (trasy wewnętrzne, `tel:` z cyframi, mapy) albo https z serwera; nigdy `javascript:`, `file:` ani dowolne schematy.
- [ ] Powiadomienia bez danych wrażliwych na ekranie blokady.
- [ ] Brak WebView (jeśli jest: lista dozwolonych źródeł, bez JS dla obcych treści, bez mostu natywnego).
- [ ] Adres backendu w wydaniu to https.
- [ ] Lokalne uwierzytelnienie chroni wszystkie trasy; atrapa nie jest przedstawiana jako zabezpieczenie.
- [ ] OAuth przez przeglądarkę systemową z PKCE i zweryfikowanymi linkami aplikacji.
- [ ] Aktualizacje OTA wyłączone albo podpisane.
- [ ] Sesja nie przeżywa reinstalacji.
- [ ] Web: CSP, `HttpOnly`/`Secure`/`SameSite` na ciasteczkach, ochrona CSRF dla sesji ciasteczkowych.
- [ ] Konfiguracja platformy sprawdzana skryptem po wygenerowaniu (manifest, plist, CSP): kopie zapasowe, cleartext, eksportowane komponenty z listy dozwolonych, debuggable tylko w debug.

### 3.2 BFF / brama API
- [ ] Wszystkie trasy z walidacją schematem.
- [ ] Middleware bramki dev zarejestrowany **przed** middleware biznesowym (obejmuje przyszłe trasy dev).
- [ ] Limity treści; limity zapytań per IP i per sesja na trasach logowania.
- [ ] W produkcji odmowa startu z flagą dev; wymagane jawne źródło danych.
- [ ] Błędy bez stosu i szczegółów; logi bez danych żądań.
- [ ] Log błędu 500: metoda, ścieżka (bez zapytania), klasa błędu — bez komunikatu wyjątku (może zawierać dane wejściowe), nagłówków i treści; test ze szpiegiem na logu i syntetycznym sekretem.
- [ ] Domyślnie loopback (dedykowana zmienna, nie ogólne `HOST`); lista dozwolonych `Host` (421) przeciw DNS rebinding; TLS + HSTS w produkcji.
- [ ] Kolejki zapisów per sesja, nie globalne.

### 3.3 API główne
- [ ] Każda trasa ma zakres (`read` / `write`); operacje administracyjne tylko dla administratora.
- [ ] **Autoryzacja obiektowa** na liście, odczycie, zmianie i akcjach: dzierżawca **i** właściciel / rola. Test z dwoma użytkownikami jednego dzierżawcy dla każdego nowego zasobu (także przez token integracji).
- [ ] Autoryzacja na poziomie pól (projekcje zależne od roli; nigdy hashe w odpowiedzi).
- [ ] Nowa trasa bez uwierzytelnienia: uzasadnienie w PR + własny limit.
- [ ] Tokeny ≥ 32 losowe bajty, przechowywane jako hash, porównanie w stałym czasie.
- [ ] Rotacja tokenu odświeżania z wykrywaniem ponownego użycia (rodzina unieważniana) i bezwzględnym limitem.
- [ ] Hasła: scrypt / argon2id z wyrównaniem czasu; licznik prób per konto rezerwowany przed sprawdzeniem hasła; atrapa hasha dla nieznanych kont (brak wyroczni istnienia konta); blokada progresywna; `429` z `Retry-After`.
- [ ] Klucz idempotencji per dzierżawca i użytkownik, z odciskiem żądania, walidacją formatu i długości.
- [ ] Klient systemu zewnętrznego: tylko https; klucz nigdy w logach, monitorze ani błędach; zarezerwowane parametry nienadpisywalne; timeouty; budżet zapytań per poświadczenie.
- [ ] Limity uploadu: rozmiar, liczba, typ po sygnaturze.
- [ ] Plik bazy 0600, katalog danych 0700, szyfrowane kopie; replika = dane osobowe (retencja, usuwanie).
- [ ] Monitor i logi przez funkcję redakcji; dane osobowe w monitorze tylko lokalnie.
- [ ] Lista zaufanych proxy dla adresu klienta (nie ogólna flaga zaufania).

### 3.4 Sekrety
- [ ] `check-secrets.sh` w hooku `pre-push` i w CI (bez potoku, sprawdzany kod wyjścia).
- [ ] `check-key-leak.sh --history --dir <artefakt>` przed wydaniem i po zmianie env.
- [ ] Nowy typ sekretu = nowy wzorzec w skanerze.
- [ ] Syntetyczne wartości w testach oznaczone `SYNTH`.
- [ ] Wyciek: natychmiastowa rotacja, wpis w ledgerze, sprawdzenie historii.

### 3.5 Zależności i łańcuch dostaw
- [ ] Nowa zależność: nazwa (typosquatting), autor, pobrania, data publikacji, skrypty instalacyjne.
- [ ] Lista pakietów, które mogą uruchamiać skrypty budowania, tylko z uzasadnieniem.
- [ ] Lockfile w repo; instalacja z `--frozen-lockfile` w bramce; audyt zależności produkcyjnych na poziomie high przed wydaniem (podatności narzędzi buildu osobno: override albo ruling z akceptacją).
- [ ] Łatki zależności przypięte do dokładnej wersji, z komentarzem-znacznikiem i powodem.
- [ ] Rozważ minimalny wiek wydania pakietu.

### 3.6 Skrypty i CI
- [ ] Polecenia przez `exec` z tablicą argumentów; zmienne w cudzysłowach; `eval` tylko na wartościach z repo.
- [ ] Pliki z poświadczeniami 0600 w katalogach 0700, poza gitem; logi testów i kolejek z redakcją.
- [ ] CI: sekrety jako sekrety CI, minimalne uprawnienia tokenu, akcje przypięte do SHA, bez `pull_request_target` z checkoutem PR.

### 3.7 Powierzchnia narzędzi dla agentów AI (MCP, integracje LLM)
- [ ] Niezaufane pola tekstowe wymienione w kopercie wyniku; instrukcje serwera mówią, że to dane, nie polecenia.
- [ ] Usuwanie znaków sterujących, zerowej szerokości i bidi; przycinanie długich pól.
- [ ] Brak narzędzi wysyłających dane na zewnątrz (e-mail, SMS, webhook) bez osobnego przeglądu i obowiązkowego potwierdzenia użytkownika.
- [ ] Jeden rekord na wywołanie, bez operacji masowych i usuwania; budżet zapisów na sesję; zapisy przypisane do poświadczenia.
- [ ] Zapisy nieodwracalne tylko z potwierdzeniem człowieka.
- [ ] Adnotacje narzędzi i lista narzędzi pod testem snapshotowym.
- [ ] Bez przekazywania tokenów dalej; tokeny związane z odbiorcą.

## 4. Co i jak testować

### 4.1 Testy automatyczne
| Obszar | Test | Gdzie |
|---|---|---|
| BOLA w dzierżawcy | dwóch użytkowników; A dostaje 404 na obiektach B (także przez token integracji) | <ścieżka> |
| Izolacja dzierżawców | dzierżawca X nie widzi Y | |
| Zakresy | token tylko do odczytu → 403 na zapisach; admin wymagany | |
| Bramki dev | 404 bez flagi; nagłówek ignorowany; produkcja + dev → odmowa startu | |
| Host | obcy `Host` → 421 | |
| Sesje (wstrzyknięty zegar) | TTL, rotacja, ponowne użycie refresh zabija rodzinę, wylogowanie | |
| Logowanie | blokada, limit per IP za BFF, identyczna odpowiedź dla nieznanych kont | |
| Limity | 413 dla zbyt dużej treści, 400 dla złego typu pliku | |
| Sekrety w logach | syntetyczne wartości `SYNTH` w logach, monitorze, błędach, odpowiedziach | |
| Klient | trasy dev nieosiągalne w wydaniu; lista dozwolonych linków; magazyn bezpieczny i czyszczony | |
| Konfiguracja wydania | skrypt sprawdzający manifest / plist / CSP z fixtures mutacyjnymi | |

### 4.2 Narzędzia statyczne
Semgrep · Gitleaks / TruffleHog · `npm/pnpm audit` / osv-scanner · MobSF (binaria mobilne) · `check-secrets.sh` · `check-key-leak.sh`.

### 4.3 Testy dynamiczne (tylko własny stos lokalny)
OWASP ZAP sterowany OpenAPI · mitmproxy · fuzzing deep linków · ręczne próby identyfikatorów innego dzierżawcy.
**Zakazane:** testy obciążeniowe i skany systemów zewnętrznych, stage i produkcji bez zgody.

## 5. Wymagania wydania

### Wydanie testowe
- [ ] Brak otwartych High i Critical; Medium mają zadania z terminami.
- [ ] Autoryzacja obiektowa z testami dwóch użytkowników.
- [ ] Brak tras dev w wydaniu; kopie zapasowe wyłączone; lokalne narzędzia utwardzone.
- [ ] Czyste skany sekretów, wycieków i zależności produkcyjnych.
- [ ] Usługi tylko przez TLS albo loopback testera.
- [ ] Osobne konta testerów; klucze systemów zewnętrznych tylko do środowisk demo.

### Produkcja (dodatkowo)
- [ ] Krótki token dostępu, bezwzględny limit sesji, prawdziwe lokalne uwierzytelnienie.
- [ ] Wszystkie limity; TLS 1.2+, HSTS, nagłówki bezpieczeństwa; niepubliczne OpenAPI; loopback za reverse proxy.
- [ ] Menedżer sekretów, rotacja kluczy, klucze per środowisko.
- [ ] Szyfrowane kopie zapasowe; retencja zgodna z RODO dla replik i dzienników zdarzeń.
- [ ] Ślad audytowy po ID poświadczenia; alerty na serie 401, 403 i 429.
- [ ] Skan binariów i ręczny test dynamiczny bez High; audyt najmocniejszym modelem.
- [ ] Klucz podpisu wydania poza repo, kopia u PO.

## 6. Standardy zewnętrzne
OWASP MASVS / MASTG · OWASP Mobile Top 10 · OWASP API Security Top 10 · OWASP ASVS · ściągawki OWASP · RFC 9700 (OAuth 2.0 Security BCP) · dokumentacja platform i frameworków projektu.
