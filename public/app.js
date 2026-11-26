import { parseResponse } from '/parser.js';

// ====================== pomocnicze ======================
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  'arrow-up': '<path d="M12 19V5M5 12l7-7 7 7"/>',
  square: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/>',
  paperclip: '<path d="m21.4 11-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.8-2.8l7.8-7.8"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  tablet: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 18h.01"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  pointer: '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  hammer: '<path d="m15 12-8.4 8.4a2.1 2.1 0 0 1-3-3L12 9M17.6 15 22 10.6M20.9 11.7l-1.3-1.3a2.4 2.4 0 0 1-.7-1.7v-.9l-2.3-2.3a5.5 5.5 0 0 0-3.9-1.6H9l.9.8A6.2 6.2 0 0 1 12 8.4V10l2 2h1.2a2.4 2.4 0 0 1 1.7.7l1.2 1.3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3zM12 9v4M12 17h.01"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M12 3v18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  pencil: '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
const ic = (name) => `<i data-icon="${name}">${icon(name)}</i>`;
function hydrateIcons(root = document) {
  for (const el of $$('i[data-icon]', root)) if (!el.firstChild) el.innerHTML = icon(el.dataset.icon);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'X-Kreator': '1', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !opts.allow401) {
    me = null;
    renderNav();
    openAuth('login');
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `Błąd ${res.status}`), { status: res.status });
  return data;
}

function toast(msg, isError = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (isError ? ' error' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
  setTimeout(() => t.remove(), isError ? 5000 : 3000);
}

const fmtDate = (ts) => new Date(ts).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
function fmtAgo(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return `${Math.floor(s / 3600)} godz. temu`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} dni temu`;
  return fmtDate(ts);
}
const fmtTok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' mln' : n >= 1000 ? (n / 1000).toFixed(1) + ' tys.' : String(n));

// prosty markdown: bloki kodu, listy, nagłówki, **pogrubienie**, *kursywa*, `kod`
function md(text) {
  const parts = String(text).split(/```[\w-]*\n?/);
  let html = '';
  parts.forEach((part, i) => {
    if (i % 2 === 1) {
      html += `<pre><code>${esc(part.replace(/\n$/, ''))}</code></pre>`;
      return;
    }
    let list = null;
    for (const line of esc(part).split('\n')) {
      const ul = line.match(/^\s*[-*•]\s+(.*)$/);
      const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      const kind = ul ? 'ul' : ol ? 'ol' : null;
      if (kind) {
        if (list !== kind) {
          if (list) html += `</${list}>`;
          html += `<${kind}>`;
          list = kind;
        }
        html += `<li>${(ul || ol)[1]}</li>`;
        continue;
      }
      if (list) {
        html += `</${list}>`;
        list = null;
      }
      const h = line.match(/^#{1,4}\s+(.*)$/);
      if (h) html += `<p><strong>${h[1]}</strong></p>`;
      else if (line.trim()) html += `<p>${line}</p>`;
    }
    if (list) html += `</${list}>`;
  });
  return html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])_([^_\n]+)_(?=[^\w]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>');
}

const MAX_IMG = 5 * 1024 * 1024;
function fileToBase64(f) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(f);
  });
}
async function readImages(fileList, existing = []) {
  const out = [...existing];
  for (const f of fileList) {
    if (out.length >= 4) {
      toast('Maksymalnie 4 obrazy w jednej wiadomości', true);
      break;
    }
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) throw new Error(`${f.name}: dozwolone PNG, JPG, GIF, WEBP`);
    if (f.size > MAX_IMG) throw new Error(`${f.name}: maksymalnie 5 MB`);
    out.push({ name: f.name, media_type: f.type, data: await fileToBase64(f) });
  }
  return out;
}
function renderAttachments(box, list, onRemove, withSaveOption) {
  box.innerHTML = list
    .map((a, i) => `<div class="att"><img src="data:${a.media_type};base64,${a.data}" alt=""><button type="button" data-i="${i}" title="Usuń">×</button></div>`)
    .join('');
  if (list.length && withSaveOption) {
    box.insertAdjacentHTML('beforeend', `<label class="att-opt"><input type="checkbox" class="att-save" ${S.saveAttachments ? 'checked' : ''}> zapisz obrazy w projekcie, żeby można było ich użyć na stronie</label>`);
    $('.att-save', box).onchange = (e) => (S.saveAttachments = e.target.checked);
  }
  $$('button[data-i]', box).forEach((b) => (b.onclick = () => onRemove(Number(b.dataset.i))));
}

// --- okna dialogowe
function ask({ title, text = '', fields = [], okText = 'OK', danger = false, validate }) {
  const dlg = $('#ask-dialog');
  $('#ask-title').textContent = title;
  $('#ask-text').textContent = text;
  $('#ask-text').hidden = !text;
  $('#ask-error').textContent = '';
  $('#ask-fields').innerHTML = fields
    .map(
      (f) => `<label class="field">${esc(f.label || '')}${
        f.type === 'textarea'
          ? `<textarea class="input" name="${f.name}" rows="${f.rows || 10}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>`
          : f.type === 'select'
          ? `<select class="input" name="${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}" ${v === f.value ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
          : `<input class="input" name="${f.name}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}">`
      }</label>`
    )
    .join('');
  const ok = $('#ask-ok');
  ok.textContent = okText;
  ok.className = 'btn ' + (danger ? 'danger-btn primary' : 'primary');
  ok.style.background = danger ? 'var(--danger)' : '';
  ok.style.borderColor = danger ? 'var(--danger)' : '';
  return new Promise((resolve) => {
    const form = $('#ask-form');
    const finish = (val) => {
      form.onsubmit = null;
      $('#ask-cancel').onclick = null;
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(val);
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const vals = {};
      for (const f of fields) vals[f.name] = form.elements[f.name].value;
      const err = validate?.(vals);
      if (err) {
        $('#ask-error').textContent = err;
        return;
      }
      finish(fields.length ? vals : true);
    };
    $('#ask-cancel').onclick = () => finish(null);
    dlg.onclose = () => finish(null);
    dlg.showModal();
    const first = $('#ask-fields .input');
    if (first) {
      first.focus();
      if (first.select && first.tagName === 'INPUT') first.select();
    } else ok.focus();
  });
}
const confirmDlg = (title, text, okText = 'Potwierdź', danger = true) => ask({ title, text, okText, danger }).then(Boolean);

// ====================== stan ======================
let me = null;
let status = { mode: 'demo', sitesUrl: '' };
let pending = null; // prompt do wysłania po utworzeniu projektu
let homeImages = [];

// ====================== konta ======================
let authMode = 'login';
let afterAuth = null;
function openAuth(mode, then) {
  authMode = mode;
  if (then) afterAuth = then;
  const reg = mode === 'register';
  $('#auth-title').textContent = reg ? 'Załóż konto' : 'Zaloguj się';
  $('#auth-sub').textContent = reg ? 'Zacznij budować za darmo.' : 'Witaj ponownie!';
  $('#auth-name-field').hidden = !reg;
  $('#auth-submit').textContent = reg ? 'Załóż konto' : 'Zaloguj się';
  $('#auth-switch-text').textContent = reg ? 'Masz już konto?' : 'Nie masz konta?';
  $('#auth-switch').textContent = reg ? 'Zaloguj się' : 'Załóż konto';
  $('#auth-switch').hidden = !reg && !status.allowSignup;
  $('#auth-form').elements.password.autocomplete = reg ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
  const dlg = $('#auth-dialog');
  if (!dlg.open) dlg.showModal();
  $('#auth-form').elements.email.focus();
}
$('#auth-switch').onclick = () => openAuth(authMode === 'login' ? 'register' : 'login');
$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  $('#auth-submit').disabled = true;
  try {
    const r = await api(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, {
      method: 'POST',
      body: { email: f.email.value, password: f.password.value, name: f.name.value },
      allow401: true,
    });
    me = r.user;
    const fn = afterAuth;
    afterAuth = null;
    $('#auth-dialog').close();
    f.password.value = '';
    renderNav();
    route();
    if (fn && fn !== route) fn();
  } catch (err) {
    $('#auth-error').textContent = err.message;
  } finally {
    $('#auth-submit').disabled = false;
  }
});
$('#auth-dialog').addEventListener('close', () => {
  afterAuth = null;
  if (!me && location.hash.startsWith('#/p/')) location.hash = '#/';
});
$$('[data-auth]').forEach((b) => (b.onclick = () => openAuth(b.dataset.auth)));

