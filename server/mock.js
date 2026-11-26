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
  if (!index && /sklep|shop|płatno|platno|stripe/i.test(prompt)) return newShop(short);
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
<project-name>${title.split(' ').slice(0, 4).join(' ')}</project-name>

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

// sklep: moduły ES w kilku plikach, routing po hashu, koszyk, płatności Stripe
function newShop(title) {
  return `(Tryb demo) Tworzę sklep z koszykiem i płatnościami Stripe: ${title}.
<project-name>Sklep demo</project-name>

<file path="payments.json">
{
  "currency": "pln",
  "products": {
    "kawa": { "name": "Kawa ziarnista 250 g", "price": 3900, "description": "Etiopia, jasne palenie" },
    "kubek": { "name": "Kubek ceramiczny", "price": 4500 },
    "klub": { "name": "Klub kawowy", "price": 5900, "interval": "month" }
  }
}
</file>

<file path="index.html">
<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sklep demo</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header class="bar"><a href="#/" class="logo">☕ Sklep demo</a><a href="#/koszyk" id="cart-link">Koszyk (<span id="cart-count">0</span>)</a></header>
  <main id="view"></main>
  <script type="module" src="js/main.js"></script>
</body>
</html>
</file>

<file path="dziekujemy.html">
<!doctype html>
<html lang="pl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dziękujemy</title><link rel="stylesheet" href="css/style.css"></head>
<body>
  <main class="center"><h1 id="msg">Sprawdzam płatność…</h1><p id="details"></p><a href="index.html">Wróć do sklepu</a></main>
  <script>
    app.payments.verify().then((r) => {
      document.getElementById('msg').textContent = r.paid ? 'Dziękujemy za zakup! ✅' : 'Płatność nie została zakończona';
      if (r.paid) document.getElementById('details').textContent = 'Zapłacono ' + (r.amount / 100).toFixed(2) + ' ' + r.currency.toUpperCase() + ' · ' + (r.email || '');
      try { if (r.paid) localStorage.removeItem('koszyk'); } catch (e) {}
    }).catch((e) => { document.getElementById('msg').textContent = e.message; });
  </script>
</body>
</html>
</file>

<file path="css/style.css">
body { margin: 0; font-family: system-ui, sans-serif; background: #faf7f2; color: #222; }
.bar { display: flex; justify-content: space-between; padding: 16px 24px; background: #3b2a20; }
.bar a { color: #fff; text-decoration: none; font-weight: 600; }
main { max-width: 960px; margin: 24px auto; padding: 0 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
.product { background: #fff; border-radius: 14px; padding: 18px; box-shadow: 0 4px 16px rgba(0,0,0,.06); }
button { background: #3b2a20; color: #fff; border: 0; border-radius: 10px; padding: 10px 16px; cursor: pointer; }
.center { text-align: center; padding-top: 60px; }
.error { color: #b91c1c; }
</file>

<file path="js/cart.js">
const KEY = 'koszyk';
export function getCart() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
export function saveCart(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
export function addToCart(id) {
  const c = getCart(); const it = c.find((x) => x.id === id);
  if (it) it.quantity++; else c.push({ id, quantity: 1 });
  saveCart(c); return c;
}
</file>

<file path="js/main.js">
import { getCart, saveCart, addToCart } from './cart.js';
const view = document.getElementById('view');
const money = (v) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(v / 100);
let products = [];

function updateCount() { document.getElementById('cart-count').textContent = getCart().reduce((s, i) => s + i.quantity, 0); }

function renderShop() {
  view.innerHTML = '<h1>Nasze produkty</h1><div class="grid">' + products.map((p) =>
    '<div class="product"><h3>' + p.name + '</h3><p>' + (p.description || '') + '</p><b>' + money(p.price) + (p.interval ? ' / mies.' : '') + '</b><br><br><button data-add="' + p.id + '">Do koszyka</button></div>').join('') + '</div>';
}
function renderCart() {
  const cart = getCart();
  if (!cart.length) { view.innerHTML = '<h1>Koszyk</h1><p>Koszyk jest pusty.</p>'; return; }
  const total = cart.reduce((s, i) => s + (products.find((p) => p.id === i.id)?.price || 0) * i.quantity, 0);
  view.innerHTML = '<h1>Koszyk</h1><ul>' + cart.map((i) => '<li>' + (products.find((p) => p.id === i.id)?.name || i.id) + ' × ' + i.quantity + '</li>').join('') +
    '</ul><p>Razem: <b id="total">' + money(total) + '</b></p><button id="pay">Zapłać</button> <button id="clear">Wyczyść</button><p id="pay-error" class="error"></p>';
}
async function route() {
  if (location.hash === '#/koszyk') renderCart(); else renderShop();
  updateCount();
}
view.addEventListener('click', async (e) => {
  const add = e.target.closest('[data-add]');
  if (add) { addToCart(add.dataset.add); updateCount(); add.textContent = 'Dodano ✓'; }
  if (e.target.id === 'clear') { saveCart([]); route(); }
  if (e.target.id === 'pay') {
    try {
      await app.payments.checkout({ items: getCart(), successUrl: new URL('dziekujemy.html', location.href).href, cancelUrl: location.href });
    } catch (err) { document.getElementById('pay-error').textContent = err.message; }
  }
});
window.addEventListener('hashchange', route);
app.payments.products().then((r) => { products = r.products; route(); });
</file>

- Sklep z koszykiem (moduły ES: js/main.js, js/cart.js) i routingiem #/koszyk
- Produkty i ceny w payments.json, płatność przez Stripe Checkout
- Strona podziękowania sprawdza płatność

<suggestion>Dodaj stronę produktu ze zdjęciami</suggestion>
<suggestion>Dodaj kody rabatowe</suggestion>`;
}
