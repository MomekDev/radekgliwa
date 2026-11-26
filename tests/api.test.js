// Testy: npm test  (uruchamia kreator w trybie demo na losowym porcie z tymczasową bazą)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseResponse, applyHunks } from '../public/parser.js';

const PORT = 4700 + Math.floor(Math.random() * 200);
const B = `http://localhost:${PORT}`;
const SITES = `http://localhost:${PORT + 1}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kreator-test-'));
let server;

before(async () => {
  server = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server/index.js'], {
    env: { ...process.env, DEMO: '1', PORT: String(PORT), DATA_DIR: dataDir, ANTHROPIC_API_KEY: '' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${B}/healthz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Serwer nie wystartował');
});
after(() => {
  server?.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// klient z ciasteczkiem sesji
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(B + url, {
      method,
      headers: { 'X-Kreator': '1', Cookie: cookie, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  };
}
const appApi = async (pid, method, p, body, token) => {
  const res = await fetch(`${SITES}/_api/${pid}/${p}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json() };
};
async function generate(c, pid, message) {
  assert.equal((await c('POST', `/api/projects/${pid}/chat`, { message })).status, 202);
  const r = await c('GET', `/api/projects/${pid}/stream`);
  const done = r.text.split('\n\n').find((b) => b.startsWith('event: done'));
  return JSON.parse(done.split('data: ')[1]);
}

test('parser: pliki, edycje, podpowiedzi, przypadki brzegowe', () => {
  const r = parseResponse('Opis\n<file path="a.js">\nconst s = "</file>";\n</file>\n<suggestion>Dalej</suggestion>');
  assert.equal(r.blocks[0].content, 'const s = "</file>";\n');
  assert.deepEqual(r.suggestions, ['Dalej']);
  assert.equal(r.chat, 'Opis');
  assert.equal(applyHunks('<p>a</p>\n<p>a</p>', [{ search: '<p>a</p>', replace: 'x' }]).failed.length, 1, 'niejednoznaczna edycja odrzucona');
  assert.equal(applyHunks('  <b>x</b>', [{ search: '<b>x</b>', replace: '<b>y</b>' }]).content, '  <b>y</b>');
});

test('konta, projekty i izolacja użytkowników', async () => {
  const a = client();
  const b = client();
  assert.equal((await a('POST', '/api/auth/register', { email: 'a@test.pl', password: 'haslo1234' })).status, 201);
  assert.equal((await b('POST', '/api/auth/register', { email: 'b@test.pl', password: 'haslo1234' })).status, 201);
  assert.equal((await a('POST', '/api/auth/register', { email: 'a@test.pl', password: 'haslo1234' })).status, 409);
  const p = (await a('POST', '/api/projects', {})).json;
  assert.equal((await b('GET', `/api/projects/${p.id}`)).status, 404, 'cudzy projekt niewidoczny');
  assert.equal((await b('DELETE', `/api/projects/${p.id}`)).status, 404);
  const noHeader = await fetch(`${B}/api/projects`, { method: 'POST' });
  assert.equal(noHeader.status, 403, 'ochrona CSRF');
  assert.equal((await client()('GET', '/api/projects')).status, 401);
});

test('generowanie, edycje, wersje, publikacja', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { email: 'gen@test.pl', password: 'haslo1234' });
  const p = (await c('POST', '/api/projects', {})).json;
  const d1 = await generate(c, p.id, 'Strona kawiarni');
  assert.ok(d1.changed.includes('index.html'));
  assert.equal(d1.project.name, 'Strona kawiarni');
  const d2 = await generate(c, p.id, 'Dodaj sekcję Menu');
  assert.ok(d2.project.files['index.html'].includes('Dodaj sekcję Menu'));
  const d3 = await generate(c, p.id, 'zepsuj edycję');
  assert.match(d3.note, /Nie udało się/);
  assert.equal((await fetch(d2.project.previewUrl)).status, 200);
  const first = d2.project.versions[0].id;
  const restored = (await c('POST', `/api/projects/${p.id}/restore`, { versionId: first })).json;
  assert.ok(!restored.files['index.html'].includes('Dodaj sekcję Menu'));
  const pub = (await c('POST', `/api/projects/${p.id}/publish`)).json;
  assert.equal((await fetch(pub.published.url)).status, 200);
  await c('DELETE', `/api/projects/${p.id}/publish`);
  assert.equal((await fetch(pub.published.url)).status, 404);
  assert.equal((await c('PUT', `/api/projects/${p.id}/files`, { path: 'toString', content: 'x' })).status, 400);
});

test('backend aplikacji: reguły dostępu i własność rekordów', async () => {
  const c = client();
  await c('POST', '/api/auth/register', { email: 'app@test.pl', password: 'haslo1234' });
  const p = (await c('POST', '/api/projects', {})).json;
  const rules = { kontakt: { read: 'private', write: 'public' }, zadania: { read: 'owner', write: 'auth' } };
  await c('PUT', `/api/projects/${p.id}/files`, { path: 'database.rules.json', content: JSON.stringify(rules) });
  const u1 = (await appApi(p.id, 'POST', 'auth/signup', { email: 'u1@x.pl', password: '123456' })).json.token;
  const u2 = (await appApi(p.id, 'POST', 'auth/signup', { email: 'u2@x.pl', password: '123456' })).json.token;
  assert.equal((await appApi(p.id, 'POST', 'db/kontakt', { email: 'tajny@x.pl' })).status, 201);
  assert.equal((await appApi(p.id, 'GET', 'db/kontakt')).status, 403, 'prywatne dane niedostępne');
  assert.equal((await c('GET', `/api/projects/${p.id}/data/kontakt`)).json.length, 1, 'właściciel widzi dane w panelu');
  assert.equal((await appApi(p.id, 'POST', 'db/zadania', { t: 'x' })).status, 401);
  const z = (await appApi(p.id, 'POST', 'db/zadania', { t: 'u1' }, u1)).json;
  assert.equal((await appApi(p.id, 'GET', 'db/zadania', null, u2)).json.length, 0, 'u2 nie widzi zadań u1');
  assert.equal((await appApi(p.id, 'PATCH', `db/zadania/${z.id}`, { t: 'hack' }, u2)).status, 403);
  assert.equal((await appApi(p.id, 'PATCH', `db/zadania/${z.id}`, { t: 'ok' }, u1)).json.t, 'ok');
  const g = (await appApi(p.id, 'POST', 'db/wpisy', { n: 2 })).json;
  await appApi(p.id, 'POST', 'db/wpisy', { n: 1 });
  assert.deepEqual((await appApi(p.id, 'GET', 'db/wpisy?sort=n')).json.map((r) => r.n), [1, 2]);
  assert.equal((await appApi(p.id, 'DELETE', `db/wpisy/${g.id}`)).status, 403, 'rekordy anonimowe domyślnie tylko do odczytu');
});
