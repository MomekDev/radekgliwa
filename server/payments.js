// Płatności Stripe dla wygenerowanych aplikacji.
// Właściciel projektu podaje własny klucz Stripe (pieniądze trafiają na jego konto).
// Produkty i ceny są w pliku projektu payments.json – strona wybiera tylko produkt i ilość, więc klient nie może zmienić ceny.
import crypto from 'crypto';
import express from 'express';
import * as D from './db.js';
import { getSecret, setSecret } from './secrets.js';
import { has } from './util.js';

export const CATALOG_FILE = 'payments.json';
const STRIPE_API = (process.env.STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/$/, '');
const CURRENCIES = /^(pln|eur|usd|gbp|chf|czk|sek|nok|dkk|huf)$/;

D.db.exec(`CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  mode TEXT NOT NULL,
  amount INTEGER,
  currency TEXT,
  email TEXT,
  name TEXT,
  items TEXT NOT NULL DEFAULT '[]',
  app_user_id TEXT,
  livemode INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
)`);
D.db.exec('CREATE INDEX IF NOT EXISTS orders_project ON orders(project_id, created_at)');

// ---------- Stripe API ----------
function formEncode(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join('&');
}

export async function stripe(secretKey, method, path, params) {
  const url = `${STRIPE_API}/v1/${path}${method === 'GET' && params ? '?' + formEncode(params) : ''}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2024-06-20' },
      body: method !== 'GET' && params ? formEncode(params) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw Object.assign(new Error('Brak połączenia ze Stripe'), { status: 502 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Stripe zwrócił błąd ${res.status}`;
    throw Object.assign(new Error(msg), { status: res.status === 401 ? 400 : 502, stripe: true });
  }
  return data;
}

// ---------- katalog produktów (payments.json) ----------
export function loadCatalog(files) {
  let raw = {};
  try {
    raw = JSON.parse(files?.[CATALOG_FILE] || '{}') || {};
  } catch {
    return { currency: 'pln', products: {}, error: 'Plik payments.json zawiera błąd składni' };
  }
  const currency = CURRENCIES.test(String(raw.currency || 'pln').toLowerCase()) ? String(raw.currency || 'pln').toLowerCase() : 'pln';
  const products = {};
  const src = raw.products && typeof raw.products === 'object' ? raw.products : {};
  for (const [id, p] of Object.entries(src)) {
    if (!/^[\w-]{1,60}$/.test(id) || !p || typeof p !== 'object') continue;
    const price = Number(p.price);
    const stripePrice = typeof p.stripePrice === 'string' && /^price_\w+$/.test(p.stripePrice) ? p.stripePrice : null;
    if (!stripePrice && !(Number.isInteger(price) && price >= 50 && price <= 100_000_000)) continue;
    const interval = ['day', 'week', 'month', 'year'].includes(p.interval) ? p.interval : null;
    products[id] = {
      id,
      name: String(p.name || id).slice(0, 200),
      description: p.description ? String(p.description).slice(0, 500) : '',
      price: stripePrice ? null : price,
      currency: p.currency && CURRENCIES.test(String(p.currency).toLowerCase()) ? String(p.currency).toLowerCase() : currency,
      interval,
      stripePrice,
      image: typeof p.image === 'string' ? p.image.slice(0, 300) : null,
    };
  }
  return { currency, products };
}

const publicProduct = (p) => ({ id: p.id, name: p.name, description: p.description, price: p.price, currency: p.currency, interval: p.interval, image: p.image });

// ---------- zamówienia ----------
function orderOut(o) {
  return { id: o.id, status: o.status, amount: o.amount, currency: o.currency, email: o.email, name: o.name, items: JSON.parse(o.items), mode: o.mode, livemode: !!o.livemode, created_at: o.created_at, updated_at: o.updated_at };
}

// zapisz/odśwież zamówienie na podstawie sesji Checkout pobranej ze Stripe
export function upsertOrder(projectId, s) {
  const status = s.payment_status === 'paid' || s.payment_status === 'no_payment_required' ? 'paid' : s.status === 'expired' ? 'expired' : s.payment_status === 'unpaid' && s.status === 'complete' ? 'processing' : 'pending';
  let items = [];
  try {
    items = JSON.parse(s.metadata?.kreator_items || '[]');
  } catch {}
  const now = Date.now();
  const existing = D.one('SELECT * FROM orders WHERE session_id = ?', s.id);
  if (existing) {
    if (existing.project_id !== projectId) return null;
    // nie cofaj statusu "paid" (np. przy spóźnionym webhooku)
    const next = existing.status === 'paid' ? 'paid' : status;
    D.run('UPDATE orders SET status = ?, amount = ?, email = ?, name = ?, updated_at = ? WHERE id = ?', next, s.amount_total ?? existing.amount, s.customer_details?.email || existing.email, s.customer_details?.name || existing.name, now, existing.id);
    return D.one('SELECT * FROM orders WHERE id = ?', existing.id);
  }
  const id = D.newId(8);
  D.run(
    'INSERT INTO orders (id, project_id, session_id, status, mode, amount, currency, email, name, items, app_user_id, livemode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, projectId, s.id, status, s.mode || 'payment', s.amount_total ?? null, s.currency || null, s.customer_details?.email || null, s.customer_details?.name || null,
    JSON.stringify(items), s.metadata?.kreator_user || null, s.livemode ? 1 : 0, now, now
  );
  return D.one('SELECT * FROM orders WHERE id = ?', id);
}

