# Kreator – własny kreator stron i aplikacji z AI

Kreator działa jak Lovable albo Base44. Opisujesz, co chcesz zbudować, a AI (Claude) tworzy działającą stronę lub aplikację: z bazą danych, logowaniem użytkowników, podglądem na żywo i publikacją jednym kliknięciem.

## Szybki start (na własnym komputerze)

Wymagany **Node.js 22.13 lub nowszy** (https://nodejs.org).

```bash
npm install
cp .env.example .env      # wpisz w .env swój ANTHROPIC_API_KEY
npm start
```

Otwórz **http://localhost:3000**, załóż konto i opisz swoją pierwszą stronę.

Klucz API założysz na https://console.anthropic.com (zakładka *API Keys*). Za zużycie AI płacisz według cennika Anthropic. Ile tokenów zużyłeś, widać w *Ustawieniach konta* i pod każdą odpowiedzią AI.

Bez klucza (albo z `npm run demo`) kreator działa w **trybie demo**. Zamiast AI generuje wtedy przykładową aplikację, żeby można było przetestować wszystkie funkcje.

## Funkcje

**Budowanie z AI**
- czat z AI, odpowiedź pojawia się na bieżąco; widać, który plik AI właśnie pisze
- generowanie działa w tle, więc możesz zamknąć kartę i wrócić później
- przycisk „Zatrzymaj”
- AI zmienia tylko potrzebne fragmenty plików (szybciej i taniej). Jeśli edycja się nie uda, sama się poprawia
- **tryb Rozmowa**: planowanie i pytania bez zmian na stronie
- **Wybierz element**: klikasz element w podglądzie i opisujesz, co w nim zmienić
- **Napraw z AI**: kreator wyłapuje błędy JavaScript na stronie i jednym kliknięciem wysyła je do AI
- załączniki-obrazy (szkic, zrzut ekranu, logo), także wklejane ze schowka (Ctrl+V). Można je zapisać w projekcie i użyć na stronie
- podpowiedzi kolejnych kroków po każdej odpowiedzi
- **instrukcje projektu**: stałe wytyczne dla AI, np. kolory marki, ton tekstów, dane firmy

**Wbudowany backend (jak w Base44)**
- każda wygenerowana aplikacja ma bazę danych i logowanie użytkowników (obiekt `window.app`), bez konfiguracji
- zakładka **Baza danych**: przeglądanie, dodawanie, edycja i usuwanie rekordów oraz zarządzanie kontami użytkowników aplikacji
- rekordy należą do użytkownika, który je utworzył, więc nikt inny nie może ich zmienić

**Edycja i pliki**
- podgląd w widoku komputera, tabletu i telefonu, wybór podstrony, otwieranie w nowej karcie
- edytor kodu z podświetlaniem składni: nowe pliki, zmiana nazwy, usuwanie, Ctrl+S
- wgrywanie obrazów, wideo, czcionek i PDF-ów do projektu
- historia wersji: każda zmiana AI i każdy ręczny zapis tworzy wersję, którą można przywrócić

**Płatności i domeny (jak w Lovable / Base44)**
- **Płatności Stripe**: podłączasz własne konto Stripe (przycisk „Płatności”), a AI buduje sklep, koszyk, subskrypcje lub darowizny. Klienci płacą na stronie Stripe kartą, BLIK-iem lub Przelewy24. Zamówienia widzisz w kreatorze.
- **Własna domena**: podłączasz np. `mojafirma.pl`. Kreator pokazuje rekordy DNS, sprawdza je i włącza stronę pod tą domeną z automatycznym HTTPS.

**Publikacja i projekty**
- publikacja pod własnym adresem, aktualizacja i cofnięcie publikacji
- pobieranie projektu jako ZIP; baza danych działa także po pobraniu
- konta użytkowników kreatora: każdy widzi tylko swoje projekty
- pulpit z miniaturami, wyszukiwarką, duplikowaniem, zmianą nazwy i usuwaniem
- jasny i ciemny motyw, wersja na telefon

## Jak AI używa bazy danych

Wygenerowane strony mają dostęp do obiektu `window.app` (oraz `window.kreator`, który działa nawet wtedy, gdy strona ma własną zmienną `app`):

```js
const zadania = app.db.collection('zadania');
await zadania.create({ tytul: 'Kupić mleko', zrobione: false });
await zadania.list({ where: { zrobione: false }, sort: '-created_at', mine: true });
await zadania.update(id, { zrobione: true });
await zadania.remove(id);

await app.auth.signUp({ email, password, name });
await app.auth.signIn({ email, password });
app.auth.onChange(user => { /* zalogowany lub null */ });
```

### Kto ma dostęp do danych

Uprawnienia każdej kolekcji są opisane w pliku projektu `database.rules.json`. AI tworzy go samo, a Ty możesz je zmienić w zakładce **Baza danych** przyciskiem „Zmień”:

```json
{
  "kontakt": { "read": "private", "write": "public" },
  "zadania": { "read": "owner",   "write": "auth" },
  "posty":   { "read": "public",  "write": "auth" }
}
```

- `read`: `public` (każdy) · `auth` (zalogowani) · `owner` (każdy widzi tylko swoje) · `private` (nikt na stronie, tylko Ty w panelu)
- `write`: `public` · `auth` · `none`
- `edit`: `owner` (rekord zmienia tylko autor) · `public` (każdy może zmieniać rekordy dodane anonimowo)

Dane z formularzy (kontakt, rezerwacje, zamówienia) powinny być `private`, a AI ustawia to automatycznie.

Podgląd niepublikowanej wersji działa pod tajnym, losowym adresem. Publicznie widać tylko to, co opublikujesz.

## Płatności Stripe

1. Załóż konto na https://stripe.com i skopiuj *Secret key* (Developers → API keys). Na początek użyj klucza testowego `sk_test_…`.
2. W kreatorze kliknij **Płatności** (ikona karty) i wklej klucz. Kreator sprawdzi go w Stripe.
3. Poproś AI np. „zrób sklep z 3 produktami i płatnością”. AI zapisze produkty i ceny w pliku `payments.json` (ceny w groszach), a na stronie użyje `app.payments.checkout()`.
4. (Zalecane) W Stripe dodaj webhook z adresem pokazanym w oknie „Płatności” i wklej jego *Signing secret* (`whsec_…`). Dzięki temu zamówienia zapiszą się nawet wtedy, gdy klient zamknie kartę przed powrotem na stronę.
5. Testowo zapłacisz kartą `4242 4242 4242 4242` (dowolna przyszła data i CVC). Gdy wszystko działa, podmień klucz na `sk_live_…`.

Bezpieczeństwo: ceny są tylko w `payments.json` (strona wybiera produkt i ilość, więc klient nie może zmienić ceny). Klucze Stripe są szyfrowane w bazie (AES-256-GCM, klucz z `SECRET_KEY`) i nigdy nie trafiają do przeglądarki. Webhooki są weryfikowane podpisem.

```js
const { products } = await app.payments.products();
await app.payments.checkout({ items: [{ id: 'kawa', quantity: 2 }], successUrl: new URL('dziekujemy.html', location.href).href });
const wynik = await app.payments.verify();   // na stronie podziękowania: { paid, amount, currency, email, items }
```

## Własne domeny

W oknie publikacji kliknij **Własna domena → Podłącz** i wpisz domenę. Kreator pokaże rekordy do ustawienia u rejestratora:
- **TXT** `_kreator.twojadomena.pl` – potwierdza, że domena należy do Ciebie;
- **A** (na adres `DOMAIN_IP`) albo **CNAME** (na `DOMAIN_CNAME_TARGET`) – kieruje domenę na serwer.

Po kliknięciu **Sprawdź** opublikowana strona działa pod Twoją domeną, a Caddy automatycznie wystawi certyfikat HTTPS. Domenę dostaje ten, kto pierwszy potwierdzi ją rekordem TXT.

## Wdrożenie na serwer

### Docker + HTTPS (zalecane)

Potrzebujesz serwera (VPS) z Dockerem i domeny, np. `mojadomena.pl`. W DNS ustaw rekordy A na IP serwera dla:
`kreator.mojadomena.pl`, `sites.mojadomena.pl` i `*.sites.mojadomena.pl`.

```bash
cp .env.example .env
```

W `.env` ustaw co najmniej: `ANTHROPIC_API_KEY`, `KREATOR_DOMAIN=kreator.mojadomena.pl`, `PUBLIC_URL=https://kreator.mojadomena.pl`, `SITES_HOST=sites.mojadomena.pl`, `SITES_WILDCARD=1`, `SITES_PROTOCOL=https`, `DOMAIN_IP=<IP serwera>`, `SECRET_KEY=<długi losowy ciąg>`.

```bash
docker compose up -d --build
```

Caddy (plik `Caddyfile`) sam wystawia certyfikaty HTTPS dla kreatora, każdej strony i własnych domen klientów.

Dane (baza SQLite) są zapisywane w wolumenie `kreator-data`. Kopię zapasową robisz, kopiując plik `kreator.db`.

### Adresy stron użytkowników (ważne dla bezpieczeństwa)

Strony generowane przez AI zawierają dowolny JavaScript, dlatego działają pod **innym adresem niż kreator**. Wybierz jeden wariant w `.env`:

| Wariant | Ustawienia | Kiedy |
|---|---|---|
| Osobny port | (domyślnie) strony na `PORT+1` | na własnym komputerze |
| Osobna domena | `SITES_HOST=sites.mojadomena.pl` | gdy z kreatora korzystasz tylko Ty lub zaufane osoby |
| **Subdomena dla każdej strony** | `SITES_HOST=sites.mojadomena.pl` + `SITES_WILDCARD=1` | **gdy kreator jest publiczny**: strony różnych osób są od siebie całkowicie odizolowane |
| Jedna domena | `SITES_MODE=same` | najprostszy hosting; strony działają w piaskownicy bez localStorage, więc logowanie w aplikacjach nie przetrwa odświeżenia |

Przy wariancie z subdomenami dodaj w DNS rekord `*.sites.mojadomena.pl` (oraz `sites.mojadomena.pl`) wskazujący na serwer. Potrzebny jest też certyfikat dla `*.sites.mojadomena.pl`. Najprościej: domena w Cloudflare z włączonym proxy albo Caddy z wyzwaniem DNS. Opublikowane strony będą wtedy pod adresem `nazwa-strony.sites.mojadomena.pl`.

Za reverse proxy (Nginx, Caddy, Cloudflare, Render) ustaw `PUBLIC_URL=https://…` oraz `TRUST_PROXY=1`, jeśli proxy nie jest w sieci prywatnej.

### Pozostałe ustawienia

Wszystkie opcje z opisami są w pliku `.env.example`: model AI, poziom wysiłku, limit wiadomości na godzinę i wyłączenie rejestracji.

## Testy

```bash
npm test
```

Testy uruchamiają kreator w trybie demo z tymczasową bazą i sprawdzają konta, izolację użytkowników, generowanie, wersje, publikację, reguły dostępu do danych i parser odpowiedzi AI.

## Struktura projektu

```
server/index.js    serwer kreatora: konta, projekty, czat z AI, pliki, publikacja, ZIP, panel bazy
server/ai.js       generowanie z Claude: zadania w tle, prompt, stosowanie zmian, automatyczna naprawa
server/sites.js    serwer stron użytkowników + API backendu aplikacji (baza danych, logowanie)
server/db.js       baza SQLite (wbudowana w Node.js)
server/payments.js płatności Stripe (Checkout, weryfikacja, webhooki, zamówienia)
server/domains.js  własne domeny (weryfikacja DNS)
server/secrets.js  szyfrowanie kluczy projektów
server/mock.js     odpowiedzi trybu demo
public/            interfejs kreatora (index.html, app.js, app.css) i parser odpowiedzi AI
Caddyfile          HTTPS i automatyczne certyfikaty (produkcja)
sites-static/      sdk.js (window.app dla stron) i bridge.js (błędy + wybór elementu w podglądzie)
tests/             testy automatyczne (npm test)
```
