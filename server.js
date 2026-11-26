import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import JSZip from 'jszip';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseResponse } from './public/parser.js';
import { mockResponse } from './mock.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(here, 'data', 'projects');
const PORT = Number(process.env.PORT || 3000);
const MODEL = process.env.MODEL || 'claude-opus-5-5';
const EFFORT = process.env.EFFORT || 'medium';
const DEMO = process.env.DEMO === '1' || !process.env.ANTHROPIC_API_KEY;
const MAX_VERSIONS = 50;

await fs.mkdir(DATA_DIR, { recursive: true });
const client = DEMO ? null : new Anthropic();

// ---------- przechowywanie projektów (pliki JSON) ----------
const newId = () => crypto.randomBytes(6).toString('hex');
const projectFile = (id) => path.join(DATA_DIR, `${id}.json`);
const validId = (id) => /^[a-f0-9]{12}$/.test(id);

async function loadProject(id) {
  if (!validId(id)) return null;
  try {
    return JSON.parse(await fs.readFile(projectFile(id), 'utf8'));
  } catch {
    return null;
  }
}

async function saveProject(p) {
  p.updatedAt = Date.now();
  const tmp = projectFile(p.id) + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(p));
  await fs.rename(tmp, projectFile(p.id));
}

function safePath(p) {
  p = String(p || '').replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '').trim();
  if (!p || p.length > 200) return null;
  if (!/^[\w.\-/ ]+$/.test(p)) return null;
  if (p.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
  return p;
}

function addVersion(p, label) {
  const v = { id: newId(), ts: Date.now(), label: String(label).slice(0, 120), files: { ...p.files } };
  p.versions.push(v);
  if (p.versions.length > MAX_VERSIONS) p.versions.splice(0, p.versions.length - MAX_VERSIONS);
  return v;
}

const publicView = (p) => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  files: p.files,
  messages: p.messages,
  versions: p.versions.map(({ id, ts, label }) => ({ id, ts, label })),
  published: p.published ? { ts: p.published.ts, url: `/p/${p.id}/` } : null,
});

// ---------- AI ----------
const SYSTEM_PROMPT = `Jesteś ekspertem od tworzenia stron internetowych wbudowanym w kreator stron (podobny do Lovable / Bolt).
Użytkownik opisuje, jaką stronę chce, a Ty ją budujesz i poprawiasz w kolejnych wiadomościach.

TECHNOLOGIA
- Czysty HTML, CSS i JavaScript, bez kroku budowania (bez npm, bez JSX, bez TypeScriptu).
- Plik startowy to zawsze index.html. Możesz tworzyć dodatkowe pliki (style.css, script.js, kolejne podstrony .html) i łączyć je ścieżkami względnymi.
- Możesz używać bibliotek z CDN (np. Tailwind przez https://cdn.tailwindcss.com, Google Fonts, ikony Lucide, Alpine.js, Chart.js).
- Zdjęcia: używaj https://picsum.photos/seed/<słowo>/<szer>/<wys> albo SVG / gradientów. Nie wymyślaj nieistniejących lokalnych plików graficznych.
- Strona działa w ramce z sandboxem: localStorage/sessionStorage/cookies mogą być niedostępne, więc zawsze opakuj je w try/catch i zapewnij działanie bez nich.
- Twórz kompletne, dopracowane, responsywne (mobile-first) strony z realistyczną treścią – nigdy "lorem ipsum" ani placeholderów typu "tu wstaw tekst". Wszystkie przyciski, menu, formularze i interakcje mają faktycznie działać.

FORMAT ODPOWIEDZI (ściśle przestrzegaj)
1. Najpierw 1–3 zdania, co robisz.
2. Potem każdy nowy lub zmieniony plik w CAŁOŚCI, w takim bloku:
<file path="index.html">
...pełna zawartość pliku...
</file>
3. Aby usunąć plik: <delete path="nazwa.js" />
4. Na końcu krótkie podsumowanie zmian (lista punktów) i ewentualnie 1–2 propozycje kolejnych kroków.
Zasady: zawsze podawaj pełną zawartość zmienianego pliku (nie fragmenty, nie "...reszta bez zmian"). Pliki, których nie zmieniasz, pomijasz. Nie używaj bloków \`\`\` wokół plików. Jeśli użytkownik tylko o coś pyta, odpowiedz bez bloków <file>.
Odpowiadaj w języku, w którym pisze użytkownik.`;

