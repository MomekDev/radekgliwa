// Tryb DEMO: udaje odpowiedź AI, gdy nie ma klucza API (do testowania funkcji aplikacji).
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mockResponse(project, prompt) {
  const existing = project.files['index.html'];
  if (existing && existing.includes('<!--sekcje-->')) {
    const section = `    <section class="card"><h2>${esc(prompt.slice(0, 60))}</h2><p>Sekcja dodana na prośbę: „${esc(prompt)}”.</p></section>\n    <!--sekcje-->`;
    return `(Tryb demo) Dodaję nową sekcję do strony.

<file path="index.html">
${existing.replace('    <!--sekcje-->', section).trimEnd()}
</file>

- Dodano sekcję „${esc(prompt.slice(0, 40))}”`;
  }
  const title = esc(prompt.split('\n')[0].slice(0, 60));
  return `(Tryb demo – brak klucza API, więc to przykładowa strona) Tworzę stronę: ${title}.

<file path="index.html">
<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header class="hero">
    <h1>${title}</h1>
    <p>Przykładowa strona wygenerowana w trybie demo.</p>
    <button id="btn">Kliknij mnie</button>
    <p id="out"></p>
  </header>
  <main>
    <section class="card"><h2>O nas</h2><p>Treść przykładowa.</p></section>
    <!--sekcje-->
  </main>
  <script src="script.js"></script>
</body>
</html>
</file>

<file path="style.css">
body { margin: 0; font-family: system-ui, sans-serif; background: #f6f7fb; color: #1d1d1f; }
.hero { padding: 64px 24px; text-align: center; background: linear-gradient(135deg, #6366f1, #ec4899); color: #fff; }
.hero button { padding: 12px 24px; border: 0; border-radius: 999px; font-size: 16px; cursor: pointer; }
main { max-width: 860px; margin: 32px auto; padding: 0 16px; display: grid; gap: 16px; }
.card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,.06); }
</file>

<file path="script.js">
let n = 0;
document.getElementById('btn').addEventListener('click', () => {
  n++;
  document.getElementById('out').textContent = 'Kliknięto ' + n + ' raz(y)';
});
</file>

- Utworzono index.html, style.css i script.js
- Przycisk liczy kliknięcia`;
}
