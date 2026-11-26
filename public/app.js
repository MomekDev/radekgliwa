import { parseResponse } from '/parser.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- pomocnicze ----------
async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd ${res.status}`);
  return data;
}

let toastTimer;
function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isError ? ' error' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

function fmtDate(ts) {
  return new Date(ts).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
}

// prosty markdown: **pogrubienie**, `kod`, listy, akapity
function md(text) {
  const lines = esc(text).split('\n');
  let html = '';
  let inList = false;
  for (const line of lines) {
    const li = line.match(/^\s*[-*•]\s+(.*)$/) || line.match(/^\s*\d+\.\s+(.*)$/);
    if (li) {
      if (!inList) (html += '<ul>'), (inList = true);
      html += `<li>${li[1]}</li>`;
      continue;
    }
    if (inList) (html += '</ul>'), (inList = false);
    const h = line.match(/^#{1,4}\s+(.*)$/);
    if (h) html += `<p><strong>${h[1]}</strong></p>`;
    else if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += '</ul>';
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
}

const MAX_IMG = 5 * 1024 * 1024;
async function readImages(fileList) {
  const out = [];
  for (const f of fileList) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) throw new Error(`${f.name}: dozwolone PNG, JPG, GIF, WEBP`);
    if (f.size > MAX_IMG) throw new Error(`${f.name}: maks. 5 MB`);
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsDataURL(f);
    });
    out.push({ name: f.name, media_type: f.type, data: dataUrl.split(',')[1] });
  }
  return out.slice(0, 4);
}

// ---------- routing ----------
let pending = null; // prompt do wysłania po utworzeniu projektu

function route() {
  const m = location.hash.match(/^#\/p\/([a-f0-9]{12})/);
  $('#home').hidden = !!m;
  $('#editor').hidden = !m;
  if (m) openEditor(m[1]);
  else {
    closeEditor();
    loadHome();
  }
}
window.addEventListener('hashchange', route);

// ---------- pulpit ----------
let homeImages = [];

async function loadHome() {
  document.title = 'Kreator – buduj strony z AI';
  const box = $('#projects');
  try {
    const list = await api('/api/projects');
    if (!list.length) {
      box.innerHTML = '<p class="muted">Nie masz jeszcze projektów. Opisz stronę powyżej, aby zacząć.</p>';
      return;
    }
    box.innerHTML = list
      .map(
        (p) => `
      <div class="card" data-id="${p.id}">
        <a class="thumb" href="#/p/${p.id}">${p.hasFiles ? `<iframe loading="lazy" tabindex="-1" sandbox="allow-scripts" src="/preview/${p.id}/"></iframe>` : '<span class="muted">pusty</span>'}</a>
        <div class="card-body">
          <a class="card-title" href="#/p/${p.id}">${esc(p.name)}</a>
          <div class="muted small">${fmtDate(p.updatedAt)}${p.published ? ' · 🌐 opublikowany' : ''}</div>
          <div class="card-actions">
            <button class="btn ghost small" data-act="rename">Zmień nazwę</button>
            <button class="btn ghost small" data-act="duplicate">Duplikuj</button>
            <button class="btn ghost small danger-text" data-act="delete">Usuń</button>
          </div>
        </div>
      </div>`
      )
      .join('');
  } catch (e) {
    box.innerHTML = `<p class="error-text">Nie udało się wczytać projektów: ${esc(e.message)}</p>`;
  }
}

$('#projects').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const card = btn.closest('.card');
  const id = card.dataset.id;
  const name = card.querySelector('.card-title').textContent;
  try {
    if (btn.dataset.act === 'delete') {
      if (!confirm(`Usunąć projekt „${name}”? Tego nie da się cofnąć.`)) return;
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      toast('Projekt usunięty');
    } else if (btn.dataset.act === 'rename') {
      const n = prompt('Nowa nazwa projektu:', name);
      if (!n || !n.trim()) return;
      await api(`/api/projects/${id}`, { method: 'PATCH', body: { name: n } });
    } else if (btn.dataset.act === 'duplicate') {
      await api(`/api/projects/${id}/duplicate`, { method: 'POST' });
      toast('Utworzono kopię');
    }
    loadHome();
  } catch (err) {
    toast(err.message, true);
  }
});

document.querySelectorAll('[data-example]').forEach((b) =>
  b.addEventListener('click', () => {
    $('#new-prompt').value = b.dataset.example;
    $('#new-prompt').focus();
  })
);

$('#new-image').addEventListener('change', async (e) => {
  try {
    homeImages = await readImages(e.target.files);
    $('#new-image-list').textContent = homeImages.map((i) => i.name).join(', ');
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = '';
});

$('#new-prompt').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#new-form').requestSubmit();
  }
});

$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#new-prompt').value.trim();
  if (!text) return toast('Opisz, co chcesz zbudować', true);
  try {
    const p = await api('/api/projects', { method: 'POST', body: {} });
    pending = { text, images: homeImages };
    homeImages = [];
    $('#new-prompt').value = '';
    $('#new-image-list').textContent = '';
    location.hash = `#/p/${p.id}`;
  } catch (err) {
    toast(err.message, true);
  }
});

