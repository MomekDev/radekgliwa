// Serwer stron użytkowników: podgląd, publikacja, SDK backendu (baza danych + logowanie) i jego API.
// Działa na OSOBNYM originie niż kreator (inny port lub inna domena), więc strony nie mają dostępu do kreatora.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as D from './db.js';
import { safePath, mimeOf, escHtml, rateLimit } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createSitesApp({ builderOrigin, sandboxHeader }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // statyczne skrypty kreatora (SDK + mostek podglądu)
  app.use('/_kreator', express.static(path.join(here, '..', 'sites-static'), { maxAge: '5m' }));

  // ---------- API backendu aplikacji ----------
  const api = express.Router();
  api.use((req, res, next) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.set('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  api.use(express.json({ limit: '200kb' }));
  api.use((err, req, res, next) => res.status(400).json({ error: 'Nieprawidłowe dane JSON' }));

  api.use('/:pid', (req, res, next) => {
    const pid = req.params.pid;
    const p = D.one('SELECT id FROM projects WHERE id = ?', pid);
    if (!p) return res.status(404).json({ error: 'Aplikacja nie istnieje' });
    req.pid = pid;
    const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (m) {
      const s = D.one(
        `SELECT u.id, u.email, u.name FROM app_sessions s JOIN app_users u ON u.id = s.app_user_id
         WHERE s.token = ? AND s.project_id = ? AND s.expires_at > ?`,
        m[1], pid, Date.now()
      );
      if (s) req.appUser = { ...s };
    }
    next();
  });

  const limited = (name, limit, windowMs) => (req, res, next) => {
    if (!rateLimit(`${name}:${req.ip}:${req.pid}`, limit, windowMs)) return res.status(429).json({ error: 'Za dużo prób – spróbuj za chwilę' });
    next();
  };

  const userOut = (u) => ({ id: u.id, email: u.email, name: u.name });
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  function createSession(pid, userId) {
    const token = D.newToken();
    D.run('INSERT INTO app_sessions (token, project_id, app_user_id, expires_at) VALUES (?, ?, ?, ?)', token, pid, userId, Date.now() + 30 * 86400_000);
    return token;
  }

  api.post('/:pid/auth/signup', limited('signup', 10, 600_000), (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim().slice(0, 80);
    if (!validEmail(email)) return res.status(400).json({ error: 'Podaj prawidłowy adres e-mail' });
    if (password.length < 6) return res.status(400).json({ error: 'Hasło musi mieć co najmniej 6 znaków' });
    if (D.one('SELECT id FROM app_users WHERE project_id = ? AND email = ?', req.pid, email)) return res.status(409).json({ error: 'Konto z tym adresem już istnieje' });
    const id = D.newId(8);
    D.run('INSERT INTO app_users (id, project_id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)', id, req.pid, email, name, D.hashPassword(password), Date.now());
    res.status(201).json({ token: createSession(req.pid, id), user: { id, email, name } });
  });

  api.post('/:pid/auth/signin', limited('signin', 20, 600_000), (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const u = D.one('SELECT * FROM app_users WHERE project_id = ? AND email = ?', req.pid, email);
    if (!u || !D.verifyPassword(String(req.body?.password || ''), u.pass_hash)) return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło' });
    res.json({ token: createSession(req.pid, u.id), user: userOut(u) });
  });

  api.post('/:pid/auth/signout', (req, res) => {
    const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
    if (m) D.run('DELETE FROM app_sessions WHERE token = ?', m[1]);
    res.json({ ok: true });
  });

  api.get('/:pid/auth/me', (req, res) => res.json({ user: req.appUser || null }));

  // --- kolekcje danych
  const RESERVED = new Set(['id', 'created_at', 'updated_at', 'owner_id']);
  const validColl = (c) => /^[A-Za-z][\w-]{0,49}$/.test(c);
  const recordOut = (r) => ({ ...JSON.parse(r.data), id: r.id, created_at: r.created_at, updated_at: r.updated_at, owner_id: r.owner_id });
  const cleanData = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const out = {};
    for (const [k, v] of Object.entries(body)) if (!RESERVED.has(k)) out[k] = v;
    return out;
  };
  const MAX_RECORDS = Number(process.env.APP_MAX_RECORDS || 20000);

  api.use('/:pid/db/:coll', (req, res, next) => {
    if (!validColl(req.params.coll)) return res.status(400).json({ error: 'Nieprawidłowa nazwa kolekcji' });
    next();
  });

  api.get('/:pid/db/:coll', (req, res) => {
    let rows = D.all('SELECT * FROM app_records WHERE project_id = ? AND collection = ? ORDER BY created_at, id', req.pid, req.params.coll).map(recordOut);
    if (req.query.mine === '1' || req.query.mine === 'true') {
      rows = req.appUser ? rows.filter((r) => r.owner_id === req.appUser.id) : [];
    }
    if (req.query.where) {
      let where;
      try {
        where = JSON.parse(req.query.where);
      } catch {
        return res.status(400).json({ error: 'Nieprawidłowy parametr where' });
      }
      if (where && typeof where === 'object') rows = rows.filter((r) => Object.entries(where).every(([k, v]) => JSON.stringify(r[k]) === JSON.stringify(v)));
    }
    const sort = String(req.query.sort || '');
    if (sort) {
      const desc = sort.startsWith('-');
      const key = sort.replace(/^[-+]/, '');
      rows.sort((a, b) => {
        const x = a[key], y = b[key];
        const c = x === y ? 0 : x === undefined ? 1 : y === undefined ? -1 : x > y ? 1 : -1;
        return desc ? -c : c;
      });
    }
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const limit = Math.min(1000, Math.max(1, Number(req.query.limit) || 100));
    res.json(rows.slice(offset, offset + limit));
  });

  api.post('/:pid/db/:coll', limited('write', 120, 60_000), (req, res) => {
    const data = cleanData(req.body);
    if (!data) return res.status(400).json({ error: 'Dane muszą być obiektem' });
    const json = JSON.stringify(data);
    if (json.length > 100_000) return res.status(413).json({ error: 'Rekord jest za duży (maks. 100 KB)' });
    const count = D.one('SELECT COUNT(*) AS n FROM app_records WHERE project_id = ?', req.pid).n;
    if (count >= MAX_RECORDS) return res.status(507).json({ error: 'Osiągnięto limit rekordów aplikacji' });
    const id = D.newId(8);
    const now = Date.now();
    D.run('INSERT INTO app_records (id, project_id, collection, owner_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, req.pid, req.params.coll, req.appUser?.id || null, json, now, now);
    res.status(201).json(recordOut(D.one('SELECT * FROM app_records WHERE id = ?', id)));
  });

  function findRecord(req, res) {
    const r = D.one('SELECT * FROM app_records WHERE id = ? AND project_id = ? AND collection = ?', req.params.rid, req.pid, req.params.coll);
    if (!r) res.status(404).json({ error: 'Rekord nie istnieje' });
    return r;
  }
  function canWrite(req, res, r) {
    if (r.owner_id && r.owner_id !== req.appUser?.id) {
      res.status(403).json({ error: 'Brak uprawnień – ten rekord należy do innego użytkownika' });
      return false;
    }
    return true;
  }

  api.get('/:pid/db/:coll/:rid', (req, res) => {
    const r = findRecord(req, res);
    if (r) res.json(recordOut(r));
  });

  api.patch('/:pid/db/:coll/:rid', limited('write', 120, 60_000), (req, res) => {
    const r = findRecord(req, res);
    if (!r || !canWrite(req, res, r)) return;
    const data = cleanData(req.body);
    if (!data) return res.status(400).json({ error: 'Dane muszą być obiektem' });
    const merged = JSON.stringify({ ...JSON.parse(r.data), ...data });
    if (merged.length > 100_000) return res.status(413).json({ error: 'Rekord jest za duży (maks. 100 KB)' });
    D.run('UPDATE app_records SET data = ?, updated_at = ? WHERE id = ?', merged, Date.now(), r.id);
    res.json(recordOut(D.one('SELECT * FROM app_records WHERE id = ?', r.id)));
  });

  api.delete('/:pid/db/:coll/:rid', limited('write', 120, 60_000), (req, res) => {
    const r = findRecord(req, res);
    if (!r || !canWrite(req, res, r)) return;
    D.run('DELETE FROM app_records WHERE id = ?', r.id);
    res.json({ ok: true });
  });

  api.use((req, res) => res.status(404).json({ error: 'Nieznany adres API' }));
  app.use('/_api', api);

  // ---------- serwowanie plików stron ----------
  function injectHtml(html, projectId, mode, req) {
    let tags = `<script src="/_kreator/sdk.js" data-project="${projectId}"></script>`;
    if (mode === 'preview') tags += `<script src="/_kreator/bridge.js" data-builder="${escHtml(builderOrigin(req))}"></script>`;
    const m = html.match(/<head[^>]*>/i);
    if (m) return html.slice(0, m.index + m[0].length) + tags + html.slice(m.index + m[0].length);
    return tags + html;
  }

  function serve(resolve, mode) {
    return (req, res) => {
      const key = req.params[0];
      let rest = req.params[1] || '';
      if (!req.path.endsWith('/') && rest === '') return res.redirect(301, req.originalUrl.replace(/(\?|$)/, '/$1'));
      const found = resolve(key);
      if (!found) return res.status(404).type('html').send('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">Ta strona nie istnieje lub nie jest opublikowana.</p>');
      const { project, files } = found;
      try {
        rest = decodeURIComponent(rest);
      } catch {
        return res.sendStatus(400);
      }
      if (rest === '' || rest.endsWith('/')) rest += 'index.html';
      let name = safePath(rest);
      if (name && files[name] === undefined && files[name + '.html'] !== undefined) name += '.html';
      res.set('Cache-Control', 'no-store');
      if (sandboxHeader) res.set('Content-Security-Policy', sandboxHeader);
      if (name && files[name] !== undefined) {
        const mime = mimeOf(name);
        let body = files[name];
        if (mime === 'text/html') body = injectHtml(body, project.id, mode, req);
        res.set('Content-Type', `${mime}; charset=utf-8`);
        return res.send(body);
      }
      const asset = name && D.one('SELECT mime, data FROM assets WHERE project_id = ? AND name = ?', project.id, name);
      if (asset) {
        res.set('Content-Type', asset.mime);
        return res.send(Buffer.from(asset.data));
      }
      if (!Object.keys(files).length) {
        return res.type('html').send(injectHtml('<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#999">Opisz w czacie, co chcesz zbudować…</body></html>', project.id, mode, req));
      }
      res.status(404).type('html').send(injectHtml(`<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;padding:24px">404 – nie znaleziono pliku <code>${escHtml(rest)}</code></body></html>`, project.id, mode, req));
    };
  }

  app.get(/^\/preview\/([a-f0-9]{12})\/?(.*)$/, serve((id) => {
    const p = D.getProject(id);
    return p && { project: p, files: p.files };
  }, 'preview'));
  app.get(/^\/p\/([a-f0-9]{12})\/?(.*)$/, serve((id) => {
    const p = D.getProject(id);
    return p?.published_files && { project: p, files: p.published_files };
  }, 'published'));
  app.get(/^\/s\/([a-z0-9-]{3,40})\/?(.*)$/, serve((slug) => {
    const row = D.one('SELECT id FROM projects WHERE slug = ?', slug);
    const p = row && D.getProject(row.id);
    return p?.published_files && { project: p, files: p.published_files };
  }, 'published'));

  app.get('/', (req, res) => res.type('html').send('<!doctype html><meta charset="utf-8"><title>Kreator – strony</title><p style="font-family:sans-serif;padding:24px">Serwer stron Kreatora.</p>'));
  return app;
}
