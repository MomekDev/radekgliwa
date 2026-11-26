# Kreator – własny kreator stron z AI (jak Lovable / Bolt)

## Uruchomienie
```bash
npm install
export ANTHROPIC_API_KEY=twój_klucz   # klucz z console.anthropic.com
npm start                              # http://localhost:3000
```
Bez klucza (lub z `npm run demo`) aplikacja działa w TRYBIE DEMO – zamiast AI generuje przykładową stronę, żeby można było testować funkcje.

Opcjonalne zmienne: `PORT` (domyślnie 3000), `MODEL` (domyślnie `claude-opus-5-5`), `EFFORT` (`low`/`medium`/`high`, domyślnie `medium`).

## Funkcje
- Pulpit: tworzenie projektu z opisu (+ przykładowe pomysły, załączanie obrazów), lista projektów z miniaturami, zmiana nazwy, duplikowanie, usuwanie
- Czat z AI ze strumieniowaniem odpowiedzi na żywo, przycisk „Zatrzymaj”, załączniki-obrazy (szkice, zrzuty ekranu)
- Podgląd na żywo: komputer / tablet / telefon, wybór podstrony, odświeżanie, otwieranie w nowej karcie
- Edytor kodu: lista plików, edycja, zapis (Ctrl+S), nowy plik, zmiana nazwy, usuwanie
- Historia wersji: każda zmiana AI i ręczna tworzy wersję, przywracanie jednym kliknięciem (także z czatu)
- Publikacja pod stałym linkiem `/p/<id>/`, aktualizacja i cofnięcie publikacji
- Pobieranie projektu jako ZIP

## Struktura
- `server.js` – serwer Express: API projektów, czat z Claude (SSE), podgląd, publikacja, ZIP
- `mock.js` – odpowiedzi trybu demo
- `public/` – interfejs (`index.html`, `app.js`, `app.css`) i wspólny parser odpowiedzi AI (`parser.js`)
- `data/projects/*.json` – zapisane projekty