// weryfikacja podpisu webhooka Stripe (nagłówek Stripe-Signature: t=...,v1=...)
export function verifyStripeSignature(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(
    String(header || '')
      .split(',')
      .map((kv) => kv.split('='))
      .filter((a) => a.length === 2)
      .map(([k, v]) => [k.trim(), v.trim()])
  );
  const sigs = String(header || '')
    .split(',')
    .filter((kv) => kv.trim().startsWith('v1='))
    .map((kv) => kv.trim().slice(3));
  const t = Number(parts.t);
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

// ---------- API dla stron (montowane w /_api) ----------
export function mountSitePayments(api, { limited }) {
  // webhook musi dostać surowe body – rejestrujemy go przed parserem JSON
  api.post('/:pid/payments/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const pid = req.params.pid;
    const secret = getSecret(pid, 'stripe_webhook_secret');
    const key = getSecret(pid, 'stripe_secret_key');
    if (!secret || !key) return res.status(400).json({ error: 'Webhook nie jest skonfigurowany' });
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    if (!verifyStripeSignature(raw, req.get('stripe-signature'), secret)) return res.status(400).json({ error: 'Nieprawidłowy podpis' });
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      return res.status(400).json({ error: 'Nieprawidłowe dane' });
    }
    const types = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired'];
    const s = event?.data?.object;
    if (types.includes(event.type) && s?.object === 'checkout.session' && s.metadata?.kreator_project === pid) {
      const o = upsertOrder(pid, s);
      if (o && event.type === 'checkout.session.async_payment_failed') D.run("UPDATE orders SET status = 'failed', updated_at = ? WHERE id = ?", Date.now(), o.id);
    }
    res.json({ received: true });
  });

  return function mountAfterJson() {
    api.get('/:pid/payments/products', (req, res) => {
      const cat = loadCatalog(D.getProject(req.pid)?.files);
      res.json({ currency: cat.currency, products: Object.values(cat.products).map(publicProduct), enabled: !!getSecret(req.pid, 'stripe_secret_key') });
    });

    api.post('/:pid/payments/checkout', limited('checkout', 30, 60_000), async (req, res) => {
      const pid = req.pid;
      const key = getSecret(pid, 'stripe_secret_key');
      if (!key) return res.status(400).json({ error: 'Płatności nie są jeszcze skonfigurowane – właściciel strony musi podłączyć Stripe' });
      const cat = loadCatalog(D.getProject(pid)?.files);
      const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 50) : [];
      if (!items.length) return res.status(400).json({ error: 'Koszyk jest pusty' });
      const lines = [];
      const meta = [];
      let recurring = null;
      for (const it of items) {
        const id = typeof it === 'string' ? it : it?.id;
        const quantity = Math.floor(Number(typeof it === 'object' ? it.quantity ?? 1 : 1));
        if (!id || !has(cat.products, String(id))) return res.status(400).json({ error: `Nieznany produkt: ${id}` });
        if (!(quantity >= 1 && quantity <= 99)) return res.status(400).json({ error: 'Nieprawidłowa ilość' });
        const p = cat.products[id];
        const isSub = Boolean(p.interval) || Boolean(p.stripePrice && typeof it === 'object' && it.subscription === true);
        if (recurring === null) recurring = isSub;
        else if (recurring !== isSub) return res.status(400).json({ error: 'Nie można łączyć subskrypcji z jednorazowymi zakupami w jednym koszyku' });
        lines.push(
          p.stripePrice
            ? { price: p.stripePrice, quantity }
            : {
                quantity,
                price_data: {
                  currency: p.currency,
                  unit_amount: p.price,
                  product_data: { name: p.name, ...(p.description ? { description: p.description } : {}) },
                  ...(p.interval ? { recurring: { interval: p.interval } } : {}),
                },
              }
        );
        meta.push({ id: p.id, name: p.name, quantity, price: p.price });
      }
      const okUrl = (u) => typeof u === 'string' && /^https?:\/\/[^\s]+$/.test(u) && u.length < 1500;
      let successUrl = req.body?.successUrl;
      const cancelUrl = req.body?.cancelUrl;
      if (!okUrl(successUrl) || !okUrl(cancelUrl)) return res.status(400).json({ error: 'Brak adresów powrotu (successUrl, cancelUrl)' });
      if (!successUrl.includes('{CHECKOUT_SESSION_ID}')) successUrl += (successUrl.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}';
      const email = typeof req.body?.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email) ? req.body.email : req.appUser?.email;
      const params = {
        mode: recurring ? 'subscription' : 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: lines,
        customer_email: email || undefined,
        locale: 'auto',
        metadata: { kreator_project: pid, kreator_user: req.appUser?.id || '', kreator_items: JSON.stringify(meta).slice(0, 500) },
        ...(recurring ? { subscription_data: { metadata: { kreator_project: pid } } } : { payment_intent_data: { metadata: { kreator_project: pid } } }),
      };
      if (req.body?.collectAddress && !recurring) params.shipping_address_collection = { allowed_countries: ['PL', 'DE', 'CZ', 'SK', 'LT', 'GB', 'FR', 'NL', 'IT', 'ES', 'US'] };
      if (req.body?.collectPhone) params.phone_number_collection = { enabled: true };
      try {
        const s = await stripe(key, 'POST', 'checkout/sessions', params);
        upsertOrder(pid, s);
        res.json({ id: s.id, url: s.url });
      } catch (err) {
        res.status(err.status || 502).json({ error: `Płatność: ${err.message}` });
      }
    });

    // strona sukcesu: potwierdzenie płatności bezpośrednio w Stripe (działa także bez webhooka)
    api.get('/:pid/payments/session/:sid', limited('session', 60, 60_000), async (req, res) => {
      const pid = req.pid;
      const sid = String(req.params.sid);
      if (!/^cs_\w{10,200}$/.test(sid)) return res.status(400).json({ error: 'Nieprawidłowy identyfikator płatności' });
      const key = getSecret(pid, 'stripe_secret_key');
      if (!key) return res.status(400).json({ error: 'Płatności nie są skonfigurowane' });
      try {
        const s = await stripe(key, 'GET', `checkout/sessions/${sid}`);
        if (s.metadata?.kreator_project !== pid) return res.status(404).json({ error: 'Nie znaleziono płatności' });
        const o = upsertOrder(pid, s);
        const out = orderOut(o);
        res.json({ paid: out.status === 'paid', status: out.status, amount: out.amount, currency: out.currency, email: out.email, items: out.items, orderId: out.id });
      } catch (err) {
        res.status(err.status || 502).json({ error: err.message });
      }
    });

    api.get('/:pid/payments/orders', (req, res) => {
      if (!req.appUser) return res.status(401).json({ error: 'Zaloguj się, aby zobaczyć swoje zamówienia' });
      res.json(D.all('SELECT * FROM orders WHERE project_id = ? AND app_user_id = ? ORDER BY created_at DESC LIMIT 200', req.pid, req.appUser.id).map(orderOut));
    });
  };
}

