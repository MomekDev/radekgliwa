import express from 'express';
import JSZip from 'jszip';
import path from 'path';
import { fileURLToPath } from 'url';
import * as D from './db.js';
import { safePath, slugify, rateLimit, mimeOf, TEXT_EXT, has, RULES_FILE, parseRules, normalizeRule } from './util.js';
import { startJob, getJob, stopJob, DEMO, MODEL } from './ai.js';
import { mountBuilderPayments } from './payments.js';
import { normalizeDomain, domainView, checkDomain, projectForHost, invalidateDomainCache, dnsTargets } from './domains.js';
import { createSitesApp } from './sites.js';

const here = path.dirname(fileURLToPath(import.meta.url));

// ---------- konfiguracja ----------
const PORT = Number(process.env.PORT || 3000);
const SITES_MODE = process.env.SITES_HOST ? 'host' : process.env.SITES_MODE === 'same' ? 'same' : 'port';
// SITES_WILDCARD=1 (z SITES_HOST): każdy projekt na własnej subdomenie – pełna izolacja stron różnych użytkowników
// SITES_HOST może zawierać port (np. sites.localhost:3000) – do porównań używamy samej nazwy hosta
const SITES_HOSTNAME = (process.env.SITES_HOST || '').split(':')[0];
const WILDCARD = SITES_MODE === 'host' && process.env.SITES_WILDCARD === '1' ? process.env.SITES_HOST : null;
const SITES_PORT = Number(process.env.SITES_PORT || PORT + 1);
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== '0';
// ufamy nagłówkom X-Forwarded-* tylko od proxy w sieci prywatnej (np. Nginx, Caddy, Render) – chyba że ustawiono inaczej
const TRUST_PROXY = process.env.TRUST_PROXY === '1' ? true : process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal';
const SECURE_COOKIES = (process.env.PUBLIC_URL || '').startsWith('https://');

// adres serwera stron widziany z przeglądarki
function sitesUrl(req) {
  if (process.env.SITES_URL) return process.env.SITES_URL.replace(/\/$/, '');
  if (SITES_MODE === 'host') return `${req.protocol}://${process.env.SITES_HOST}`;
  if (SITES_MODE === 'same') return `${req.protocol}://${req.get('host')}`;
  return `${req.protocol}://${req.hostname}:${SITES_PORT}`;
}

// adresy podglądu i publikacji projektu
function siteUrls(req, p) {
  if (WILDCARD) {
    const proto = process.env.SITES_PROTOCOL || req.protocol;
    return { preview: `${proto}://${p.preview_key}.${WILDCARD}/`, published: p.slug ? `${proto}://${p.slug}.${WILDCARD}/` : null };
  }
  const base = sitesUrl(req);
  return { preview: `${base}/preview/${p.preview_key}/`, published: p.slug ? `${base}/s/${p.slug}/` : `${base}/p/${p.id}/` };
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', TRUST_PROXY);

// własne domeny: żądania na zweryfikowaną domenę obsługuje serwer stron
const domainSites = createSitesApp({ builderOrigin: () => '' });
app.use((req, res, next) => (projectForHost(req.hostname) ? domainSites(req, res, next) : next()));

// dla Caddy (on_demand_tls): czy wolno wystawić certyfikat dla tej domeny
app.get('/_kreator/tls-allowed', (req, res) => {
  const d = String(req.query.domain || '').toLowerCase();
  const sh = SITES_HOSTNAME;
  const pub = (() => {
    try {
      return new URL(process.env.PUBLIC_URL).hostname;
    } catch {
      return null;
    }
  })();
  const ok = projectForHost(d) || d === sh || d === pub || (WILDCARD && sh && d.endsWith('.' + sh) && d.slice(0, -(sh.length + 1)).indexOf('.') === -1);
  res.sendStatus(ok ? 200 : 404);
});

// tryb jednej domeny: strony użytkowników na podanym hoście
let sitesApp = null;
if (SITES_MODE === 'host') {
  sitesApp = createSitesApp({ builderOrigin: () => process.env.PUBLIC_URL || '', wildcardHost: WILDCARD ? SITES_HOSTNAME : null });
  const SH = SITES_HOSTNAME;
  app.use((req, res, next) => (req.hostname === SH || (WILDCARD && req.hostname.endsWith('.' + SH)) ? sitesApp(req, res, next) : next()));
}

app.use(express.json({ limit: '30mb' }));
app.use((err, req, res, next) => res.status(400).json({ error: 'Nieprawidłowe dane' }));
app.use(express.static(path.join(here, '..', 'public'), { index: 'index.html' }));
app.use('/vendor/codemirror', express.static(path.join(here, '..', 'node_modules', 'codemirror'), { maxAge: '7d' }));

// ---------- sesje i ochrona CSRF ----------
function getCookie(req, name) {
  const m = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  // wymuszamy własny nagłówek przy zmianach – przeglądarka nie pozwoli go wysłać obcej stronie bez CORS
  if (req.method !== 'GET' && req.get('X-Kreator') !== '1') return res.status(403).json({ error: 'Brak nagłówka X-Kreator' });
  const token = getCookie(req, COOKIE);
  if (token) {
    const u = D.one('SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?', token, Date.now());
    if (u) req.user = { ...u };
  }
  next();
});