$('#btn-logout').onclick = async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  me = null;
  location.hash = '#/';
  renderNav();
  loadHome();
};

$('#btn-settings').onclick = async () => {
  const f = $('#settings-form').elements;
  f.name.value = me.name;
  f.email.value = me.email;
  f.currentPassword.value = '';
  f.newPassword.value = '';
  $('#settings-error').textContent = '';
  $('#usage').innerHTML = '<div class="muted">Wczytywanie…</div>';
  $('#settings-dialog').showModal();
  try {
    const u = await api('/api/usage');
    $('#usage').innerHTML = `
      <div><span class="muted small">Ostatnie 30 dni</span><b>${u.month.requests}</b><span class="small muted">zapytań · ${fmtTok(u.month.input + u.month.output)} tokenów</span></div>
      <div><span class="muted small">Łącznie</span><b>${u.total.requests}</b><span class="small muted">zapytań · ${fmtTok(u.total.input + u.total.output)} tokenów</span></div>`;
  } catch {
    $('#usage').innerHTML = '';
  }
};
$('#settings-cancel').onclick = () => $('#settings-dialog').close();
$('#settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const body = { name: f.name.value };
  if (f.newPassword.value) Object.assign(body, { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value });
  try {
    me = (await api('/api/auth/me', { method: 'PATCH', body })).user;
    renderNav();
    $('#settings-dialog').close();
    toast('Zapisano ustawienia');
  } catch (err) {
    $('#settings-error').textContent = err.message;
  }
});

function renderNav() {
  $('#nav-guest').hidden = !!me;
  $('#nav-user').hidden = !me;
  if (me) $('#user-name').textContent = me.name || me.email;
}

// ====================== routing ======================
let lastHash = location.hash;
let routing = false;
async function route() {
  const m = location.hash.match(/^#\/p\/([a-f0-9]{12})/);
  // opuszczasz projekt z niezapisanym kodem?
  if (S.project && S.dirty && (!m || m[1] !== S.project.id) && !routing) {
    routing = true;
    const target = location.hash;
    history.replaceState(null, '', lastHash || '#/');
    const ok = await confirmDlg('Niezapisane zmiany', 'Masz niezapisane zmiany w kodzie. Porzucić je i przejść dalej?', 'Porzuć');
    routing = false;
    if (!ok) return;
    S.dirty = false;
    history.replaceState(null, '', target);
    return route();
  }
  lastHash = location.hash;
  if (m && !me) {
    openAuth('login', route);
    return;
  }
  $('#home').hidden = !!m;
  $('#editor').hidden = !m;
  if (m) openEditor(m[1]);
  else {
    closeEditor();
    loadHome();
  }
}
window.addEventListener('hashchange', route);

// ====================== pulpit ======================
let projectsCache = [];
async function loadHome() {
  document.title = 'Kreator – buduj strony i aplikacje z AI';
  $('#projects-section').hidden = !me;
  if (!me) return;
  try {
    projectsCache = await api('/api/projects');
    renderProjects();
  } catch (e) {
    $('#projects').innerHTML = `<p class="error-text">Nie udało się wczytać projektów: ${esc(e.message)}</p>`;
  }
}

let homeTimer = null;
function scheduleHomeRefresh() {
  clearTimeout(homeTimer);
  if (projectsCache.some((p) => p.generating)) {
    homeTimer = setTimeout(() => {
      if (!$('#home').hidden && me) loadHome();
    }, 4000);
  }
}
function renderProjects() {
  scheduleHomeRefresh();
  const q = $('#project-search').value.trim().toLowerCase();
  const list = projectsCache.filter((p) => !q || p.name.toLowerCase().includes(q));
  const box = $('#projects');
  if (!projectsCache.length) {
    box.innerHTML = '<div class="empty-state">Nie masz jeszcze projektów. Opisz powyżej, co chcesz zbudować ✨</div>';
    return;
  }
  if (!list.length) {
    box.innerHTML = '<div class="empty-state">Brak projektów pasujących do wyszukiwania.</div>';
    return;
  }
  box.innerHTML = list
    .map(
      (p) => `
    <div class="card" data-id="${p.id}">
      <a class="thumb" href="#/p/${p.id}" tabindex="-1">${p.hasFiles ? `<iframe loading="lazy" tabindex="-1" src="${esc(p.previewUrl)}" title=""></iframe>` : `${ic('file')}`}</a>
      <div class="card-body">
        <div class="card-info">
          <a class="card-title" href="#/p/${p.id}">${esc(p.name)}</a>
          <div class="muted small">${p.generating ? 'Generowanie…' : 'Edytowano ' + fmtAgo(p.updatedAt)} ${p.published ? '<span class="pill live">Opublikowany</span>' : ''}</div>
        </div>
        <button class="btn ghost icon small" data-menu title="Więcej">${ic('more')}</button>
      </div>
    </div>`
    )
    .join('');
  scaleThumbs();
}
function scaleThumbs() {
  for (const t of $$('.thumb')) {
    const f = $('iframe', t);
    if (f) f.style.transform = `scale(${t.clientWidth / 1280})`;
  }
}
window.addEventListener('resize', scaleThumbs);
$('#project-search').addEventListener('input', renderProjects);

document.addEventListener('click', (e) => {
  if (!e.target.closest('.card-menu') && !e.target.closest('[data-menu]')) $$('.card-menu').forEach((m) => m.remove());
  if (!e.target.closest('.pop-wrap')) $('#publish-pop').hidden = true;
});

$('#projects').addEventListener('click', async (e) => {
  const menuBtn = e.target.closest('[data-menu]');
  const card = e.target.closest('.card');
  if (menuBtn) {
    $$('.card-menu').forEach((m) => m.remove());
    card.insertAdjacentHTML(
      'beforeend',
      `<div class="card-menu"><button data-act="open">Otwórz</button><button data-act="rename">Zmień nazwę</button><button data-act="duplicate">Duplikuj</button><button data-act="delete" class="danger-text">Usuń</button></div>`
    );
    return;
  }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  const id = card.dataset.id;
  const name = projectsCache.find((p) => p.id === id)?.name || '';
  $$('.card-menu').forEach((m) => m.remove());
  try {
    if (act === 'open') location.hash = `#/p/${id}`;
    if (act === 'delete') {
      if (!(await confirmDlg('Usunąć projekt?', `Projekt „${name}” wraz z bazą danych i plikami zostanie trwale usunięty.`, 'Usuń'))) return;
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      toast('Projekt usunięty');
    } else if (act === 'rename') {
      const v = await ask({ title: 'Zmień nazwę projektu', fields: [{ name: 'name', value: name }], okText: 'Zapisz', validate: (v) => (!v.name.trim() ? 'Podaj nazwę' : null) });
      if (!v) return;
      await api(`/api/projects/${id}`, { method: 'PATCH', body: { name: v.name } });
    } else if (act === 'duplicate') {
      await api(`/api/projects/${id}/duplicate`, { method: 'POST' });
      toast('Utworzono kopię');
    }
    loadHome();
  } catch (err) {
    toast(err.message, true);
  }
});

$$('[data-example]').forEach((b) =>
  b.addEventListener('click', () => {
    $('#new-prompt').value = b.dataset.example;
    $('#new-prompt').focus();
  })
);

function renderHomeAttachments() {
  renderAttachments($('#new-attachments'), homeImages, (i) => {
    homeImages.splice(i, 1);
    renderHomeAttachments();
  }, true);
}
$('#new-image').addEventListener('change', async (e) => {
  try {
    homeImages = await readImages(e.target.files, homeImages);
    renderHomeAttachments();
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = '';
});
autoGrow($('#new-prompt'));
$('#new-prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    $('#new-form').requestSubmit();
  }
});
$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#new-prompt').value.trim();
  if (!text) {
    $('#new-prompt').focus();
    return toast('Opisz, co chcesz zbudować', true);
  }
  if (!me) return openAuth('register', () => $('#new-form').requestSubmit());
  try {
    const p = await api('/api/projects', { method: 'POST', body: {} });
    pending = { text, images: homeImages };
    homeImages = [];
    $('#new-prompt').value = '';
    renderHomeAttachments();
    location.hash = `#/p/${p.id}`;
  } catch (err) {
    toast(err.message, true);
  }
});

