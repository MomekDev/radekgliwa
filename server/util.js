export function safePath(p) {
  p = String(p || '').replace(/\\/g, '/').replace(/^(\.\/|\/)+/, '').trim();
  if (!p || p.length > 200) return null;
  if (!/^[\w.\-/ ]+$/.test(p)) return null;
  if (p.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
  return p;
}

export const MIME = {
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  json: 'application/json', svg: 'image/svg+xml', txt: 'text/plain', xml: 'application/xml', md: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', woff: 'font/woff', woff2: 'font/woff2', pdf: 'application/pdf',
};
export const mimeOf = (name) => MIME[String(name).split('.').pop().toLowerCase()] || 'application/octet-stream';

export const TEXT_EXT = /\.(html?|css|m?js|json|svg|txt|xml|md)$/i;

export function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
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