const COOKIE = SECURE_COOKIES ? '__Host-sid' : 'sid';
function setSessionCookie(req, res, userId) {
  const token = D.newToken();
  const maxAge = 30 * 86400;
  D.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', token, userId, Date.now() + maxAge * 1000);
  res.set('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${req.secure || SECURE_COOKIES ? '; Secure' : ''}`);
}

const DUMMY_HASH = D.hashPassword('nie-istnieje-' + D.newToken());
const userOut = (u) => ({ id: u.id, email: u.email, name: u.name });

// ---------- konta ----------
app.get('/api/status', (req, res) =>
  res.json({ mode: DEMO ? 'demo' : 'live', model: MODEL, sitesUrl: sitesUrl(req), allowSignup: ALLOW_SIGNUP, user: req.user ? userOut(req.user) : null })
);

app.post('/api/auth/register', (req, res) => {
  if (!ALLOW_SIGNUP) return res.status(403).json({ error: 'Rejestracja jest wyłączona' });
  if (!rateLimit(`reg:${req.ip}`, 10, 3600_000)) return res.status(429).json({ error: 'Za dużo prób – spróbuj później' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim().slice(0, 60) || email.split('@')[0];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Podaj prawidłowy adres e-mail' });
  if (password.length < 8) return res.status(400).json({ error: 'Hasło musi mieć co najmniej 8 znaków' });
  if (D.one('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'Konto z tym adresem już istnieje' });
  const id = D.newId(8);
  D.run('INSERT INTO users (id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)', id, email, name, D.hashPassword(password), Date.now());
  setSessionCookie(req, res, id);
  res.status(201).json({ user: { id, email, name } });
});

app.post('/api/auth/login', (req, res) => {
  if (!rateLimit(`login:${req.ip}`, 20, 600_000)) return res.status(429).json({ error: 'Za dużo prób – spróbuj za kilka minut' });
  const email = String(req.body?.email || '').trim().toLowerCase();
  const u = D.one('SELECT * FROM users WHERE email = ?', email);
  const okPass = D.verifyPassword(String(req.body?.password || ''), u ? u.pass_hash : DUMMY_HASH);
  if (!u || !okPass) return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło' });
  setSessionCookie(req, res, u.id);
  res.json({ user: userOut(u) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getCookie(req, COOKIE);
  if (token) D.run('DELETE FROM sessions WHERE token = ?', token);
  res.set('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${SECURE_COOKIES ? '; Secure' : ''}`);
  res.json({ ok: true });
});

app.patch('/api/auth/me', requireUser, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 60);
  if (name) D.run('UPDATE users SET name = ? WHERE id = ?', name, req.user.id);
  if (req.body?.newPassword !== undefined) {
    const u = D.one('SELECT pass_hash FROM users WHERE id = ?', req.user.id);
    if (!D.verifyPassword(String(req.body.currentPassword || ''), u.pass_hash)) return res.status(400).json({ error: 'Obecne hasło jest nieprawidłowe' });
    if (String(req.body.newPassword).length < 8) return res.status(400).json({ error: 'Nowe hasło musi mieć co najmniej 8 znaków' });
    D.run('UPDATE users SET pass_hash = ? WHERE id = ?', D.hashPassword(String(req.body.newPassword)), req.user.id);
    D.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', req.user.id, getCookie(req, COOKIE) || '');
  }
  res.json({ user: userOut(D.one('SELECT * FROM users WHERE id = ?', req.user.id)) });
});

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Zaloguj się' });
  next();
}

app.get('/api/usage', requireUser, (req, res) => {
  const total = D.one('SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COUNT(*) AS requests FROM usage WHERE user_id = ?', req.user.id);
  const month = D.one('SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COUNT(*) AS requests FROM usage WHERE user_id = ? AND ts > ?', req.user.id, Date.now() - 30 * 86400_000);
  res.json({ total, month });
});

// treść odpowiedzi AI bez zawartości plików (interfejs potrzebuje tylko opisu i listy plików)
function stripBodies(text) {
  return String(text).replace(/(<(file|edit)\s+path="[^"]+"\s*>)[\s\S]*?(^|\n)(<\/\2>)/g, '$1\n$4');
}

// ---------- projekty ----------
const MAX_PROJECTS = Number(process.env.MAX_PROJECTS || 100);
const isHexId = (s) => /^[a-f0-9]{12}([a-f0-9]{4})?$/.test(s);
const RESERVED_SLUGS = new Set(['www', 'api', 'app', 'admin', 'mail', 'static', 'assets', 'preview', 'sites']);
function customDomainUrl(pid) {
  const d = D.one('SELECT domain FROM domains WHERE project_id = ? AND verified_at IS NOT NULL ORDER BY created_at LIMIT 1', pid);
  return d ? `https://${d.domain}/` : null;
}

function projectView(p, req) {
  const urls = siteUrls(req, p);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    files: p.files,
    assets: D.listAssets(p.id),
    messages: D.getMessages(p.id).map((m) => (m.role === 'assistant' && m.meta?.status !== 'running' ? { ...m, content: stripBodies(m.content) } : m)),
    versions: D.all('SELECT id, label, ts FROM versions WHERE project_id = ? ORDER BY ts', p.id),
    instructions: p.instructions || '',
    quality: p.quality || '',
    previewUrl: urls.preview,
    slugPrefix: WILDCARD ? null : `${sitesUrl(req).replace(/^https?:\/\//, '')}/s/`,
    slugSuffix: WILDCARD ? `.${WILDCARD}` : null,
    published: p.published_at && urls.published
      ? {
          at: p.published_at,
          url: customDomainUrl(p.id) || urls.published,
          defaultUrl: urls.published,
          outdated: JSON.stringify(p.files) !== JSON.stringify(p.published_files),
        }
      : null,
    domains: D.all('SELECT domain, verified_at FROM domains WHERE project_id = ? ORDER BY created_at', p.id).map((d) => ({ domain: d.domain, verified: !!d.verified_at })),
    generating: !!getJob(p.id),
  };
}

function withProject(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Zaloguj się' });
  const p = D.getProject(req.params.id);
  if (!p || p.user_id !== req.user.id) return res.status(404).json({ error: 'Nie znaleziono projektu' });
  req.project = p;
  next();
}

function notBusy(req, res, next) {
  if (getJob(req.project.id)) return res.status(409).json({ error: 'Trwa generowanie – poczekaj lub je zatrzymaj' });
  next();
}

app.get('/api/projects', requireUser, (req, res) => {
  const rows = D.all('SELECT id, name, slug, preview_key, files != \'{}\' AS has_files, published_at, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC', req.user.id);
  res.json(
    rows.map((p) => ({
      id: p.id,
      name: p.name,
      updatedAt: p.updated_at,
      createdAt: p.created_at,
      hasFiles: !!p.has_files,
      published: !!p.published_at,
      previewUrl: siteUrls(req, p).preview,
      generating: !!getJob(p.id),
    }))
  );
});

app.post('/api/projects', requireUser, (req, res) => {
  const now = Date.now();
  const id = D.newId();
  if (D.one('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?', req.user.id).n >= MAX_PROJECTS) return res.status(403).json({ error: `Osiągnięto limit ${MAX_PROJECTS} projektów – usuń niepotrzebne` });
  D.run('INSERT INTO projects (id, user_id, name, files, preview_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, req.user.id, String(req.body?.name || 'Nowy projekt').slice(0, 80), '{}', D.newId(8), now, now);
  res.status(201).json(projectView(D.getProject(id), req));
});

app.get('/api/projects/:id', withProject, (req, res) => res.json(projectView(req.project, req)));

app.patch('/api/projects/:id', withProject, (req, res) => {
  const p = req.project;
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'Nazwa nie może być pusta' });
    D.run('UPDATE projects SET name = ? WHERE id = ?', name.slice(0, 80), p.id);
  }
  if (req.body?.quality !== undefined) {
    const q = ['low', 'medium', 'high'].includes(req.body.quality) ? req.body.quality : '';
    D.run('UPDATE projects SET quality = ? WHERE id = ?', q, p.id);
  }
  if (req.body?.instructions !== undefined) {
    D.run('UPDATE projects SET instructions = ? WHERE id = ?', String(req.body.instructions).slice(0, 5000), p.id);
  }
  if (req.body?.slug !== undefined) {
    const slug = req.body.slug ? slugify(req.body.slug) : null;
    if (slug !== null && slug.length < 3) return res.status(400).json({ error: 'Adres musi mieć co najmniej 3 znaki (litery, cyfry, myślniki)' });
    if (slug && (isHexId(slug) || RESERVED_SLUGS.has(slug))) return res.status(400).json({ error: 'Ten adres jest zarezerwowany – wybierz inny' });
    if (slug && D.one('SELECT id FROM projects WHERE slug = ? AND id != ?', slug, p.id)) return res.status(409).json({ error: 'Ten adres jest już zajęty' });
    D.run('UPDATE projects SET slug = ? WHERE id = ?', slug, p.id);
  }
  D.touchProject(p.id);
  res.json(projectView(D.getProject(p.id), req));
});

app.delete('/api/projects/:id', withProject, notBusy, (req, res) => {
  D.run('DELETE FROM projects WHERE id = ?', req.project.id);
  res.json({ ok: true });
});

app.post('/api/projects/:id/duplicate', withProject, (req, res) => {
  const src = req.project;
  if (D.one('SELECT COUNT(*) AS n FROM projects WHERE user_id = ?', req.user.id).n >= MAX_PROJECTS) return res.status(403).json({ error: `Osiągnięto limit ${MAX_PROJECTS} projektów – usuń niepotrzebne` });
  const id = D.newId();
  const now = Date.now();
  D.tx(() => {
    D.run('INSERT INTO projects (id, user_id, name, files, instructions, preview_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', id, req.user.id, `${src.name} (kopia)`.slice(0, 80), JSON.stringify(src.files), src.instructions || '', D.newId(8), now, now);
    D.run('INSERT INTO assets (project_id, name, mime, data, size, ts) SELECT ?, name, mime, data, size, ts FROM assets WHERE project_id = ?', id, src.id);
    D.run('INSERT INTO versions (id, project_id, label, files, ts) VALUES (?, ?, ?, ?, ?)', D.newId(), id, `Kopia projektu „${src.name}”`, JSON.stringify(src.files), now);
  });
  res.status(201).json(projectView(D.getProject(id), req));
});

// --- pliki (ręczna edycja)
app.put('/api/projects/:id/files', withProject, notBusy, (req, res) => {
  const p = req.project;
  const fp = safePath(req.body?.path);
  if (!fp || !TEXT_EXT.test(fp)) return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku (dozwolone: .html, .css, .js, .json, .svg, .txt, .md, .xml)' });
  if (fp.startsWith('assets/') && D.one('SELECT 1 FROM assets WHERE project_id = ? AND name = ?', p.id, fp)) return res.status(409).json({ error: 'Istnieje już wgrany plik o tej nazwie' });
  const content = String(req.body?.content ?? '');
  if (content.length > 2_000_000) return res.status(413).json({ error: 'Plik jest za duży' });
  const isNew = !has(p.files, fp);
  if (!isNew && p.files[fp] === content) return res.json(projectView(p, req));
  D.saveFiles(p.id, { ...p.files, [fp]: content }, isNew ? `Nowy plik: ${fp}` : `Ręczna edycja: ${fp}`);
  res.json(projectView(D.getProject(p.id), req));
});

app.post('/api/projects/:id/files/rename', withProject, notBusy, (req, res) => {
  const p = req.project;
  const from = safePath(req.body?.from);
  const to = safePath(req.body?.to);
  if (!from || !has(p.files, from)) return res.status(404).json({ error: 'Brak pliku' });
  if (!to || !TEXT_EXT.test(to)) return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku' });
  if (has(p.files, to)) return res.status(409).json({ error: 'Plik o tej nazwie już istnieje' });
  const files = { ...p.files, [to]: p.files[from] };
  delete files[from];
  D.saveFiles(p.id, files, `Zmiana nazwy: ${from} → ${to}`);
  res.json(projectView(D.getProject(p.id), req));
});

app.delete('/api/projects/:id/files', withProject, notBusy, (req, res) => {
  const p = req.project;
  const fp = safePath(req.query.path);
  if (!fp || !has(p.files, fp)) return res.status(404).json({ error: 'Brak pliku' });
  const files = { ...p.files };
  delete files[fp];
  D.saveFiles(p.id, files, `Usunięto plik: ${fp}`);
  res.json(projectView(D.getProject(p.id), req));
});

// --- wgrane pliki binarne (obrazy itp.)
const ASSET_MIME = /^(image\/(png|jpeg|gif|webp|svg\+xml|x-icon)|video\/(mp4|webm)|audio\/mpeg|font\/(woff2?)|application\/pdf)$/;
app.post('/api/projects/:id/assets', withProject, (req, res) => {
  const p = req.project;
  let name = String(req.body?.name || '').toLowerCase().replace(/[^\w.\-]+/g, '-').replace(/^-+/, '');
  if (!name || !/\.\w+$/.test(name)) return res.status(400).json({ error: 'Nieprawidłowa nazwa pliku' });
  name = safePath('assets/' + name);
  const mime = mimeOf(name);
  if (!name || !ASSET_MIME.test(mime)) return res.status(400).json({ error: 'Dozwolone: obrazy, wideo MP4/WEBM, MP3, czcionki WOFF, PDF' });
  if (has(p.files, name)) return res.status(409).json({ error: 'W projekcie jest już plik o tej nazwie' });
  const data = Buffer.from(String(req.body?.data || ''), 'base64');
  if (!data.length) return res.status(400).json({ error: 'Pusty plik' });
  if (data.length > 10 * 1024 * 1024) return res.status(413).json({ error: 'Maksymalny rozmiar pliku to 10 MB' });
  const total = D.one('SELECT COALESCE(SUM(size),0) AS s FROM assets WHERE project_id = ?', p.id).s;
  if (total + data.length > 100 * 1024 * 1024) return res.status(413).json({ error: 'Przekroczono limit 100 MB plików w projekcie' });
  D.run('INSERT OR REPLACE INTO assets (project_id, name, mime, data, size, ts) VALUES (?, ?, ?, ?, ?, ?)', p.id, name, mime, data, data.length, Date.now());
  D.touchProject(p.id);
  res.status(201).json({ name, project: projectView(D.getProject(p.id), req) });
});

app.delete('/api/projects/:id/assets', withProject, (req, res) => {
  const r = D.run('DELETE FROM assets WHERE project_id = ? AND name = ?', req.project.id, String(req.query.name || ''));
  if (!r.changes) return res.status(404).json({ error: 'Brak pliku' });
  res.json(projectView(D.getProject(req.project.id), req));
});

// --- wersje
app.post('/api/projects/:id/restore', withProject, notBusy, (req, res) => {
  const v = D.one('SELECT * FROM versions WHERE id = ? AND project_id = ?', String(req.body?.versionId || ''), req.project.id);
  if (!v) return res.status(404).json({ error: 'Nie znaleziono wersji' });
  D.saveFiles(req.project.id, JSON.parse(v.files), `Przywrócono: ${v.label}`);
  res.json(projectView(D.getProject(req.project.id), req));
});

// --- publikacja
app.post('/api/projects/:id/publish', withProject, (req, res) => {
  const p = req.project;
  if (!p.files['index.html']) return res.status(400).json({ error: 'Projekt nie ma pliku index.html' });
  let slug = p.slug;
  if (!slug) {
    // adres z pierwszych słów nazwy, bez wielokropka
    const base = slugify(p.name.replace(/…$/, '').split(' ').slice(0, 4).join(' ')) || 'strona';
    slug = base.length >= 3 && !RESERVED_SLUGS.has(base) && !isHexId(base) ? base : `strona-${base}`.slice(0, 40);
    for (let i = 0; D.one('SELECT id FROM projects WHERE slug = ? AND id != ?', slug, p.id); i++) slug = `${slug.slice(0, 30).replace(/-+$/, '')}-${D.newId(3)}`;
  }
  D.run('UPDATE projects SET published_files = ?, published_at = ?, slug = ? WHERE id = ?', JSON.stringify(p.files), Date.now(), slug, p.id);
  res.json(projectView(D.getProject(p.id), req));
});

app.delete('/api/projects/:id/publish', withProject, (req, res) => {
  D.run('UPDATE projects SET published_files = NULL, published_at = NULL WHERE id = ?', req.project.id);
  res.json(projectView(D.getProject(req.project.id), req));
});

// --- eksport ZIP (z dołączonym SDK, żeby baza danych działała także po pobraniu)
app.get('/api/projects/:id/download', withProject, async (req, res) => {
  const p = req.project;
  const zip = new JSZip();
  const sdkBase = WILDCARD ? `${process.env.SITES_PROTOCOL || req.protocol}://${WILDCARD}` : sitesUrl(req);
  const sdkTag = `<script src="${sdkBase}/_kreator/sdk.js" data-project="${p.id}"></script>`;
  for (const [name, content] of Object.entries(p.files)) {
    let body = content;
    if (/\.html?$/.test(name)) {
      const m = body.match(/<head[^>]*>/i);
      body = m ? body.slice(0, m.index + m[0].length) + sdkTag + body.slice(m.index + m[0].length) : sdkTag + body;
    }
    zip.file(name, body);
  }
  for (const a of D.all('SELECT name, data FROM assets WHERE project_id = ?', p.id)) zip.file(a.name, Buffer.from(a.data));
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  res.set('Content-Type', 'application/zip');
  res.set('Content-Disposition', `attachment; filename="${slugify(p.name) || 'strona'}.zip"`);
  res.send(buf);
});

// --- czat z AI
const IMG_TYPES = /^image\/(png|jpeg|gif|webp)$/;
app.post('/api/projects/:id/chat', withProject, (req, res) => {
  const p = req.project;
  const message = String(req.body?.message || '').trim().slice(0, 20000);
  if (!message) return res.status(400).json({ error: 'Wiadomość jest pusta' });
  if (!rateLimit(`ai:${req.user.id}`, Number(process.env.AI_RATE_LIMIT || 30), 3600_000)) return res.status(429).json({ error: 'Osiągnięto limit wiadomości do AI na godzinę' });
  const images = Array.isArray(req.body?.images) ? req.body.images.slice(0, 4) : [];
  for (const img of images) {
    if (!IMG_TYPES.test(img?.media_type) || typeof img?.data !== 'string') return res.status(400).json({ error: 'Nieobsługiwany format obrazu (PNG, JPG, GIF, WEBP)' });
  }
  const sel = req.body?.selection;
  const selection = sel && typeof sel === 'object' ? { selector: String(sel.selector || '').slice(0, 300), html: String(sel.html || '').slice(0, 2000), page: String(sel.page || '').slice(0, 200) } : null;
  const errors = Array.isArray(req.body?.errors) ? req.body.errors.slice(0, 10).map((e) => String(e).slice(0, 600)) : null;
  try {
    startJob(p, req.user.id, { message, images, mode: req.body?.mode === 'chat' ? 'chat' : 'build', selection, errors });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
  res.status(202).json({ ok: true });
});

app.post('/api/projects/:id/stop', withProject, (req, res) => res.json({ stopped: stopJob(req.project.id) }));

// strumień SSE z postępem generowania (można się podłączyć ponownie w każdej chwili)
app.get('/api/projects/:id/stream', withProject, (req, res) => {
  const p = req.project;
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const job = getJob(p.id);
  if (!job) {
    send('done', { project: projectView(D.getProject(p.id), req), changed: [], note: null });
    return res.end();
  }
  send('snapshot', { text: job.text });
  const onDelta = (t) => send('delta', { text: t });
  const onDone = (r) => {
    const fresh = D.getProject(p.id);
    if (fresh) send('done', { project: projectView(fresh, req), ...r });
    cleanup();
    res.end();
  };
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  function cleanup() {
    clearInterval(ping);
    job.off('delta', onDelta);
    job.off('done', onDone);
  }
  job.on('delta', onDelta);
  job.on('done', onDone);
  req.on('close', cleanup);
});

// --- dane aplikacji (panel „Baza danych”)
const validColl = (c) => /^[A-Za-z][\w-]{0,49}$/.test(c);
const recordOut = (r) => ({ id: r.id, owner_id: r.owner_id, created_at: r.created_at, updated_at: r.updated_at, data: JSON.parse(r.data) });

app.get('/api/projects/:id/data', withProject, (req, res) => {
  const pid = req.project.id;
  const allRules = parseRules(req.project.files[RULES_FILE]);
  const cols = D.all('SELECT collection AS name, COUNT(*) AS count FROM app_records WHERE project_id = ? GROUP BY collection', pid);
  for (const name of Object.keys(allRules)) if (name !== '*' && /^[A-Za-z][\w-]{0,49}$/.test(name) && !cols.some((c) => c.name === name)) cols.push({ name, count: 0 });
  cols.sort((a, b) => a.name.localeCompare(b.name));
  for (const c of cols) c.rules = normalizeRule(Object.hasOwn(allRules, c.name) ? allRules[c.name] : allRules['*']);
  res.json({
    collections: cols,
    users: D.all('SELECT id, email, name, created_at FROM app_users WHERE project_id = ? ORDER BY created_at DESC', pid),
  });
});

app.get('/api/projects/:id/data/:coll', withProject, (req, res) => {
  if (!validColl(req.params.coll)) return res.status(400).json({ error: 'Nieprawidłowa kolekcja' });
  res.json(D.all('SELECT * FROM app_records WHERE project_id = ? AND collection = ? ORDER BY created_at DESC LIMIT 1000', req.project.id, req.params.coll).map(recordOut));
});

app.post('/api/projects/:id/data/:coll', withProject, (req, res) => {
  if (!validColl(req.params.coll)) return res.status(400).json({ error: 'Nieprawidłowa nazwa kolekcji (litery, cyfry, _ i -, zaczyna się literą)' });
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Dane muszą być obiektem JSON' });
  const id = D.newId(8);
  const now = Date.now();
  D.run('INSERT INTO app_records (id, project_id, collection, owner_id, data, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)', id, req.project.id, req.params.coll, JSON.stringify(data), now, now);
  res.status(201).json(recordOut(D.one('SELECT * FROM app_records WHERE id = ?', id)));
});

app.put('/api/projects/:id/data/:coll/:rid', withProject, (req, res) => {
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'Dane muszą być obiektem JSON' });
  for (const k of ['id', 'created_at', 'updated_at', 'owner_id']) delete data[k];
  const r = D.run('UPDATE app_records SET data = ?, updated_at = ? WHERE id = ? AND project_id = ? AND collection = ?', JSON.stringify(data), Date.now(), req.params.rid, req.project.id, req.params.coll);
  if (!r.changes) return res.status(404).json({ error: 'Rekord nie istnieje' });
  res.json(recordOut(D.one('SELECT * FROM app_records WHERE id = ?', req.params.rid)));
});

app.delete('/api/projects/:id/data/:coll/:rid', withProject, (req, res) => {
  const r = D.run('DELETE FROM app_records WHERE id = ? AND project_id = ? AND collection = ?', req.params.rid, req.project.id, req.params.coll);
  if (!r.changes) return res.status(404).json({ error: 'Rekord nie istnieje' });
  res.json({ ok: true });
});

app.delete('/api/projects/:id/data/:coll', withProject, (req, res) => {
  D.run('DELETE FROM app_records WHERE project_id = ? AND collection = ?', req.project.id, req.params.coll);
  res.json({ ok: true });
});

app.delete('/api/projects/:id/app-users/:uid', withProject, (req, res) => {
  const r = D.run('DELETE FROM app_users WHERE id = ? AND project_id = ?', req.params.uid, req.project.id);
  if (!r.changes) return res.status(404).json({ error: 'Użytkownik nie istnieje' });
  res.json({ ok: true });
});

// --- własne domeny
const domainsOf = (pid) => D.all('SELECT * FROM domains WHERE project_id = ? ORDER BY created_at', pid).map(domainView);
app.get('/api/projects/:id/domains', withProject, (req, res) => res.json({ domains: domainsOf(req.project.id), targets: dnsTargets() }));

app.post('/api/projects/:id/domains', withProject, (req, res) => {
  const d = normalizeDomain(req.body?.domain);
  if (!d) return res.status(400).json({ error: 'Podaj prawidłową domenę, np. mojafirma.pl albo sklep.mojafirma.pl' });
  const own = [SITES_HOSTNAME, (() => { try { return new URL(process.env.PUBLIC_URL).hostname; } catch { return ''; } })(), 'localhost'].filter(Boolean);
  if (own.some((h) => d === h || d.endsWith('.' + h))) return res.status(400).json({ error: 'Tej domeny nie można podłączyć' });
  const existing = D.one('SELECT project_id, verified_at FROM domains WHERE domain = ?', d);
  if (existing?.project_id === req.project.id) return res.status(409).json({ error: 'Ta domena jest już dodana' });
  if (existing?.verified_at) return res.status(409).json({ error: 'Ta domena jest już podłączona do innego projektu' });
  // niezweryfikowane zgłoszenie nie blokuje prawdziwego właściciela – domenę dostaje ten, kto potwierdzi ją rekordem TXT
  if (existing) D.run('DELETE FROM domains WHERE domain = ? AND verified_at IS NULL', d);
  if (D.one('SELECT COUNT(*) AS n FROM domains WHERE project_id = ?', req.project.id).n >= 10) return res.status(400).json({ error: 'Maksymalnie 10 domen na projekt' });
  D.run('INSERT INTO domains (domain, project_id, token, created_at) VALUES (?, ?, ?, ?)', d, req.project.id, D.newId(10), Date.now());
  res.status(201).json({ domains: domainsOf(req.project.id), targets: dnsTargets() });
});

app.post('/api/projects/:id/domains/:domain/verify', withProject, async (req, res) => {
  const row = D.one('SELECT * FROM domains WHERE domain = ? AND project_id = ?', String(req.params.domain).toLowerCase(), req.project.id);
  if (!row) return res.status(404).json({ error: 'Nie ma takiej domeny w projekcie' });
  if (!rateLimit(`dns:${req.user.id}`, 30, 600_000)) return res.status(429).json({ error: 'Za dużo sprawdzeń – spróbuj za kilka minut' });
  const r = await checkDomain(row);
  D.run('UPDATE domains SET verified_at = ?, last_check_at = ?, last_error = ? WHERE domain = ?', r.ok ? row.verified_at || Date.now() : null, Date.now(), r.ok ? null : r.problems.join('\n'), row.domain);
  invalidateDomainCache();
  res.json({ ok: r.ok, problems: r.problems, domains: domainsOf(req.project.id), targets: dnsTargets() });
});

app.delete('/api/projects/:id/domains/:domain', withProject, (req, res) => {
  const r = D.run('DELETE FROM domains WHERE domain = ? AND project_id = ?', String(req.params.domain).toLowerCase(), req.project.id);
  if (!r.changes) return res.status(404).json({ error: 'Nie ma takiej domeny w projekcie' });
  invalidateDomainCache();
  res.json({ domains: domainsOf(req.project.id), targets: dnsTargets() });
});

// --- płatności Stripe (konfiguracja i zamówienia)
const sitesApiBase = (req) => (WILDCARD ? `${process.env.SITES_PROTOCOL || req.protocol}://${WILDCARD}` : sitesUrl(req));
mountBuilderPayments(app, { withProject, sitesApiBase });

app.use('/api', (req, res) => res.status(404).json({ error: 'Nieznany adres API' }));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- start ----------
if (SITES_MODE === 'same') {
  // jedna domena: strony w trybie sandbox (bez dostępu do kreatora, ale bez localStorage)
  app.use(createSitesApp({ builderOrigin: () => '', sandboxHeader: 'sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads' }));
}

app.listen(PORT, () => {
  console.log(`Kreator: http://localhost:${PORT}  (${DEMO ? 'TRYB DEMO – bez AI' : `AI: ${MODEL}`})`);
  if (!WILDCARD && ALLOW_SIGNUP && process.env.NODE_ENV === 'production') {
    console.warn('UWAGA: strony wszystkich użytkowników działają na wspólnym adresie. Jeśli kreator jest publiczny, ustaw SITES_HOST + SITES_WILDCARD=1 (patrz README), albo ALLOW_SIGNUP=0.');
  }
});

if (SITES_MODE === 'port') {
  // origin kreatora = ten sam host co strona, port kreatora
  const sites = createSitesApp({ builderOrigin: (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.hostname}:${PORT}` });
  sites.listen(SITES_PORT, () => console.log(`Strony użytkowników: http://localhost:${SITES_PORT}`));
}

setInterval(() => D.cleanupSessions(), 3600_000).unref();