function autoGrow(ta) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
  };
  ta.addEventListener('input', fit);
  return fit;
}

// ====================== edytor ======================
const S = {
  project: null,
  tab: 'preview',
  file: null,
  dirty: false,
  generating: false,
  streamCtl: null,
  raw: '',
  images: [],
  saveAttachments: true,
  mode: 'build',
  selection: null,
  selecting: false,
  errors: [],
  page: 'index.html',
  dataView: null, // {type:'collection', name} | {type:'users'}
  assetView: null,
};

function closeEditor() {
  S.streamCtl?.abort();
  S.streamCtl = null;
  S.project = null;
  S.dirty = false;
  setGenerating(false);
  if (S.selecting) setSelecting(false);
}

async function openEditor(id) {
  if (S.project?.id === id) return;
  closeEditor();
  Object.assign(S, { file: null, dirty: false, page: 'index.html', selection: null, errors: [], dataView: null, assetView: null, images: [], raw: '' });
  let proj;
  try {
    proj = await api(`/api/projects/${id}`);
  } catch (err) {
    if (err.status !== 401) toast(err.message, true);
    if (location.hash.includes(id)) location.hash = '#/';
    return;
  }
  // w międzyczasie użytkownik przeszedł gdzie indziej
  if (!location.hash.includes(`/p/${id}`) || (S.project && S.project.id !== id)) return;
  S.project = proj;
  setGenerating(false);
  setTab('preview');
  renderAll();
  reloadPreview();
  renderSelection();
  renderChatAttachments();
  if (S.project.generating) subscribe();
  if (pending) {
    const { text, images } = pending;
    pending = null;
    sendMessage(text, images);
  } else setTimeout(() => $('#chat-input').focus(), 50);
}

function renderAll() {
  const p = S.project;
  document.title = `${p.name} – Kreator`;
  if (document.activeElement !== $('#project-name')) $('#project-name').value = p.name;
  renderMessages();
  renderFiles();
  renderVersions();
  renderPages();
  renderPublish();
  if (S.tab === 'data') loadData();
}

$('#project-name').addEventListener('change', async (e) => {
  try {
    S.project = await api(`/api/projects/${S.project.id}`, { method: 'PATCH', body: { name: e.target.value } });
    document.title = `${S.project.name} – Kreator`;
  } catch (err) {
    e.target.value = S.project.name;
    toast(err.message, true);
  }
});
$('#project-name').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.blur());

// --- zakładki
async function setTab(tab) {
  if (S.tab === 'code' && tab !== 'code' && S.dirty) {
    if (!(await confirmDlg('Niezapisane zmiany', 'Masz niezapisane zmiany w kodzie. Porzucić je?', 'Porzuć'))) return;
    S.dirty = false;
    renderFiles();
  }
  if (tab !== 'preview' && S.selecting) setSelecting(false);
  S.tab = tab;
  $$('#tabs button').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
  for (const t of ['preview', 'code', 'data', 'history']) $(`#tab-${t}`).hidden = t !== tab;
  $('#workspace').classList.toggle('show-chat', tab === 'chat');
  if (tab === 'code') setTimeout(() => cm?.refresh(), 0);
  if (tab === 'data') loadData();
}
matchMedia('(min-width: 861px)').addEventListener('change', (e) => {
  if (e.matches && S.tab === 'chat') setTab('preview');
});
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setTab(b.dataset.tab);
});

// ---------- wiadomości ----------
function blocksSummary(blocks, deletes, streaming) {
  const seen = new Map();
  for (const b of blocks) {
    const prev = seen.get(b.path);
    seen.set(b.path, { path: b.path, kind: prev?.kind === 'file' ? 'file' : b.kind, complete: b.complete && (prev ? prev.complete : true) });
  }
  const items = [...seen.values()].map(
    (b) =>
      `<div class="file-chip${b.complete ? '' : streaming ? ' writing' : ' del'}">${b.complete ? `<span class="tick">${ic('check')}</span>` : streaming ? '<span class="spinner"></span>' : '✕'} ${b.kind === 'edit' ? 'Edycja' : 'Plik'} <b>${esc(b.path)}</b>${!b.complete && !streaming ? ' – przerwano, nie zapisano' : ''}</div>`
  );
  for (const d of deletes) items.push(`<div class="file-chip del">${ic('trash')} Usunięto <b>${esc(d)}</b></div>`);
  return items.length ? `<div class="file-chips">${items.join('')}</div>` : '';
}