// ---------- edytor ----------
const S = {
  project: null,
  file: null,
  dirty: false,
  generating: false,
  controller: null,
  images: [],
  page: 'index.html',
};

function closeEditor() {
  if (S.controller) S.controller.abort();
  S.project = null;
}

async function openEditor(id) {
  if (S.project?.id === id) return;
  S.file = null;
  S.dirty = false;
  S.page = 'index.html';
  try {
    S.project = await api(`/api/projects/${id}`);
  } catch (err) {
    toast(err.message, true);
    location.hash = '#/';
    return;
  }
  renderAll();
  reloadPreview();
  if (pending) {
    const { text, images } = pending;
    pending = null;
    sendMessage(text, images);
  }
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
}

// --- nazwa projektu
$('#project-name').addEventListener('change', async (e) => {
  try {
    S.project = await api(`/api/projects/${S.project.id}`, { method: 'PATCH', body: { name: e.target.value } });
    document.title = `${S.project.name} – Kreator`;
    toast('Zmieniono nazwę');
  } catch (err) {
    e.target.value = S.project.name;
    toast(err.message, true);
  }
});

// --- zakładki
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  if (S.dirty && b.dataset.tab !== 'code' && !confirm('Masz niezapisane zmiany w kodzie. Kontynuować bez zapisu?')) return;
  if (b.dataset.tab !== 'code' && S.dirty) {
    S.dirty = false;
    renderFiles();
  }
  document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
  for (const t of ['preview', 'code', 'history']) $(`#tab-${t}`).hidden = t !== b.dataset.tab;
});

// --- wiadomości
function assistantHtml(m) {
  const { chat, files, deletes } = parseResponse(m.content || '');
  let html = chat ? md(chat) : '';
  if (files.length || deletes.length) {
    html += '<div class="file-chips">' +
      files.map((f) => `<span class="file-chip${f.complete ? '' : ' writing'}">${f.complete ? '✓' : '✎'} ${esc(f.path)}</span>`).join('') +
      deletes.map((d) => `<span class="file-chip del">🗑 ${esc(d)}</span>`).join('') +
      '</div>';
  }
  if (m.note) html += `<div class="note">${esc(m.note)}</div>`;
  if (m.versionId && S.project.versions.some((v) => v.id === m.versionId)) {
    html += `<button class="link small" data-restore="${m.versionId}">↺ Przywróć tę wersję</button>`;
  }
  return html || '<span class="muted">…</span>';
}