function filesDump(files) {
  const names = Object.keys(files);
  if (!names.length) return 'Projekt jest pusty – nie ma jeszcze żadnych plików.';
  return (
    'AKTUALNE PLIKI PROJEKTU:\n\n' +
    names.map((n) => `<file path="${n}">\n${files[n]}\n</file>`).join('\n\n')
  );
}

function summarizeAssistant(raw) {
  const { chat, files, deletes } = parseResponse(raw);
  const parts = [chat || '(brak opisu)'];
  if (files.length) parts.push(`[Zapisane pliki: ${files.map((f) => f.path).join(', ')}]`);
  if (deletes.length) parts.push(`[Usunięte pliki: ${deletes.join(', ')}]`);
  return parts.join('\n');
}

function buildMessages(p, userText, images) {
  const history = p.messages.slice(-20);
  const msgs = [];
  for (const m of history) {
    const content = m.role === 'assistant' ? summarizeAssistant(m.content) : m.content;
    const last = msgs[msgs.length - 1];
    if (last && last.role === m.role) last.content += '\n\n' + content;
    else msgs.push({ role: m.role, content });
  }
  if (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (msgs.length && msgs[msgs.length - 1].role === 'user') msgs.push({ role: 'assistant', content: '(brak odpowiedzi)' });

  const content = [];
  for (const img of images) {
    content.push({ type: 'image', source: { type: 'base64', media_type: img.media_type, data: img.data } });
  }
  content.push({ type: 'text', text: `${filesDump(p.files)}\n\n---\nPROŚBA UŻYTKOWNIKA:\n${userText}` });
  msgs.push({ role: 'user', content });
  return msgs;
}

// Zwraca async iterator fragmentów tekstu oraz funkcję przerwania.
function startGeneration(p, userText, images) {
  if (DEMO) {
    let aborted = false;
    const text = mockResponse(p, userText);
    return {
      abort: () => (aborted = true),
      async *chunks() {
        for (let i = 0; i < text.length && !aborted; i += 40) {
          await new Promise((r) => setTimeout(r, 30));
          yield text.slice(i, i + 40);
        }
        if (aborted) throw Object.assign(new Error('aborted'), { aborted: true });
      },
      async final() {
        return { stop_reason: 'end_turn' };
      },
    };
  }
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: EFFORT },
    system: SYSTEM_PROMPT,
    messages: buildMessages(p, userText, images),
  });
  return {
    abort: () => stream.abort(),
    async *chunks() {
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
      }
    },
    final: () => stream.finalMessage(),
  };
}

// ---------- aplikacja ----------
const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(here, 'public')));

const busy = new Set();

app.get('/api/status', (req, res) => res.json({ mode: DEMO ? 'demo' : 'live', model: MODEL }));

app.get('/api/projects', async (req, res) => {
  const names = (await fs.readdir(DATA_DIR)).filter((n) => n.endsWith('.json'));
  const list = [];
  for (const n of names) {
    const p = await loadProject(n.slice(0, -5));
    if (p) list.push({ id: p.id, name: p.name, updatedAt: p.updatedAt, createdAt: p.createdAt, hasFiles: Object.keys(p.files).length > 0, published: !!p.published });
  }
  list.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json(list);
});

app.post('/api/projects', async (req, res) => {
  const now = Date.now();
  const p = {
    id: newId(),
    name: String(req.body?.name || 'Nowy projekt').slice(0, 80),
    createdAt: now,
    updatedAt: now,
    files: {},
    messages: [],
    versions: [],
    published: null,
  };
  await saveProject(p);
  res.status(201).json(publicView(p));
});

// middleware: wczytaj projekt
async function withProject(req, res, next) {
  const p = await loadProject(req.params.id);
  if (!p) return res.status(404).json({ error: 'Nie znaleziono projektu' });
  req.project = p;
  next();
}

app.get('/api/projects/:id', withProject, (req, res) => res.json(publicView(req.project)));

app.patch('/api/projects/:id', withProject, async (req, res) => {
  const p = req.project;
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nazwa nie może być pusta' });
  p.name = name.slice(0, 80);
  await saveProject(p);
  res.json(publicView(p));
});