function assistantHtml(m, { streaming = false, last = false } = {}) {
  const { chat, blocks, deletes } = parseResponse(m.content || '');
  const meta = m.meta || {};
  let html = `<div class="ai-head"><span class="brand-mark small"></span>Kreator</div>`;
  if (chat) html += md(chat);
  html += blocksSummary(blocks, deletes, streaming);
  if (streaming) {
    const writing = blocks.find((b) => !b.complete);
    html += `<div class="thinking"><span class="dots"><span></span><span></span><span></span></span>${writing ? `Piszę ${esc(writing.path)}…` : chat ? 'Pracuję…' : 'Myślę…'}</div>`;
  }
  if (meta.note) html += `<div class="note">${esc(meta.note)}</div>`;
  if (last && !streaming && meta.note && /Błąd AI|restart serwera|zatrzymane/.test(meta.note)) html += `<button class="link small" data-retry="1">↻ Wyślij ponownie</button>`;
  const foot = [];
  if (meta.versionId && S.project.versions.some((v) => v.id === meta.versionId)) foot.push(`<button class="link small" data-restore="${meta.versionId}">↺ Przywróć tę wersję</button>`);
  if (meta.usage && (meta.usage.input || meta.usage.output)) foot.push(`<span title="Tokeny: wejście / wyjście">${fmtTok(meta.usage.input)} / ${fmtTok(meta.usage.output)} tokenów</span>`);
  if (foot.length) html += `<div class="msg-foot">${foot.join('')}</div>`;
  if (last && !streaming && meta.suggestions?.length) {
    html += `<div class="suggestions">${meta.suggestions.map((s) => `<button class="chip" data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>`;
  }
  return html;
}

function userHtml(m) {
  const meta = m.meta || {};
  const bits = [];
  if (meta.images) bits.push(`📎 ${meta.images} obraz(y)`);
  if (meta.selection) bits.push(`🎯 ${esc(meta.selection.selector)}`);
  if (meta.errors) bits.push(`⚠ ${meta.errors} błąd(ów) z konsoli`);
  if (meta.mode === 'chat') bits.push('💬 tryb rozmowy');
  return md(m.content) + (bits.length ? `<div class="meta">${bits.join(' · ')}</div>` : '');
}

function renderMessages() {
  const box = $('#messages');
  const msgs = S.project.messages;
  if (!msgs.length) {
    box.innerHTML = `<div class="welcome"><span class="brand-mark"></span><h3>Co budujemy?</h3><p>Opisz stronę lub aplikację. Możesz dołączyć szkic, zrzut ekranu lub logo.</p></div>`;
    return;
  }
  const lastAi = msgs.map((m) => m.role).lastIndexOf('assistant');
  box.innerHTML = msgs
    .map((m, i) => {
      if (m.role === 'user') return `<div class="msg user">${userHtml(m)}</div>`;
      const running = m.meta?.status === 'running';
      if (running && S.generating) return `<div class="msg ai" id="streaming">${assistantHtml({ content: S.raw || m.content }, { streaming: true })}</div>`;
      return `<div class="msg ai">${assistantHtml(m, { last: i === lastAi && !S.generating })}</div>`;
    })
    .join('');
  box.scrollTop = box.scrollHeight;
}

$('#messages').addEventListener('click', (e) => {
  const r = e.target.closest('[data-restore]');
  if (r) return restoreVersion(r.dataset.restore);
  const s = e.target.closest('[data-suggest]');
  if (s && !S.generating) sendMessage(s.dataset.suggest, []);
  if (e.target.closest('[data-retry]') && !S.generating) {
    const lastUser = [...S.project.messages].reverse().find((m) => m.role === 'user');
    if (lastUser) sendMessage(lastUser.content.replace(/\n\n\(Załączone obrazy zapisano w projekcie jako:[^)]*\)$/, ''), []);
  }
});

// ---------- wysyłanie i strumień ----------
function setGenerating(on) {
  S.generating = on;
  $('#btn-stop').hidden = !on;
  $('#btn-send').hidden = on;
  const empty = !Object.keys(S.project?.files || {}).length;
  $('#frame-overlay').hidden = !on || empty;
  $('#frame-building').hidden = !on || !empty;
  for (const id of ['#btn-save-file', '#btn-delete-file', '#btn-rename-file', '#btn-new-file']) $(id).disabled = on;
  if (cm) cm.setOption('readOnly', on || !S.file);
  $('#code-host').classList.toggle('locked', on);
  renderErrors();
}

async function sendMessage(text, images = []) {
  if (S.generating || !S.project) return false;
  const p = S.project;
  let message = text;
  // zapisz załączone obrazy jako pliki projektu
  if (images.length && S.saveAttachments) {
    const saved = [];
    for (const img of images) {
      try {
        const r = await api(`/api/projects/${p.id}/assets`, { method: 'POST', body: { name: img.name || 'obraz.png', data: img.data } });
        saved.push(r.name);
      } catch (err) {
        toast(`Nie zapisano ${img.name}: ${err.message}`, true);
      }
    }
    if (saved.length) message += `\n\n(Załączone obrazy zapisano w projekcie jako: ${saved.join(', ')})`;
  }
  const body = {
    message,
    images: images.map(({ media_type, data }) => ({ media_type, data })),
    mode: S.mode,
    selection: S.selection,
    errors: S.pendingErrors || undefined,
  };
  const errorsSent = S.pendingErrors;
  S.pendingErrors = null;
  try {
    await api(`/api/projects/${p.id}/chat`, { method: 'POST', body });
  } catch (err) {
    toast(err.message, true);
    // przywróć wiadomość, żeby nie przepadła
    if (S.project?.id === p.id) {
      if (!$('#chat-input').value.trim()) {
        $('#chat-input').value = text;
        fitChat();
      }
      if (!S.images.length && images.length) {
        S.images = images;
        renderChatAttachments();
      }
      S.pendingErrors = errorsSent;
    }
    return false;
  }
  S.selection = null;
  renderSelection();
  const fresh = await api(`/api/projects/${p.id}`).catch(() => null);
  if (fresh && S.project?.id === p.id) S.project = fresh;
  if (S.tab !== 'preview' && S.tab !== 'chat' && !S.dirty && window.innerWidth > 860) setTab('preview');
  subscribe();
  return true;
}

async function subscribe(attempt = 0) {
  const p = S.project;
  if (!p) return;
  S.streamCtl?.abort();
  const ctl = new AbortController();
  S.streamCtl = ctl;
  S.raw = '';
  setGenerating(true);
  renderMessages();
  let result = null;
  try {
    const res = await fetch(`/api/projects/${p.id}/stream`, { signal: ctl.signal });
    if (!res.ok) throw new Error(`Błąd ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let lastRender = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const block = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const ev = block.match(/^event: (.*)$/m)?.[1];
        const dataLine = block.match(/^data: (.*)$/m)?.[1];
        if (!ev || !dataLine) continue;
        const data = JSON.parse(dataLine);
        if (ev === 'snapshot') S.raw = data.text;
        else if (ev === 'delta') S.raw += data.text;
        else if (ev === 'done') result = data;
      }
      if (Date.now() - lastRender > 70) {
        lastRender = Date.now();
        renderStreaming();
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
  }
  if (S.streamCtl !== ctl || S.project?.id !== p.id) return;
  S.streamCtl = null;
  if (!result) {
    // połączenie zerwane – próbuj ponownie z coraz dłuższą przerwą
    const delay = Math.min(15000, 1000 * 2 ** attempt);
    if (attempt === 1) toast('Utracono połączenie – łączę ponownie…', true);
    setTimeout(async () => {
      if (S.project?.id !== p.id || S.streamCtl) return;
      const fresh = await api(`/api/projects/${p.id}`).catch(() => null);
      if (S.project?.id !== p.id || S.streamCtl) return;
      if (!fresh) {
        if (attempt < 12) return subscribe(attempt + 1);
        setGenerating(false);
        return toast('Brak połączenia z serwerem. Odśwież stronę.', true);
      }
      S.project = fresh;
      if (fresh.generating) subscribe(attempt + 1);
      else {
        setGenerating(false);
        renderAll();
        reloadPreview();
      }
    }, delay);
    return;
  }
  setGenerating(false);
  const openFile = S.file;
  const keepMine = result.changed?.length && openFile && result.changed.includes(openFile) && S.dirty;
  S.project = result.project;
  if (result.note) toast(result.note, !/zatrzymane/.test(result.note));
  renderAll();
  if (result.changed?.length) reloadPreview();
  if (keepMine) {
    // AI zmieniło plik, w którym masz niezapisane zmiany – zapytaj, którą wersję zostawić
    confirmDlg('AI zmieniło otwarty plik', `AI zmieniło ${openFile}, a Ty masz w nim niezapisane zmiany. Wczytać wersję AI (Twoje zmiany przepadną)? „Anuluj” zostawi Twoją wersję w edytorze – jej zapisanie nadpisze zmiany AI.`, 'Wczytaj wersję AI', false).then((load) => {
      if (load && S.file === openFile) {
        S.dirty = false;
        renderFiles();
      }
    });
  }
  if (window.innerWidth > 860) $('#chat-input').focus();
}

function renderStreaming() {
  const el = $('#streaming');
  if (!el) return renderMessages();
  const box = $('#messages');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  el.innerHTML = assistantHtml({ content: S.raw }, { streaming: true });
  if (atBottom) box.scrollTop = box.scrollHeight;
}

$('#btn-stop').onclick = () => S.project && api(`/api/projects/${S.project.id}/stop`, { method: 'POST' }).catch((e) => toast(e.message, true));