// ---------- panel właściciela (montowane w kreatorze) ----------
export function mountBuilderPayments(app, { withProject, sitesApiBase }) {
  const status = (req) => {
    const pid = req.project.id;
    const key = getSecret(pid, 'stripe_secret_key');
    const cat = loadCatalog(req.project.files);
    return {
      configured: !!key,
      mode: key ? (key.includes('_live_') ? 'live' : 'test') : null,
      keyHint: key ? `${key.slice(0, 8)}…${key.slice(-4)}` : null,
      webhookConfigured: !!getSecret(pid, 'stripe_webhook_secret'),
      webhookUrl: `${sitesApiBase(req)}/_api/${pid}/payments/webhook`,
      products: Object.values(cat.products).map(publicProduct),
      catalogError: cat.error || null,
      orders: D.all('SELECT * FROM orders WHERE project_id = ? ORDER BY created_at DESC LIMIT 500', pid).map(orderOut),
    };
  };

  app.get('/api/projects/:id/payments', withProject, (req, res) => res.json(status(req)));

  app.put('/api/projects/:id/payments', withProject, async (req, res) => {
    const pid = req.project.id;
    const key = req.body?.secretKey;
    const wh = req.body?.webhookSecret;
    if (key !== undefined && key !== '') {
      const k = String(key).trim();
      if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{10,250}$/.test(k)) return res.status(400).json({ error: 'To nie wygląda na tajny klucz Stripe (zaczyna się od sk_test_ lub sk_live_)' });
      // sprawdź klucz w Stripe
      try {
        await stripe(k, 'GET', 'balance');
      } catch (err) {
        if (err.stripe) return res.status(400).json({ error: `Stripe odrzucił klucz: ${err.message}` });
        return res.status(502).json({ error: 'Nie udało się połączyć ze Stripe, spróbuj ponownie' });
      }
      setSecret(pid, 'stripe_secret_key', k);
    }
    if (wh !== undefined && wh !== '') {
      const w = String(wh).trim();
      if (!/^whsec_[A-Za-z0-9]{10,250}$/.test(w)) return res.status(400).json({ error: 'Sekret webhooka zaczyna się od whsec_' });
      setSecret(pid, 'stripe_webhook_secret', w);
    }
    res.json(status(req));
  });

  app.delete('/api/projects/:id/payments', withProject, (req, res) => {
    setSecret(req.project.id, 'stripe_secret_key', null);
    setSecret(req.project.id, 'stripe_webhook_secret', null);
    res.json(status(req));
  });
}