app.delete('/api/projects/:id', withProject, async (req, res) => {
  if (busy.has(req.project.id)) return res.status(409).json({ error: 'Trwa generowanie – zatrzymaj je najpierw' });
  await fs.rm(projectFile(req.project.id), { force: true });
  res.json({ ok: true });
});

app.post('/api/projects/:id/duplicate', withProject, async (req, res) => {
  const src = req.project;
  const p = { ...structuredClone(src), id: newId(), name: `${src.name} (kopia)`, createdAt: Date.now(), published: null };
  await saveProject(p);
  res.status(201).json(publicView(p));
});

// zapis / utworzenie pliku (ręczna edycja)
app.put('/api/projects/:id/files', withProject, async (req, res) => {
  const p = req.project;
  if (busy.has(p.id)) return res.status(409).json({ error: 'Trwa generowanie' });
  const fp = safePath(req.body?.path);
  if (!fp) return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku' });
  const content = String(req.body?.content ?? '');
  const isNew = !(fp in p.files);
  if (!isNew && p.files[fp] === content) return res.json(publicView(p));
  p.files[fp] = content;
  addVersion(p, isNew ? `Nowy plik: ${fp}` : `Ręczna edycja: ${fp}`);
  await saveProject(p);
  res.json(publicView(p));
});

app.post('/api/projects/:id/files/rename', withProject, async (req, res) => {
  const p = req.project;
  if (busy.has(p.id)) return res.status(409).json({ error: 'Trwa generowanie' });
  const from = safePath(req.body?.from);
  const to = safePath(req.body?.to);
  if (!from || !(from in p.files)) return res.status(404).json({ error: 'Brak pliku' });
  if (!to) return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku' });
  if (to in p.files) return res.status(409).json({ error: 'Plik o tej nazwie już istnieje' });
  p.files[to] = p.files[from];
  delete p.files[from];
  addVersion(p, `Zmiana nazwy: ${from} → ${to}`);
  await saveProject(p);
  res.json(publicView(p));
});

app.delete('/api/projects/:id/files', withProject, async (req, res) => {
  const p = req.project;
  if (busy.has(p.id)) return res.status(409).json({ error: 'Trwa generowanie' });
  const fp = safePath(req.query.path);
  if (!fp || !(fp in p.files)) return res.status(404).json({ error: 'Brak pliku' });
  delete p.files[fp];
  addVersion(p, `Usunięto plik: ${fp}`);
  await saveProject(p);
  res.json(publicView(p));
});

app.post('/api/projects/:id/restore', withProject, async (req, res) => {
  const p = req.project;
  if (busy.has(p.id)) return res.status(409).json({ error: 'Trwa generowanie' });
  const v = p.versions.find((x) => x.id === req.body?.versionId);
  if (!v) return res.status(404).json({ error: 'Nie znaleziono wersji' });
  p.files = { ...v.files };
  addVersion(p, `Przywrócono: ${v.label}`);
  await saveProject(p);
  res.json(publicView(p));
});

app.post('/api/projects/:id/publish', withProject, async (req, res) => {
  const p = req.project;
  if (!p.files['index.html']) return res.status(400).json({ error: 'Projekt nie ma pliku index.html' });
  p.published = { ts: Date.now(), files: { ...p.files } };
  await saveProject(p);
  res.json(publicView(p));
});

app.delete('/api/projects/:id/publish', withProject, async (req, res) => {
  req.project.published = null;
  await saveProject(req.project);
  res.json(publicView(req.project));
});

app.get('/api/projects/:id/download', withProject, async (req, res) => {
  const p = req.project;
  const zip = new JSZip();
  for (const [name, content] of Object.entries(p.files)) zip.file(name, content);
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const slug = p.name.toLowerCase().normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'strona';
  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', `attachment; filename="${slug}.zip"`);
  res.send(buf);
});