const fitChat = autoGrow($('#chat-input'));
$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  if (S.generating) return;
  const text = $('#chat-input').value.trim();
  if (!text) return;
  $('#chat-input').value = '';
  fitChat();
  const imgs = S.images;
  S.images = [];
  renderChatAttachments();
  sendMessage(text, imgs);
});
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    $('#chat-form').requestSubmit();
  }
});
function renderChatAttachments() {
  renderAttachments($('#chat-attachments'), S.images, (i) => {
    S.images.splice(i, 1);
    renderChatAttachments();
  }, true);
}
$('#chat-image').addEventListener('change', async (e) => {
  try {
    S.images = await readImages(e.target.files, S.images);
    renderChatAttachments();
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = '';
});
// wklejanie obrazów ze schowka
$('#chat-input').addEventListener('paste', async (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  try {
    S.images = await readImages(files.map((f, i) => new File([f], f.name && f.name !== 'image.png' ? f.name : `wklejony-${Date.now()}-${i}.png`, { type: f.type })), S.images);
    renderChatAttachments();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#mode-toggle').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  S.mode = b.dataset.mode;
  $$('#mode-toggle button').forEach((x) => x.classList.toggle('active', x === b));
  $('#chat-input').placeholder = S.mode === 'chat' ? 'Zapytaj o coś lub zaplanuj (bez zmian w stronie)…' : 'Poproś Kreatora o zmianę…';
});

// ---------- podgląd ----------
const sitesOrigin = () => {
  try {
    return new URL(S.project.previewUrl).origin;
  } catch {
    return '*';
  }
};
function pageUrl(page = S.page) {
  return S.project.previewUrl + (page === 'index.html' ? '' : encodeURI(page));
}
function reloadPreview() {
  if (!S.project) return;
  S.errors = [];
  renderErrors();
  const url = pageUrl();
  $('#preview').src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  $('#btn-open').href = url;
  if (S.selecting) setSelecting(false);
}
$('#btn-reload').onclick = reloadPreview;
$('#devices').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-w]');
  if (!b) return;
  $$('#devices button').forEach((x) => x.classList.toggle('active', x === b));
  $('#preview').style.width = b.dataset.w;
  $('#preview').classList.toggle('framed', b.dataset.w !== '100%');
});
function renderPages() {
  const pages = Object.keys(S.project.files)
    .filter((f) => /\.html?$/.test(f))
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  if (!pages.length) pages.push('index.html');
  if (!pages.includes(S.page)) S.page = 'index.html';
  $('#page-select').innerHTML = pages.map((f) => `<option value="${esc(f)}" ${f === S.page ? 'selected' : ''}>/${f === 'index.html' ? '' : esc(f)}</option>`).join('');
}
$('#page-select').addEventListener('change', (e) => {
  S.page = e.target.value;
  reloadPreview();
});

// komunikaty z podglądu (błędy, wybrany element, nawigacja)
window.addEventListener('message', (e) => {
  if (!S.project || e.source !== $('#preview').contentWindow) return;
  const d = e.data;
  if (!d || !d.kreator) return;
  if (d.type === 'loaded') {
    S.errors = [];
    renderErrors();
    if (d.page && d.page !== S.page && S.project.files[d.page] !== undefined) {
      S.page = d.page;
      renderPages();
      $('#btn-open').href = pageUrl();
    }
    if (S.selecting) postToPreview({ type: 'select', on: true });
  } else if (d.type === 'error') {
    if (!S.errors.some((x) => x.message === d.message) && S.errors.length < 30) S.errors.push({ message: d.message, level: d.level || 'error' });
    renderErrors();
  } else if (d.type === 'selected') {
    S.selection = { selector: d.selector, html: d.html, page: d.page, tag: d.tag, text: d.text };
    setSelecting(false, false);
    renderSelection();
    if (window.innerWidth <= 860) setTab('chat');
    $('#chat-input').focus();
  } else if (d.type === 'select-off') {
    setSelecting(false, false);
  }
});

function postToPreview(msg) {
  try {
    $('#preview').contentWindow.postMessage({ kreator: true, ...msg }, sitesOrigin() === 'null' ? '*' : sitesOrigin());
  } catch {}
}

function setSelecting(on, notify = true) {
  S.selecting = on;
  $('#btn-select').classList.toggle('active', on);
  if (notify) postToPreview({ type: 'select', on });
}
$('#btn-select').onclick = () => {
  if (!Object.keys(S.project.files).length) return toast('Najpierw zbuduj stronę', true);
  setSelecting(!S.selecting);
  if (S.selecting) toast('Kliknij element na stronie (Esc – anuluj)');
};

function renderSelection() {
  const sel = S.selection;
  $('#selection-chip').hidden = !sel;
  if (sel) $('#selection-text').textContent = `<${sel.tag}> ${sel.text ? '„' + sel.text.slice(0, 40) + '”' : sel.selector}`;
  $('#chat-input').placeholder = sel ? 'Co zmienić w zaznaczonym elemencie?' : S.mode === 'chat' ? 'Zapytaj o coś lub zaplanuj (bez zmian w stronie)…' : 'Poproś Kreatora o zmianę…';
}
$('#btn-clear-selection').onclick = () => {
  S.selection = null;
  renderSelection();
};

function renderErrors() {
  const n = S.errors.filter((x) => x.level === 'error').length;
  $('#error-banner').hidden = !n || S.generating;
  $('#error-text').textContent = n ? `Na stronie wystąpił${n === 1 ? ' błąd' : 'y błędy'} (${n})` : '';
}
$('#btn-show-errors').onclick = () =>
  ask({ title: 'Błędy na stronie', fields: [{ name: 'e', type: 'textarea', value: S.errors.map((x) => (x.level === 'log' ? '[konsola] ' : '') + x.message).join('\n\n'), rows: 8 }], okText: 'Zamknij' });
$('#btn-fix-errors').onclick = () => {
  S.pendingErrors = S.errors.map((x) => (x.level === 'log' ? '[console.error] ' : '') + x.message);
  S.mode = 'build';
  $$('#mode-toggle button').forEach((x) => x.classList.toggle('active', x.dataset.mode === 'build'));
  sendMessage('Na stronie wystąpiły błędy – znajdź przyczynę i napraw je.', []);
};

// ---------- kod ----------
let cm = null;
function cmMode(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return { html: 'htmlmixed', htm: 'htmlmixed', css: 'css', js: 'javascript', mjs: 'javascript', json: { name: 'javascript', json: true }, md: 'markdown', svg: 'xml', xml: 'xml' }[ext] || null;
}
function initCodeEditor() {
  if (cm || !window.CodeMirror) return;
  cm = window.CodeMirror.fromTextArea($('#code'), {
    lineNumbers: true,
    theme: 'material-darker',
    tabSize: 2,
    indentUnit: 2,
    lineWrapping: false,
    extraKeys: { 'Ctrl-S': () => saveFile(), 'Cmd-S': () => saveFile() },
  });
  cm.on('change', (_, ch) => {
    if (ch.origin === 'setValue') return;
    markDirty();
  });
}
const getCode = () => (cm ? cm.getValue() : $('#code').value);
function setCode(text, name) {
  if (cm) {
    cm.setOption('mode', cmMode(name));
    cm.setValue(text);
    cm.clearHistory();
  } else $('#code').value = text;
}
function markDirty() {
  if (!S.dirty) {
    S.dirty = true;
    $('#dirty').hidden = false;
  }
}
$('#code').addEventListener('input', markDirty);

function fileIcon(n) {
  return /\.html?$/.test(n) ? 'globe' : /\.(css)$/.test(n) ? 'pencil' : /\.(m?js|json)$/.test(n) ? 'code' : 'file';
}
function renderFiles() {
  initCodeEditor();
  const names = Object.keys(S.project.files).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  if (S.file && !names.includes(S.file) && !S.dirty) S.file = null;
  if (!S.file && !S.assetView) S.file = names[0] || null;
  $('#files').innerHTML = names.length
    ? names.map((n) => `<button class="file${n === S.file && !S.assetView ? ' active' : ''}" data-file="${esc(n)}">${ic(fileIcon(n))}${esc(n)}</button>`).join('')
    : '<p class="muted small" style="padding:4px 8px">Brak plików</p>';
  const assets = S.project.assets;
  $('#assets').innerHTML = assets.length
    ? assets.map((a) => `<button class="file${S.assetView === a.name ? ' active' : ''}" data-asset="${esc(a.name)}">${ic('image')}${esc(a.name.replace(/^assets\//, ''))}</button>`).join('')
    : '<p class="muted small" style="padding:4px 8px">Wgraj obrazy, logo, wideo…</p>';

  const showAsset = !!S.assetView && assets.some((a) => a.name === S.assetView);
  if (S.assetView && !showAsset) S.assetView = null;
  $('#code-host').hidden = showAsset;
  $('#asset-view').hidden = !showAsset;
  for (const id of ['#btn-save-file', '#btn-rename-file']) $(id).hidden = showAsset;
  $('#dirty').hidden = !S.dirty || showAsset;
  if (showAsset) {
    const a = assets.find((x) => x.name === S.assetView);
    $('#current-file').textContent = a.name;
    const url = S.project.previewUrl + encodeURI(a.name);
    const media = a.mime.startsWith('image/') ? `<img src="${esc(url)}" alt="">` : a.mime.startsWith('video/') ? `<video src="${esc(url)}" controls></video>` : `<a href="${esc(url)}" target="_blank">Otwórz plik</a>`;
    $('#asset-view').innerHTML = `${media}<div class="muted">${esc(a.mime)} · ${Math.round(a.size / 1024)} KB</div><div>Ścieżka do użycia w kodzie: <code>${esc(a.name)}</code> <button class="btn ghost small" id="btn-copy-asset">${ic('copy')}Kopiuj</button></div><p class="muted small">Możesz napisać w czacie np. „użyj ${esc(a.name)} jako logo”.</p>`;
    $('#btn-copy-asset').onclick = () => navigator.clipboard.writeText(a.name).then(() => toast('Skopiowano ścieżkę'), () => toast('Nie udało się skopiować', true));
    return;
  }
  $('#current-file').textContent = S.file || '—';
  if (!S.dirty) setCode(S.file ? S.project.files[S.file] ?? '' : '', S.file);
  if (cm) cm.setOption('readOnly', !S.file);
  else $('#code').disabled = !S.file;
  setTimeout(() => cm?.refresh(), 0);
}

