// Tryb DEMO: udaje odpowiedź AI, gdy nie ma klucza API – pozwala przetestować wszystkie funkcje kreatora.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mockResponse(project, req) {
  const prompt = req.message;
  const short = esc(prompt.split('\n')[0].slice(0, 60));

  if (req.mode === 'chat') {
    return `(Tryb demo) Chętnie pomogę zaplanować: „${short}”.

Proponuję taki plan:
1. Strona główna z nagłówkiem i opisem
2. Sekcja z ofertą
3. Formularz kontaktowy zapisujący zgłoszenia w bazie danych

<suggestion>Zbuduj stronę według tego planu</suggestion>
<suggestion>Dodaj logowanie użytkowników</suggestion>`;
  }

  const index = project.files['index.html'];
  if (!index) return newSite(short);

  if (/zepsuj edycj/i.test(prompt)) {
    return `(Tryb demo) Próbuję edycji, która się nie uda.

<edit path="index.html">
<<<<<<< SEARCH
tego fragmentu nie ma w pliku
=======
nic
>>>>>>> REPLACE
</edit>`;
  }

  if (req.errors?.length && project.files['app.js']) {
    return `(Tryb demo) Naprawiam błąd w app.js.

<edit path="app.js">
<<<<<<< SEARCH
// BŁĄD-DEMO
=======
// naprawione
>>>>>>> REPLACE
</edit>

- Naprawiono błąd w skrypcie
<suggestion>Dodaj sekcję FAQ</suggestion>`;
  }

  if (req.selection && index.includes('<h1>')) {
    return `(Tryb demo) Zmieniam zaznaczony element.

<edit path="index.html">
<<<<<<< SEARCH
<h1>
=======
<h1 style="color:#16a34a">
>>>>>>> REPLACE
</edit>

- Zmieniono kolor zaznaczonego nagłówka`;
  }

  if (!index.includes('<!--sekcje-->')) {
    return `(Tryb demo) W trybie demo potrafię dodawać sekcje tylko do stron utworzonych w trybie demo.`;
  }
  return `(Tryb demo) Dodaję nową sekcję do strony.

<edit path="index.html">
<<<<<<< SEARCH
    <!--sekcje-->
=======
    <section class="card"><h2>${short}</h2><p>Sekcja dodana na prośbę: „${esc(prompt)}”.</p></section>
    <!--sekcje-->
>>>>>>> REPLACE
</edit>

- Dodano sekcję „${short}”
<suggestion>Zmień kolorystykę na ciemną</suggestion>
<suggestion>Dodaj stopkę z danymi kontaktowymi</suggestion>`;
}

function newSite(title) {
  return `(Tryb demo – brak klucza API, więc to przykładowa aplikacja) Tworzę: ${title}. Księga gości zapisuje wpisy we wbudowanej bazie danych, a logowanie korzysta z wbudowanych kont.

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
    <p>Przykładowa aplikacja wygenerowana w trybie demo.</p>
    <button id="btn">Kliknij mnie</button>
    <p id="out"></p>
  </header>
  <main>
    <section class="card" id="auth">
      <h2>Konto</h2>
      <div id="logged-out">
        <input id="email" type="email" placeholder="E-mail">
        <input id="password" type="password" placeholder="Hasło (min. 6 znaków)">
        <button id="signup">Załóż konto</button> <button id="signin">Zaloguj</button>
      </div>
      <div id="logged-in" hidden>Zalogowano jako <b id="who"></b> <button id="signout">Wyloguj</button></div>
      <p id="auth-msg" class="msg"></p>
    </section>
    <section class="card">
      <h2>Księga gości</h2>
      <form id="form"><input id="entry" placeholder="Twój wpis" required> <button>Dodaj</button></form>
      <ul id="entries"></ul>
    </section>
    <!--sekcje-->
  </main>
  <script src="app.js"></script>
</body>
</html>
</file>

<file path="database.rules.json">
{
  "guestbook": { "read": "public", "write": "public" },
  "kontakt": { "read": "private", "write": "public" }
}
</file>

<file path="style.css">
body { margin: 0; font-family: system-ui, sans-serif; background: #f6f7fb; color: #1d1d1f; }
.hero { padding: 64px 24px; text-align: center; background: linear-gradient(135deg, #6366f1, #ec4899); color: #fff; }
button { padding: 8px 16px; border: 0; border-radius: 999px; cursor: pointer; background: #6366f1; color: #fff; }
.hero button { background: #fff; color: #111; }
input { padding: 8px; border: 1px solid #ccc; border-radius: 8px; }
main { max-width: 860px; margin: 32px auto; padding: 0 16px; display: grid; gap: 16px; }
.card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,.06); }
.msg { color: #b91c1c; }
</file>

<file path="app.js">
// BŁĄD-DEMO
let n = 0;
document.getElementById('btn').addEventListener('click', () => {
  n++;
  document.getElementById('out').textContent = 'Kliknięto ' + n + ' raz(y)';
});

const $ = (id) => document.getElementById(id);
const entries = app.db.collection('guestbook');

async function load() {
  const list = await entries.list({ sort: '-created_at' });
  $('entries').innerHTML = '';
  for (const e of list) {
    const li = document.createElement('li');
    li.textContent = e.text + (e.author ? ' — ' + e.author : '');
    $('entries').appendChild(li);
  }
}

$('form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const u = app.auth.user();
  await entries.create({ text: $('entry').value, author: u ? u.email : '' });
  $('entry').value = '';
  load();
});

async function auth(fn) {
  $('auth-msg').textContent = '';
  try { await fn(); } catch (e) { $('auth-msg').textContent = e.message; }
}
$('signup').onclick = () => auth(() => app.auth.signUp({ email: $('email').value, password: $('password').value }));
$('signin').onclick = () => auth(() => app.auth.signIn({ email: $('email').value, password: $('password').value }));
$('signout').onclick = () => app.auth.signOut();
app.auth.onChange((u) => {
  $('logged-in').hidden = !u;
  $('logged-out').hidden = !!u;
  $('who').textContent = u ? u.email : '';
});

load();
</file>

- Utworzono index.html, style.css i app.js
- Księga gości zapisuje wpisy w bazie danych
- Logowanie i rejestracja użytkowników

<suggestion>Dodaj sekcję z cennikiem</suggestion>
<suggestion>Zmień kolory na zielone</suggestion>
<suggestion>Dodaj galerię zdjęć</suggestion>`;
}