// ---------- czat z AI (strumień SSE) ----------
app.post('/api/projects/:id/chat', withProject, async (req, res) => {
  const p = req.project;
  const userText = String(req.body?.message || '').trim();
  const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 4) : [];
  for (const img of images) {
    if (!/^image\/(png|jpeg|gif|webp)$/.test(img?.media_type) || typeof img?.data !== 'string') {
      return res.status(400).json({ error: 'Nieobsługiwany format obrazu (dozwolone: PNG, JPG, GIF, WEBP)' });
    }
  }
  if (!userText) return res.status(400).json({ error: 'Wiadomość jest pusta' });
  if (busy.has(p.id)) return res.status(409).json({ error: 'Ten projekt już się generuje' });
  busy.add(p.id);

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  const gen = startGeneration(p, userText, images);
  let finished = false;
  res.on('close', () => {
    if (!finished) gen.abort();
  });

  let raw = '';
  let note = null;
  try {
    for await (const t of gen.chunks()) {
      raw += t;
      send('delta', { text: t });
    }
    const msg = await gen.final();
    if (msg.stop_reason === 'refusal') note = 'Model odmówił wykonania tej prośby.';
    else if (msg.stop_reason === 'max_tokens') note = 'Odpowiedź została ucięta (limit długości) – zapisano tylko kompletne pliki. Napisz „kontynuuj”.';
  } catch (err) {
    const aborted = err?.aborted || err?.name === 'APIUserAbortError' || err instanceof Anthropic.APIUserAbortError;
    note = aborted ? 'Generowanie zatrzymane.' : `Błąd AI: ${err?.message || err}`;
    if (!aborted) console.error(err);
  }

  // zastosuj zmiany (tylko kompletne pliki)
  const parsed = parseResponse(raw);
  const changed = [];
  for (const f of parsed.files) {
    const fp = safePath(f.path);
    if (fp && f.complete) {
      p.files[fp] = f.content;
      changed.push(fp);
    }
  }
  for (const d of parsed.deletes) {
    const fp = safePath(d);
    if (fp && fp in p.files) {
      delete p.files[fp];
      changed.push(fp);
    }
  }

  p.messages.push({ role: 'user', content: userText, images: images.length, ts: Date.now() });
  const assistant = { role: 'assistant', content: raw || '', ts: Date.now() };
  if (note) assistant.note = note;
  if (changed.length) assistant.versionId = addVersion(p, userText).id;
  p.messages.push(assistant);
  if (p.name === 'Nowy projekt' && p.messages.length === 2) p.name = userText.split('\n')[0].slice(0, 50);

  finished = true;
  busy.delete(p.id);
  await saveProject(p);
  if (!res.writableEnded) {
    send('done', { project: publicView(p), changed, note });
    res.end();
  }
});

// ---------- podgląd i publikacja ----------
const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain', xml: 'application/xml', md: 'text/plain',
};

function serveFiles(getFiles) {
  return async (req, res) => {
    const id = req.params[0];
    let rest = req.params[1] || '';
    if (!req.path.endsWith('/') && rest === '') return res.redirect(301, req.originalUrl.replace(/(\?|$)/, '/$1'));
    const p = await loadProject(id);
    const files = p && getFiles(p);
    if (!files) return res.status(404).send('Nie znaleziono');
    rest = decodeURIComponent(rest);
    if (rest === '' || rest.endsWith('/')) rest += 'index.html';
    let content = files[rest];
    if (content === undefined && files[rest + '.html'] !== undefined) {
      rest += '.html';
      content = files[rest];
    }
    if (content === undefined) {
      if (!Object.keys(files).length) {
        return res.type('html').send('<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#888">Opisz w czacie, jaką stronę chcesz zbudować…</body>');
      }
      return res.status(404).type('html').send(`<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif">404 – brak pliku ${rest.replace(/[<>&]/g, '')}</p>`);
    }
    const ext = rest.split('.').pop().toLowerCase();
    res.set('Content-Type', `${MIME[ext] || 'text/plain'}; charset=utf-8`);
    res.set('Cache-Control', 'no-store');
    // strona użytkownika działa w osobnym (nieprzezroczystym) originie – nie ma dostępu do API kreatora
    res.set('Content-Security-Policy', 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads');
    res.send(content);
  };
}

app.get(/^\/preview\/([a-f0-9]{12})\/?(.*)$/, serveFiles((p) => p.files));
app.get(/^\/p\/([a-f0-9]{12})\/?(.*)$/, serveFiles((p) => p.published?.files));

app.listen(PORT, () => {
  console.log(`Kreator działa: http://localhost:${PORT}  (tryb: ${DEMO ? 'DEMO – bez AI' : `AI ${MODEL}`})`);
});