async function confirmDiscard() {
  if (!S.dirty) return true;
  if (!(await confirmDlg('Niezapisane zmiany', 'Porzucić niezapisane zmiany w tym pliku?', 'Porzuć'))) return false;
  S.dirty = false;
  return true;
}

$('#files').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-file]');
  if (!b || (b.dataset.file === S.file && !S.assetView)) return;
  if (!(await confirmDiscard())) return;
  S.file = b.dataset.file;
  S.assetView = null;
  renderFiles();
});
$('#assets').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-asset]');
  if (!b) return;
  if (!(await confirmDiscard())) return;
  S.assetView = b.dataset.asset;
  renderFiles();
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && S.project && S.tab === 'code') {
    e.preventDefault();
    saveFile();
  }
  if (e.key === 'Escape' && S.selecting) setSelecting(false);
});

async function saveFile() {
  if (!S.file || S.generating || S.assetView) return;
  try {
    S.project = await api(`/api/projects/${S.project.id}/files`, { method: 'PUT', body: { path: S.file, content: getCode() } });
    S.dirty = false;
    renderAll();
    reloadPreview();
    toast('Zapisano');
  } catch (err) {
    toast(err.message, true);
  }
}
$('#btn-save-file').onclick = saveFile;

$('#btn-new-file').onclick = async () => {
  if (!(await confirmDiscard())) return;
  const v = await ask({
    title: 'Nowy plik',
    text: 'Np. about.html, css/main.css, js/app.js',
    fields: [{ name: 'name', placeholder: 'nazwa-pliku.html' }],
    okText: 'Utwórz',
    validate: (v) => (!v.name.trim() ? 'Podaj nazwę' : S.project.files[v.name.trim()] !== undefined ? 'Taki plik już istnieje' : null),
  });
  if (!v) return;
  try {
    const name = v.name.trim().replace(/^(\.\/|\/)+/, '');
    S.project = await api(`/api/projects/${S.project.id}/files`, { method: 'PUT', body: { path: name, content: '' } });
    S.dirty = false;
    S.assetView = null;
    S.file = name in S.project.files ? name : S.file;
    renderAll();
  } catch (err) {
    toast(err.message, true);
  }
};

$('#btn-rename-file').onclick = async () => {
  if (!S.file) return;
  if (S.dirty) return toast('Najpierw zapisz zmiany', true);
  const v = await ask({ title: 'Zmień nazwę pliku', fields: [{ name: 'name', value: S.file }], okText: 'Zmień', validate: (v) => (!v.name.trim() ? 'Podaj nazwę' : null) });
  if (!v || v.name.trim() === S.file) return;
  try {
    const to = v.name.trim().replace(/^(\.\/|\/)+/, '');
    S.project = await api(`/api/projects/${S.project.id}/files/rename`, { method: 'POST', body: { from: S.file, to } });
    S.file = to;
    renderAll();
    reloadPreview();
  } catch (err) {
    toast(err.message, true);
  }
};

$('#btn-delete-file').onclick = async () => {
  if (S.assetView) {
    if (!(await confirmDlg('Usunąć plik?', `Plik ${S.assetView} zostanie usunięty z projektu.`, 'Usuń'))) return;
    try {
      S.project = await api(`/api/projects/${S.project.id}/assets?name=${encodeURIComponent(S.assetView)}`, { method: 'DELETE' });
      S.assetView = null;
      renderAll();
      toast('Plik usunięty');
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (!S.file || !(await confirmDlg('Usunąć plik?', `Plik ${S.file} zostanie usunięty (można go przywrócić z historii).`, 'Usuń'))) return;
  try {
    S.project = await api(`/api/projects/${S.project.id}/files?path=${encodeURIComponent(S.file)}`, { method: 'DELETE' });
    S.file = null;
    S.dirty = false;
    renderAll();
    reloadPreview();
    toast('Plik usunięty');
  } catch (err) {
    toast(err.message, true);
  }
};

$('#asset-upload').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  let last = null;
  for (const f of files) {
    if (f.size > 10 * 1024 * 1024) {
      toast(`${f.name}: maksymalnie 10 MB`, true);
      continue;
    }
    try {
      const r = await api(`/api/projects/${S.project.id}/assets`, { method: 'POST', body: { name: f.name, data: await fileToBase64(f) } });
      S.project = r.project;
      last = r.name;
    } catch (err) {
      toast(`${f.name}: ${err.message}`, true);
    }
  }
  if (last) {
    if (await confirmDiscard()) S.assetView = last;
    renderFiles();
    toast('Wgrano pliki');
  }
});

// ---------- baza danych ----------
let dataInfo = null;
async function loadData() {
  if (!S.project) return;
  const pid = S.project.id;
  let info;
  try {
    info = await api(`/api/projects/${pid}/data`);
  } catch (err) {
    return toast(err.message, true);
  }
  if (S.project?.id !== pid) return;
  dataInfo = info;
  $('#collections').innerHTML = dataInfo.collections.length
    ? dataInfo.collections
        .map((c) => `<button class="file${S.dataView?.type === 'collection' && S.dataView.name === c.name ? ' active' : ''}" data-coll="${esc(c.name)}">${ic('table')}${esc(c.name)}<span class="count">${c.count}</span></button>`)
        .join('')
    : '<p class="muted small" style="padding:4px 8px">Brak kolekcji</p>';
  $('#users-count').textContent = dataInfo.users.length;
  $('[data-users]').classList.toggle('active', S.dataView?.type === 'users');
  if (S.dataView?.type === 'collection' && !dataInfo.collections.some((c) => c.name === S.dataView.name)) S.dataView = null;
  if (!S.dataView && dataInfo.collections.length) S.dataView = { type: 'collection', name: dataInfo.collections[0].name };
  renderDataView();
}