function renderMessages() {
  const box = $('#messages');
  const msgs = S.project.messages;
  if (!msgs.length) {
    box.innerHTML = '<div class="empty muted">Napisz, jaką stronę chcesz zbudować. Np. „Strona salonu fryzjerskiego z cennikiem i mapą dojazdu”.</div>';
    return;
  }
  box.innerHTML = msgs
    .map((m) =>
      m.role === 'user'
        ? `<div class="msg user">${md(m.content)}${m.images ? `<div class="muted small">📎 obrazy: ${m.images}</div>` : ''}</div>`
        : `<div class="msg ai">${assistantHtml(m)}</div>`
    )
    .join('');
  box.scrollTop = box.scrollHeight;
}

$('#messages').addEventListener('click', (e) => {
  const b = e.target.closest('[data-restore]');
  if (b) restoreVersion(b.dataset.restore);
});

// --- wysyłanie wiadomości (strumień)
function setGenerating(on) {
  S.generating = on;
  $('#btn-stop').hidden = !on;
  $('#btn-send').disabled = on;
  $('#chat-input').disabled = on;
  for (const id of ['#btn-save-file', '#btn-delete-file', '#btn-rename-file', '#btn-new-file']) $(id).disabled = on;
}

async function sendMessage(text, images = []) {
  if (S.generating) return;
  const p = S.project;
  setGenerating(true);
  const box = $('#messages');
  if (!p.messages.length) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', `<div class="msg user">${md(text)}${images.length ? `<div class="muted small">📎 obrazy: ${images.length}</div>` : ''}</div>`);
  const bubble = document.createElement('div');
  bubble.className = 'msg ai streaming';
  bubble.innerHTML = '<span class="dots">Myślę</span>';
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;

  const controller = new AbortController();
  S.controller = controller;
  let raw = '';
  let result = null;
  try {
    const res = await fetch(`/api/projects/${p.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, images: images.map(({ media_type, data }) => ({ media_type, data })) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `Błąd ${res.status}`);
    }
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
        const data = JSON.parse(block.match(/^data: (.*)$/m)?.[1] || 'null');
        if (ev === 'delta') raw += data.text;
        else if (ev === 'done') result = data;
      }
      if (Date.now() - lastRender > 80) {
        lastRender = Date.now();
        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
        bubble.innerHTML = assistantHtml({ content: raw }) + streamStatus(raw);
        if (atBottom) box.scrollTop = box.scrollHeight;
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') toast(err.message, true);
  }
  S.controller = null;
  setGenerating(false);

  if (result) {
    if (S.project?.id !== result.project.id) return;
    S.project = result.project;
    if (result.note) toast(result.note, !/zatrzymane/.test(result.note));
    if (result.changed.length && S.file && result.changed.includes(S.file)) S.dirty = false;
    renderAll();
    if (result.changed.length) reloadPreview();
  } else if (S.project) {
    // przerwane po stronie klienta – pobierz stan z serwera
    setTimeout(async () => {
      try {
        S.project = await api(`/api/projects/${p.id}`);
        renderAll();
        reloadPreview();
      } catch {}
    }, 400);
  }
  $('#chat-input').focus();
}

function streamStatus(raw) {
  const { files } = parseResponse(raw);
  const writing = files.find((f) => !f.complete);
  if (writing) return `<div class="status">✎ Piszę ${esc(writing.path)}… (${writing.content.split('\n').length} linii)</div>`;
  return '<div class="status dots">Generuję</div>';
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('#chat-input').value.trim();
  if (!text) return;
  $('#chat-input').value = '';
  const imgs = S.images;
  S.images = [];
  $('#chat-image-list').textContent = '';
  sendMessage(text, imgs);
});
$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('#chat-form').requestSubmit();
  }
});
$('#chat-image').addEventListener('change', async (e) => {
  try {
    S.images = await readImages(e.target.files);
    $('#chat-image-list').textContent = S.images.length ? '📎 ' + S.images.map((i) => i.name).join(', ') : '';
  } catch (err) {
    toast(err.message, true);
  }
  e.target.value = '';
});
$('#btn-stop').addEventListener('click', () => S.controller?.abort());

// --- podgląd
function previewUrl() {
  return `/preview/${S.project.id}/${S.page === 'index.html' ? '' : encodeURI(S.page)}`;
}
function reloadPreview() {
  const url = previewUrl();
  $('#preview').src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
  $('#btn-open').href = url;
}
$('#btn-reload').addEventListener('click', reloadPreview);
$('#devices').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-w]');
  if (!b) return;
  document.querySelectorAll('#devices button').forEach((x) => x.classList.toggle('active', x === b));
  $('#preview').style.width = b.dataset.w;
});
function renderPages() {
  const pages = Object.keys(S.project.files).filter((f) => /\.html?$/.test(f)).sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)));
  if (!pages.includes(S.page)) S.page = 'index.html';
  $('#page-select').hidden = pages.length < 2;
  $('#page-select').innerHTML = pages.map((f) => `<option ${f === S.page ? 'selected' : ''}>${esc(f)}</option>`).join('');
}
$('#page-select').addEventListener('change', (e) => {
  S.page = e.target.value;
  reloadPreview();
});

// --- kod
function renderFiles() {
  const names = Object.keys(S.project.files).sort();
  if (S.file && !names.includes(S.file) && !S.dirty) S.file = null;
  if (!S.file) S.file = names.includes('index.html') ? 'index.html' : names[0] || null;
  $('#files').innerHTML = names.length
    ? names.map((n) => `<button class="file${n === S.file ? ' active' : ''}" data-file="${esc(n)}">${esc(n)}</button>`).join('')
    : '<p class="muted small">Brak plików</p>';
  $('#current-file').textContent = S.file || '—';
  if (!S.dirty) $('#code').value = S.file ? S.project.files[S.file] ?? '' : '';
  $('#code').disabled = !S.file;
  $('#dirty').textContent = S.dirty ? '● niezapisane' : '';
}

$('#files').addEventListener('click', (e) => {
  const b = e.target.closest('[data-file]');
  if (!b || b.dataset.file === S.file) return;
  if (S.dirty && !confirm('Masz niezapisane zmiany. Przełączyć plik bez zapisu?')) return;
  S.dirty = false;
  S.file = b.dataset.file;
  renderFiles();
});

$('#code').addEventListener('input', () => {
  S.dirty = true;
  $('#dirty').textContent = '● niezapisane';
});
$('#code').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const t = e.target;
    const s = t.selectionStart;
    t.setRangeText('  ', s, t.selectionEnd, 'end');
    S.dirty = true;
    $('#dirty').textContent = '● niezapisane';
  }
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's' && S.project && !$('#tab-code').hidden) {
    e.preventDefault();
    saveFile();
  }
});

async function saveFile() {
  if (!S.file || S.generating) return;
  try {
    S.project = await api(`/api/projects/${S.project.id}/files`, { method: 'PUT', body: { path: S.file, content: $('#code').value } });
    S.dirty = false;
    renderAll();
    reloadPreview();
    toast('Zapisano');
  } catch (err) {
    toast(err.message, true);
  }
}
$('#btn-save-file').addEventListener('click', saveFile);

$('#btn-new-file').addEventListener('click', async () => {
  if (S.dirty && !confirm('Masz niezapisane zmiany. Kontynuować bez zapisu?')) return;
  const name = prompt('Nazwa nowego pliku (np. about.html, css/main.css):');
  if (!name) return;
  if (name.trim() in S.project.files) return toast('Taki plik już istnieje', true);
  try {
    S.project = await api(`/api/projects/${S.project.id}/files`, { method: 'PUT', body: { path: name.trim(), content: '' } });
    S.dirty = false;
    S.file = Object.keys(S.project.files).find((f) => f === name.trim().replace(/^(\.\/|\/)+/, '')) || S.file;
    renderAll();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btn-rename-file').addEventListener('click', async () => {
  if (!S.file) return;
  if (S.dirty) return toast('Najpierw zapisz zmiany', true);
  const to = prompt('Nowa nazwa pliku:', S.file);
  if (!to || to === S.file) return;
  try {
    S.project = await api(`/api/projects/${S.project.id}/files/rename`, { method: 'POST', body: { from: S.file, to } });
    S.file = to.trim().replace(/^(\.\/|\/)+/, '');
    renderAll();
    reloadPreview();
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btn-delete-file').addEventListener('click', async () => {
  if (!S.file || !confirm(`Usunąć plik ${S.file}?`)) return;
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
});

// --- historia wersji
function renderVersions() {
  const vs = [...S.project.versions].reverse();
  $('#versions').innerHTML = vs.length
    ? vs
        .map(
          (v, i) => `
      <div class="version">
        <div><div>${esc(v.label)}</div><div class="muted small">${fmtDate(v.ts)}${i === 0 ? ' · aktualna' : ''}</div></div>
        ${i === 0 ? '' : `<button class="btn ghost small" data-restore="${v.id}">Przywróć</button>`}
      </div>`
        )
        .join('')
    : '<p class="muted">Brak wersji. Każda zmiana AI lub ręczny zapis tworzy nową wersję.</p>';
}
$('#versions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-restore]');
  if (b) restoreVersion(b.dataset.restore);
});

async function restoreVersion(versionId) {
  if (S.generating) return toast('Poczekaj na koniec generowania', true);
  if (!confirm('Przywrócić tę wersję? Obecny stan zostanie zachowany w historii.')) return;
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

// --- publikacja i pobieranie
function renderPublish() {
  const pub = S.project.published;
  $('#btn-publish').textContent = pub ? 'Aktualizuj publikację' : 'Opublikuj';
  const info = $('#publish-info');
  if (pub) {
    const url = location.origin + pub.url;
    info.innerHTML = `🌐 <a href="${esc(pub.url)}" target="_blank">${esc(url)}</a> · <button class="link small" id="btn-copy">kopiuj</button> · <button class="link small danger-text" id="btn-unpublish">cofnij publikację</button>`;
  } else info.textContent = '';
}
$('#btn-publish').addEventListener('click', async () => {
  try {
    S.project = await api(`/api/projects/${S.project.id}/publish`, { method: 'POST' });
    renderPublish();
    toast('Opublikowano!');
  } catch (err) {
    toast(err.message, true);
  }
});
$('#publish-info').addEventListener('click', async (e) => {
  if (e.target.id === 'btn-copy') {
    try {
      await navigator.clipboard.writeText(location.origin + S.project.published.url);
      toast('Skopiowano link');
    } catch {
      toast('Nie udało się skopiować', true);
    }
  } else if (e.target.id === 'btn-unpublish') {
    if (!confirm('Cofnąć publikację? Link przestanie działać.')) return;
    try {
      S.project = await api(`/api/projects/${S.project.id}/publish`, { method: 'DELETE' });
      renderPublish();
      toast('Publikacja cofnięta');
    } catch (err) {
      toast(err.message, true);
    }
  }
});
$('#btn-download').addEventListener('click', () => {
  if (!Object.keys(S.project.files).length) return toast('Projekt nie ma jeszcze plików', true);
  location.href = `/api/projects/${S.project.id}/download`;
});

window.addEventListener('beforeunload', (e) => {
  if (S.dirty || S.generating) e.preventDefault();
});

// ---------- start ----------
api('/api/status')
  .then((s) => {
    $('#mode-badge').textContent = s.mode === 'demo' ? 'TRYB DEMO (brak klucza API)' : `AI: ${s.model}`;
    $('#mode-badge').classList.toggle('warn', s.mode === 'demo');
  })
  .catch(() => {});
route();
