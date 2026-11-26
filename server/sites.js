// Serwer stron użytkowników: podgląd, publikacja, SDK backendu (baza danych + logowanie) i jego API.
// Działa na OSOBNYM originie niż kreator (inny port lub inna domena), więc strony nie mają dostępu do kreatora.
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as D from './db.js';
import { safePath, mimeOf, escHtml, rateLimit, has, collectionRules } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createSitesApp({ builderOrigin, sandboxHeader, wildcardHost }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? true : process.env.TRUST_PROXY || 'loopback, linklocal, uniquelocal');

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
  const validKey = (k) => /^[A-Za-z_][\w-]{0,49}$/.test(k);
  const recordOut = (r) => ({ ...JSON.parse(r.data), id: r.id, created_at: r.created_at, updated_at: r.updated_at, owner_id: r.owner_id });
  const cleanData = (body) => {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const out = {};
    for (const [k, v] of Object.entries(body)) if (!RESERVED.has(k)) out[k] = v;
    return out;
  };
  const MAX_RECORDS = Number(process.env.APP_MAX_RECORDS || 20000);
  const MAX_BYTES = Number(process.env.APP_MAX_BYTES || 50 * 1024 * 1024);
  const DENIED = { error: 'Brak uprawnień do tej kolekcji' };

  // reguły dostępu – plik database.rules.json w projekcie
  api.use('/:pid/db/:coll', (req, res, next) => {
    if (!validColl(req.params.coll)) return res.status(400).json({ error: 'Nieprawidłowa nazwa kolekcji' });
    req.rules = collectionRules(req.pid, req.params.coll);
    next();
  });

  // czy bieżący użytkownik może czytać rekord / jaki filtr właściciela nałożyć
  function readFilter(req) {
    const { read } = req.rules;
    if (read === 'private') return { denied: true };
    if (read === 'auth' && !req.appUser) return { denied: true };
    if (read === 'owner') return req.appUser ? { owner: req.appUser.id } : { denied: true };
    return {};
  }

  api.get('/:pid/db/:coll', (req, res) => {
    const f = readFilter(req);
    if (f.denied) return res.status(403).json(DENIED);
    let sql = 'SELECT * FROM app_records WHERE project_id = ? AND collection = ?';
    const args = [req.pid, req.params.coll];
    const mine = req.query.mine === '1' || req.query.mine === 'true';
    if (mine && !req.appUser) return res.json([]);
    const owner = f.owner || (mine ? req.appUser.id : null);
    if (owner) {
      sql += ' AND owner_id = ?';
      args.push(owner);
    }
    if (req.query.where) {
      let where;
      try {
        where = JSON.parse(req.query.where);
      } catch {
        return res.status(400).json({ error: 'Nieprawidłowy parametr where' });
      }
      if (!where || typeof where !== 'object' || Array.isArray(where)) return res.status(400).json({ error: 'where musi być obiektem' });
      for (const [k, v] of Object.entries(where)) {
        if (k === 'id' || k === 'owner_id') {
          sql += ` AND ${k} = ?`;
          args.push(String(v));
          continue;
        }
        if (!validKey(k)) return res.status(400).json({ error: `Nieprawidłowe pole: ${k}` });
        const expr = `json_extract(data, '$."${k}"')`;
        if (v === null) sql += ` AND ${expr} IS NULL`;
        else if (typeof v === 'boolean') {
          sql += ` AND ${expr} = ?`;
          args.push(v ? 1 : 0);
        } else if (typeof v === 'number' || typeof v === 'string') {
          sql += ` AND ${expr} = ?`;
          args.push(v);
        } else return res.status(400).json({ error: `Pole ${k}: można porównywać tylko tekst, liczby, true/false i null` });
      }
    }
    const sort = String(req.query.sort || 'created_at');
    const desc = sort.startsWith('-');
    const key = sort.replace(/^[-+]/, '');
    if (!validKey(key)) return res.status(400).json({ error: 'Nieprawidłowe pole sortowania' });
    const col = key === 'created_at' || key === 'updated_at' ? key : `json_extract(data, '$."${key}"')`;
    sql += ` ORDER BY ${col} ${desc ? 'DESC' : 'ASC'}, created_at ${desc ? 'DESC' : 'ASC'}, id`;
    const offset = Math.max(0, Math.floor(Number(req.query.offset)) || 0);
    const limit = Math.min(1000, Math.max(1, Math.floor(Number(req.query.limit)) || 100));
    sql += ' LIMIT ? OFFSET ?';
    args.push(limit, offset);
    res.json(D.all(sql, ...args).map(recordOut));
  });

  api.post('/:pid/db/:coll', limited('write', 120, 60_000), (req, res) => {
    const { write } = req.rules;
    if (write === 'none') return res.status(403).json(DENIED);
    if (write === 'auth' && !req.appUser) return res.status(401).json({ error: 'Zaloguj się, aby to zrobić' });
    const data = cleanData(req.body);
    if (!data) return res.status(400).json({ error: 'Dane muszą być obiektem' });
    const json = JSON.stringify(data);
    if (json.length > 100_000) return res.status(413).json({ error: 'Rekord jest za duży (maks. 100 KB)' });
    const stats = D.one('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM app_records WHERE project_id = ?', req.pid);
    if (stats.n >= MAX_RECORDS || stats.bytes + json.length > MAX_BYTES) return res.status(507).json({ error: 'Osiągnięto limit danych aplikacji' });
    const id = D.newId(8);
    const now = Date.now();
    D.run('INSERT INTO app_records (id, project_id, collection, owner_id, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, req.pid, req.params.coll, req.appUser?.id || null, json, now, now);
    res.status(201).json(recordOut(D.one('SELECT * FROM app_records WHERE id = ?', id)));
  });

  function findRecord(req, res) {
    const r = D.one('SELECT * FROM app_records WHERE id = ? AND project_id = ? AND collection = ?', String(req.params.rid), req.pid, req.params.coll);
    if (!r) res.status(404).json({ error: 'Rekord nie istnieje' });
    return r;
  }
  function canRead(req, r) {
    const f = readFilter(req);
    return !f.denied && (!f.owner || r.owner_id === f.owner);
  }
  // edycja: rekord zalogowanego – tylko on; rekord anonimowy – tylko gdy kolekcja ma edit: "public"
  function canWrite(req, res, r) {
    const ok = r.owner_id ? r.owner_id === req.appUser?.id : req.rules.edit === 'public';
    if (!ok) res.status(403).json({ error: r.owner_id ? 'Brak uprawnień – ten rekord należy do innego użytkownika' : 'Brak uprawnień do zmiany tego rekordu' });
    return ok;
  }

  api.get('/:pid/db/:coll/:rid', (req, res) => {
    const r = findRecord(req, res);
    if (!r) return;
    if (!canRead(req, r)) return res.status(403).json(DENIED);
    res.json(recordOut(r));
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
  function injectHtml(html, projectId, mode, req, base) {
    let tags = `<script src="/_kreator/sdk.js" data-project="${projectId}"></script>`;
    if (mode === 'preview') tags += `<script src="/_kreator/bridge.js" data-builder="${escHtml(builderOrigin(req))}" data-base="${escHtml(base)}"></script>`;
    const m = html.match(/<head[^>]*>/i);
    if (m) return html.slice(0, m.index + m[0].length) + tags + html.slice(m.index + m[0].length);
    return tags + html;
  }

  const NOT_FOUND = '<!doctype html><meta charset="utf-8"><title>Nie znaleziono</title><p style="font-family:sans-serif;padding:24px">Ta strona nie istnieje lub nie jest opublikowana.</p>';

  // wysyła plik `rest` z projektu; base = prefiks ścieżki strony (np. "/preview/<id>/" albo "/")
  function sendFile(req, res, { project, files, mode, base }, rest) {
    try {
      rest = decodeURIComponent(rest);
    } catch {
      return res.sendStatus(400);
    }
    if (rest === '' || rest.endsWith('/')) rest += 'index.html';
    let name = safePath(rest);
    if (!name && rest && !/\.[A-Za-z0-9]+$/.test(rest)) name = safePath(rest + '.html');
    else if (name && !has(files, name) && has(files, name + '.html')) name += '.html';
    res.set('Cache-Control', 'no-store');
    if (sandboxHeader) res.set('Content-Security-Policy', sandboxHeader);
    if (name && has(files, name)) {
      const mime = mimeOf(name);
      let body = files[name];
      if (mime === 'text/html') body = injectHtml(body, project.id, mode, req, base);
      res.set('Content-Type', `${mime}; charset=utf-8`);
      return res.send(body);
    }
    const asset = name && D.one('SELECT mime, data FROM assets WHERE project_id = ? AND name = ?', project.id, name);
    if (asset) {
      res.set('Content-Type', asset.mime);
      return res.send(Buffer.from(asset.data));
    }
    if (!Object.keys(files).length) {
      return res.type('html').send(injectHtml('<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#999">Opisz w czacie, co chcesz zbudować…</body></html>', project.id, mode, req, base));
    }
    res.status(404).type('html').send(injectHtml(`<!doctype html><html><head><meta charset="utf-8"><title>404</title></head><body style="font-family:sans-serif;padding:24px">404 – nie znaleziono pliku <code>${escHtml(rest)}</code></body></html>`, project.id, mode, req, base));
  }

  const byId = (id) => D.getProject(id);
  const byPreviewKey = (key) => {
    const row = D.one('SELECT id FROM projects WHERE preview_key = ?', key);
    return row ? D.getProject(row.id) : null;
  };
  const bySlug = (slug) => {
    const row = D.one('SELECT id FROM projects WHERE slug = ?', slug);
    return row ? D.getProject(row.id) : null;
  };

  if (wildcardHost) {
    // każdy projekt na własnej subdomenie: <id>.host = podgląd, <slug>.host = opublikowana strona
    app.use((req, res, next) => {
      const host = req.hostname;
      if (host === wildcardHost || !host.endsWith('.' + wildcardHost)) return next();
      const sub = host.slice(0, -(wildcardHost.length + 1));
      let ctx = null;
      if (/^[a-f0-9]{16}$/.test(sub)) {
        const p = byPreviewKey(sub);
        if (p) ctx = { project: p, files: p.files, mode: 'preview', base: '/' };
      } else {
        const p = bySlug(sub);
        if (p?.published_files) ctx = { project: p, files: p.published_files, mode: 'published', base: '/' };
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return res.sendStatus(405);
      if (!ctx) return res.status(404).type('html').send(NOT_FOUND);
      sendFile(req, res, ctx, req.path.slice(1));
    });
  }

  function route(resolve, mode, prefix) {
    return (req, res) => {
      const key = req.params[0];
      const rest = req.params[1] || '';
      if (!req.path.endsWith('/') && rest === '') return res.redirect(301, req.originalUrl.replace(/(\?|$)/, '/$1'));
      const p = resolve(key);
      const files = p && (mode === 'preview' ? p.files : p.published_files);
      if (!files) return res.status(404).type('html').send(NOT_FOUND);
      sendFile(req, res, { project: p, files, mode, base: `/${prefix}/${key}/` }, rest);
    };
  }
  app.get(/^\/preview\/([a-f0-9]{16})\/?(.*)$/, route(byPreviewKey, 'preview', 'preview'));
  app.get(/^\/p\/([a-f0-9]{12})\/?(.*)$/, route(byId, 'published', 'p'));
  app.get(/^\/s\/([a-z0-9-]{3,40})\/?(.*)$/, route(bySlug, 'published', 's'));

  app.get('/', (req, res) => res.type('html').send('<!doctype html><meta charset="utf-8"><title>Kreator – strony</title><p style="font-family:sans-serif;padding:24px">Serwer stron Kreatora.</p>'));
  return app;
}