async function renderDataView() {
  const v = S.dataView;
  const body = $('#data-body');
  $('#btn-add-record').hidden = v?.type !== 'collection';
  $('#btn-drop-collection').hidden = v?.type !== 'collection';
  $$('#collections .file').forEach((b) => b.classList.toggle('active', v?.type === 'collection' && b.dataset.coll === v.name));
  $('[data-users]').classList.toggle('active', v?.type === 'users');
  if (!v) {
    body.dataset.coll = '';
    $('#data-title').textContent = 'Baza danych';
    $('#data-sub').textContent = '';
    body.innerHTML = `<div class="data-empty"><p><b>Twoja aplikacja ma wbudowaną bazę danych.</b></p><p>Kolekcje pojawią się tu same, gdy strona zapisze dane – np. formularz kontaktowy, rezerwacje albo lista zadań.<br>Poproś w czacie: „zapisuj zgłoszenia z formularza w bazie danych”.</p><p>Możesz też utworzyć kolekcję ręcznie przyciskiem <b>+</b>.</p></div>`;
    return;
  }
  if (v.type === 'users') {
    S.dataSeq = (S.dataSeq || 0) + 1;
    body.dataset.coll = '';
    $('#data-title').textContent = 'Użytkownicy aplikacji';
    $('#data-sub').textContent = `${dataInfo.users.length} kont`;
    body.innerHTML = dataInfo.users.length
      ? `<div class="table-wrap"><table class="data"><thead><tr><th>E-mail</th><th>Imię</th><th>Utworzono</th><th></th></tr></thead><tbody>${dataInfo.users
          .map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.name)}</td><td>${fmtDate(u.created_at)}</td><td class="actions"><button class="btn ghost small danger-text" data-del-user="${u.id}">Usuń</button></td></tr>`)
          .join('')}</tbody></table></div>`
      : `<div class="data-empty">Nikt jeszcze nie założył konta w tej aplikacji.<br>Poproś w czacie: „dodaj logowanie i rejestrację użytkowników”.</div>`;
    return;
  }
  $('#data-title').textContent = v.name;
  const coll = dataInfo.collections.find((c) => c.name === v.name);
  let rows;
  const seq = (S.dataSeq = (S.dataSeq || 0) + 1);
  if (!body.dataset.coll || body.dataset.coll !== v.name) body.innerHTML = '<div class="data-empty">Wczytywanie…</div>';
  body.dataset.coll = v.name;
  try {
    rows = await api(`/api/projects/${S.project.id}/data/${encodeURIComponent(v.name)}`);
  } catch (err) {
    return toast(err.message, true);
  }
  if (seq !== S.dataSeq || S.dataView !== v) return; // w międzyczasie wybrano inną kolekcję
  S.dataRows = rows;
  $('#data-sub').textContent = `${rows.length} rekordów`;
  const r = coll?.rules || { read: 'public', write: 'public', edit: 'owner' };
  const rulesBar = `<div class="rules-bar">${ic('users')}<span><b>Dostęp ze strony:</b> odczyt – ${esc(RULE_LABELS.read[r.read])} · dodawanie – ${esc(RULE_LABELS.write[r.write])} · edycja – ${esc(RULE_LABELS.edit[r.edit])}</span><button class="btn ghost small" id="btn-edit-rules">Zmień</button></div>`;
  if (!rows.length) {
    body.innerHTML = rulesBar + '<div class="data-empty">Kolekcja jest pusta.</div>';
    return;
  }
  const cols = [];
  for (const r of rows) for (const k of Object.keys(r.data)) if (!cols.includes(k) && cols.length < 8) cols.push(k);
  const cell = (val) => {
    if (val === undefined || val === null) return '<span class="muted">—</span>';
    const s = typeof val === 'object' ? JSON.stringify(val) : String(val);
    return `<span title="${esc(s.slice(0, 500))}">${esc(s.slice(0, 120))}</span>`;
  };
  body.innerHTML = rulesBar + `<div class="table-wrap"><table class="data"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}<th>Właściciel</th><th>Utworzono</th><th></th></tr></thead><tbody>${rows
    .map(
      (r) =>
        `<tr>${cols.map((c) => `<td>${cell(r.data[c])}</td>`).join('')}<td>${r.owner_id ? esc(dataInfo.users.find((u) => u.id === r.owner_id)?.email || r.owner_id) : '<span class="muted">anonim</span>'}</td><td>${fmtDate(r.created_at)}</td><td class="actions"><button class="btn ghost small" data-edit-rec="${r.id}">Edytuj</button><button class="btn ghost small danger-text" data-del-rec="${r.id}">Usuń</button></td></tr>`
    )
    .join('')}</tbody></table></div>`;
}

const RULE_LABELS = {
  read: { public: 'każdy', auth: 'zalogowani', owner: 'tylko własne rekordy', private: 'nikt (tylko Ty w panelu)' },
  write: { public: 'każdy', auth: 'zalogowani', none: 'nikt' },
  edit: { owner: 'tylko autor', public: 'każdy (rekordy anonimowe)' },
};
async function editRules(name) {
  const coll = dataInfo.collections.find((c) => c.name === name);
  const cur = coll?.rules || { read: 'public', write: 'public', edit: 'owner' };
  const opts = (k) => Object.entries(RULE_LABELS[k]);
  const v = await ask({
    title: `Dostęp do „${name}”`,
    text: 'Kto może korzystać z tej kolekcji na Twojej stronie. Ty w panelu zawsze masz pełny dostęp.',
    fields: [
      { name: 'read', label: 'Kto może czytać rekordy', type: 'select', value: cur.read, options: opts('read') },
      { name: 'write', label: 'Kto może dodawać rekordy', type: 'select', value: cur.write, options: opts('write') },
      { name: 'edit', label: 'Kto może zmieniać i usuwać rekordy bez autora', type: 'select', value: cur.edit, options: opts('edit') },
    ],
    okText: 'Zapisz',
  });
  if (!v) return;
  let all = {};
  try {
    all = JSON.parse(S.project.files['database.rules.json'] || '{}') || {};
  } catch {}
  all[name] = { read: v.read, write: v.write, edit: v.edit };
  try {
    S.project = await api(`/api/projects/${S.project.id}/files`, { method: 'PUT', body: { path: 'database.rules.json', content: JSON.stringify(all, null, 2) + '\n' } });
    renderAll();
    toast('Zapisano reguły dostępu');
  } catch (err) {
    toast(err.message, true);
  }
}

const jsonField = (value) => [{ name: 'json', type: 'textarea', value, rows: 12 }];
const validateJson = (v) => {
  try {
    const o = JSON.parse(v.json);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return 'Dane muszą być obiektem JSON, np. {"nazwa": "wartość"}';
  } catch (e) {
    return 'Nieprawidłowy JSON: ' + e.message;
  }
  return null;
};

$('#collections').addEventListener('click', (e) => {
  const b = e.target.closest('[data-coll]');
  if (!b) return;
  S.dataView = { type: 'collection', name: b.dataset.coll };
  renderDataView();
});
$('[data-users]').onclick = () => {
  S.dataView = { type: 'users' };
  renderDataView();
};
$('#btn-data-refresh').onclick = loadData;
$('#btn-new-collection').onclick = async () => {
  const v = await ask({
    title: 'Nowa kolekcja',
    text: 'Kolekcja to „tabela” w bazie danych, np. produkty, rezerwacje, zadania.',
    fields: [{ name: 'name', label: 'Nazwa', placeholder: 'produkty' }, { name: 'json', label: 'Pierwszy rekord (JSON)', type: 'textarea', value: '{\n  "nazwa": "Przykład"\n}', rows: 6 }],
    okText: 'Utwórz',
    validate: (v) => (!/^[A-Za-z][\w-]{0,49}$/.test(v.name) ? 'Nazwa: litery, cyfry, _ i -, zaczyna się literą' : validateJson(v)),
  });
  if (!v) return;
  try {
    await api(`/api/projects/${S.project.id}/data/${encodeURIComponent(v.name)}`, { method: 'POST', body: { data: JSON.parse(v.json) } });
    S.dataView = { type: 'collection', name: v.name };
    loadData();
  } catch (err) {
    toast(err.message, true);
  }
};
$('#btn-add-record').onclick = async () => {
  const v = await ask({ title: `Nowy rekord w „${S.dataView.name}”`, fields: jsonField('{\n  \n}'), okText: 'Dodaj', validate: validateJson });
  if (!v) return;
  try {
    await api(`/api/projects/${S.project.id}/data/${encodeURIComponent(S.dataView.name)}`, { method: 'POST', body: { data: JSON.parse(v.json) } });
    loadData();
  } catch (err) {
    toast(err.message, true);
  }
};
$('#btn-drop-collection').onclick = async () => {
  const name = S.dataView.name;
  if (!(await confirmDlg('Usunąć kolekcję?', `Wszystkie rekordy w „${name}” zostaną trwale usunięte.`, 'Usuń'))) return;
  try {
    await api(`/api/projects/${S.project.id}/data/${encodeURIComponent(name)}`, { method: 'DELETE' });
    S.dataView = null;
    loadData();
  } catch (err) {
    toast(err.message, true);
  }
};
$('#data-body').addEventListener('click', async (e) => {
  if (e.target.closest('#btn-edit-rules')) return editRules(S.dataView.name);
  const edit = e.target.closest('[data-edit-rec]');
  const del = e.target.closest('[data-del-rec]');
  const delUser = e.target.closest('[data-del-user]');
  const coll = S.dataView?.name;
  try {
    if (edit) {
      const rec = S.dataRows.find((r) => r.id === edit.dataset.editRec);
      const v = await ask({ title: 'Edytuj rekord', text: `ID: ${rec.id}`, fields: jsonField(JSON.stringify(rec.data, null, 2)), okText: 'Zapisz', validate: validateJson });
      if (!v) return;
      await api(`/api/projects/${S.project.id}/data/${encodeURIComponent(coll)}/${rec.id}`, { method: 'PUT', body: { data: JSON.parse(v.json) } });
      loadData();
    } else if (del) {
      if (!(await confirmDlg('Usunąć rekord?', 'Tej operacji nie można cofnąć.', 'Usuń'))) return;
      await api(`/api/projects/${S.project.id}/data/${encodeURIComponent(coll)}/${del.dataset.delRec}`, { method: 'DELETE' });
      loadData();
    } else if (delUser) {
      if (!(await confirmDlg('Usunąć użytkownika?', 'Konto zostanie usunięte, a użytkownik wylogowany.', 'Usuń'))) return;
      await api(`/api/projects/${S.project.id}/app-users/${delUser.dataset.delUser}`, { method: 'DELETE' });
      loadData();
    }
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- historia ----------
function renderVersions() {
  const vs = [...S.project.versions].reverse();
  $('#versions').innerHTML = vs.length
    ? vs
        .map(
          (v, i) => `
      <div class="version${i === 0 ? ' current' : ''}">
        <div><div class="label">${esc(v.label)}</div><div class="muted small">${fmtDate(v.ts)}${i === 0 ? ' · aktualna wersja' : ''}</div></div>
        ${i === 0 ? '' : `<button class="btn ghost small" data-restore="${v.id}">↺ Przywróć</button>`}
      </div>`
        )
        .join('')
    : '<div class="data-empty">Brak wersji. Każda zmiana AI lub ręczny zapis tworzy nową wersję, do której możesz wrócić.</div>';
}
$('#versions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-restore]');
  if (b) restoreVersion(b.dataset.restore);
});
async function restoreVersion(versionId) {
  if (S.generating) return toast('Poczekaj na koniec generowania', true);
  if (!(await confirmDiscard())) return;
  if (!(await confirmDlg('Przywrócić tę wersję?', 'Obecny stan zostanie zachowany w historii, więc możesz do niego wrócić.', 'Przywróć', false))) return;
  try {
    S.project = await api(`/api/projects/${S.project.id}/restore`, { method: 'POST', body: { versionId } });
    S.dirty = false;
    renderAll();
    reloadPreview();
    toast('Przywrócono wersję');
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- publikacja ----------
function renderPublish() {
  const p = S.project;
  const pub = p.published;
  $('#btn-publish-menu span').textContent = !pub ? 'Opublikuj' : pub.outdated ? 'Aktualizuj' : 'Opublikowano';
  $('#btn-publish-menu').classList.toggle('has-dot', !!pub?.outdated);
  $('#slug-prefix').textContent = p.slugPrefix || '';
  $('#slug-suffix').textContent = p.slugSuffix || '';
  if (document.activeElement !== $('#slug-input')) $('#slug-input').value = p.slug || '';
  $('#publish-state').textContent = !pub
    ? 'Strona nie jest jeszcze publiczna. Po publikacji każdy z linkiem ją zobaczy.'
    : pub.outdated
    ? `Opublikowano ${fmtAgo(pub.at)}. Od tego czasu wprowadzono zmiany – kliknij „Aktualizuj”, aby je pokazać publicznie.`
    : `Opublikowano ${fmtAgo(pub.at)}. Publiczna strona jest aktualna.`;
  $('#btn-publish').textContent = pub ? 'Aktualizuj' : 'Opublikuj';
  $('#published-box').hidden = !pub;
  if (pub) {
    $('#published-link').href = pub.url;
    $('#published-link').textContent = pub.url;
  }
}
$('#btn-publish-menu').onclick = () => {
  $('#publish-pop').hidden = !$('#publish-pop').hidden;
};
async function saveSlugIfChanged() {
  const slug = $('#slug-input').value.trim();
  if (slug === (S.project.slug || '')) return true;
  try {
    S.project = await api(`/api/projects/${S.project.id}`, { method: 'PATCH', body: { slug } });
    renderPublish();
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}
$('#btn-save-slug').onclick = async () => {
  if (await saveSlugIfChanged()) toast('Zapisano adres');
};
$('#btn-publish').onclick = async () => {
  if (!(await saveSlugIfChanged())) return;
  try {
    S.project = await api(`/api/projects/${S.project.id}/publish`, { method: 'POST' });
    renderPublish();
    toast('Opublikowano! 🎉');
  } catch (err) {
    toast(err.message, true);
  }
};
$('#btn-copy-link').onclick = () => navigator.clipboard.writeText(S.project.published.url).then(() => toast('Skopiowano link'), () => toast('Nie udało się skopiować', true));
$('#btn-unpublish').onclick = async () => {
  if (!(await confirmDlg('Cofnąć publikację?', 'Strona przestanie być dostępna pod publicznym adresem.', 'Cofnij publikację'))) return;
  try {
    S.project = await api(`/api/projects/${S.project.id}/publish`, { method: 'DELETE' });
    renderPublish();
    toast('Publikacja cofnięta');
  } catch (err) {
    toast(err.message, true);
  }
};
$('#btn-project-settings').onclick = async () => {
  const p = S.project;
  const v = await ask({
    title: 'Ustawienia projektu',
    text: 'Instrukcje są dołączane do każdej prośby do AI – np. kolory marki, styl, ton tekstów, dane firmy.',
    fields: [
      { name: 'name', label: 'Nazwa projektu', value: p.name },
      { name: 'instructions', label: 'Instrukcje dla AI', type: 'textarea', rows: 8, value: p.instructions, placeholder: 'Np. Kolory marki: #1f6feb i #f5a623. Styl minimalistyczny. Teksty po polsku, zwracaj się do klienta per „Ty”. Telefon: 600 100 200.' },
    ],
    okText: 'Zapisz',
    validate: (v) => (!v.name.trim() ? 'Podaj nazwę' : null),
  });
  if (!v) return;
  try {
    S.project = await api(`/api/projects/${p.id}`, { method: 'PATCH', body: { name: v.name, instructions: v.instructions } });
    renderAll();
    toast('Zapisano ustawienia projektu');
  } catch (err) {
    toast(err.message, true);
  }
};

$('#btn-download').onclick = () => {
  if (!Object.keys(S.project.files).length) return toast('Projekt nie ma jeszcze plików', true);
  location.href = `/api/projects/${S.project.id}/download`;
};

window.addEventListener('beforeunload', (e) => {
  if (S.dirty) e.preventDefault();
});

// ====================== start ======================
hydrateIcons();
(async () => {
  try {
    status = await api('/api/status');
    me = status.user;
  } catch {}
  $('#mode-badge').textContent = status.mode === 'demo' ? 'TRYB DEMO' : '';
  $('#mode-badge').title = status.mode === 'demo' ? 'Brak klucza ANTHROPIC_API_KEY – AI zastąpione przykładowymi odpowiedziami' : '';
  $('#mode-badge').hidden = status.mode !== 'demo';
  $('#mode-badge').classList.add('warn');
  renderNav();
  route();
})();
