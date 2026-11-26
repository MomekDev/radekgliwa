// Szyfrowanie sekretów projektów (np. kluczy Stripe) – AES-256-GCM.
// Klucz: zmienna SECRET_KEY albo losowy plik DATA_DIR/secret.key tworzony przy pierwszym uruchomieniu.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import * as D from './db.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');

function loadKey() {
  if (process.env.SECRET_KEY) return crypto.createHash('sha256').update(process.env.SECRET_KEY).digest();
  const file = path.join(DATA_DIR, 'secret.key');
  try {
    const k = Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
    if (k.length === 32) return k;
  } catch {}
  const k = crypto.randomBytes(32);
  fs.writeFileSync(file, k.toString('base64'), { mode: 0o600 });
  return k;
}
const KEY = loadKey();

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return 'v1:' + Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function decrypt(value) {
  const raw = Buffer.from(String(value).slice(3), 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

D.db.exec(`CREATE TABLE IF NOT EXISTS project_secrets (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, name)
)`);

export function getSecret(projectId, name) {
  const row = D.one('SELECT value FROM project_secrets WHERE project_id = ? AND name = ?', projectId, name);
  if (!row) return null;
  try {
    return decrypt(row.value);
  } catch {
    return null; // zmieniono SECRET_KEY – sekret trzeba podać ponownie
  }
}

export function setSecret(projectId, name, value) {
  if (value === null || value === undefined || value === '') {
    D.run('DELETE FROM project_secrets WHERE project_id = ? AND name = ?', projectId, name);
    return;
  }
  D.run('INSERT OR REPLACE INTO project_secrets (project_id, name, value, updated_at) VALUES (?, ?, ?, ?)', projectId, name, encrypt(value), Date.now());
}
