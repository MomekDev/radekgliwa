export function safePath(p) {
  p = String(p || '').replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '').trim();
  if (!p || p.length > 200) return null;
  if (!/^[\w.\-/ ]+$/.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..' || s.startsWith('.'))) return null;
  // nazwa pliku musi mieć rozszerzenie – blokuje też klucze typu "toString" czy "__proto__"
  if (!/^[^.]+.*\.[A-Za-z0-9]{1,8}$/.test(parts[parts.length - 1])) return null;
  return p;
}

export const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain', xml: 'application/xml', md: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', woff: 'font/woff', woff2: 'font/woff2', pdf: 'application/pdf',
};
export const mimeOf = (name) => MIME[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';

export const has = (obj, key) => obj != null && Object.hasOwn(obj, key);

export const TEXT_EXT = /\.(html?|css|m?js|json|svg|txt|xml|md)$/i;

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

export const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// prosty limiter: max `limit` zdarzeń na `windowMs` dla klucza
const buckets = new Map();
export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    buckets.set(key, arr);
    return false;
  }
  arr.push(now);
  buckets.set(key, arr);
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of buckets) if (!arr.some((t) => now - t < 3600_000)) buckets.delete(k);
}, 600_000).unref();

// ---------- reguły dostępu do danych aplikacji ----------
// Plik "database.rules.json" w projekcie, np.:
// { "kontakt": { "read": "private", "write": "public" }, "zadania": { "read": "owner", "write": "auth" } }
//   read:  public (każdy) | auth (zalogowani) | owner (tylko własne rekordy) | private (nikt – tylko właściciel w panelu)
//   write: public (każdy może dodać) | auth (tylko zalogowani) | none (nikt)
//   edit:  owner (rekordy anonimowe są tylko do odczytu) | public (każdy może zmieniać/usuwać rekordy anonimowe)
export const RULES_FILE = 'database.rules.json';
export const DEFAULT_RULES = { read: 'public', write: 'public', edit: 'owner' };
const ALLOWED = { read: ['public', 'auth', 'owner', 'private'], write: ['public', 'auth', 'none'], edit: ['owner', 'public'] };

export function parseRules(text) {
  let obj;
  try {
    obj = JSON.parse(text || '{}');
  } catch {
    return {};
  }
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
}

export function normalizeRule(r) {
  const out = { ...DEFAULT_RULES };
  if (r && typeof r === 'object') for (const k of Object.keys(ALLOWED)) if (ALLOWED[k].includes(r[k])) out[k] = r[k];
  return out;
}

let rulesDb = null;
export function setRulesDb(D) {
  rulesDb = D;
}
export function collectionRules(pid, coll) {
  const row = rulesDb.one(`SELECT json_extract(files, '$."${RULES_FILE}"') AS rules FROM projects WHERE id = ?`, pid);
  const all = parseRules(row?.rules);
  return normalizeRule(Object.hasOwn(all, coll) ? all[coll] : all['*']);
}

// krótka nazwa z dłuższego tekstu – ucięta na granicy słowa
export function shortName(text, max = 40) {
  const t = String(text).split('\n')[0].replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const i = cut.lastIndexOf(' ');
  return (i > 15 ? cut.slice(0, i) : t.slice(0, max)).replace(/[\s,.;:–-]+$/, '') + '…';
}
