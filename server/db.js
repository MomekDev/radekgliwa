// Warstwa danych – wbudowany SQLite (node:sqlite), jeden plik bazy.
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'kreator.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '{}',
  slug TEXT UNIQUE,
  published_files TEXT,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_project ON messages(project_id, id);
CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  files TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS versions_project ON versions(project_id, ts);
CREATE TABLE IF NOT EXISTS assets (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  PRIMARY KEY (project_id, name)
);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  project_id TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  ts INTEGER NOT NULL
);
-- backend wygenerowanych aplikacji
CREATE TABLE IF NOT EXISTS app_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  collection TEXT NOT NULL,
  owner_id TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_records_coll ON app_records(project_id, collection, created_at);
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (project_id, email)
);
CREATE TABLE IF NOT EXISTS app_sessions (
  token TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  app_user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
`);

// migracje
for (const sql of [
  "ALTER TABLE projects ADD COLUMN instructions TEXT NOT NULL DEFAULT ''",
  'ALTER TABLE projects ADD COLUMN preview_key TEXT',
  "ALTER TABLE projects ADD COLUMN quality TEXT NOT NULL DEFAULT ''",
]) {
  try {
    db.exec(sql);
  } catch {}
}

db.exec('UPDATE projects SET preview_key = lower(hex(randomblob(8))) WHERE preview_key IS NULL');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS projects_preview_key ON projects(preview_key)');

// zadania AI nie przetrwają restartu – oznacz niedokończone odpowiedzi
db.exec(`UPDATE messages SET meta = '{"note":"Generowanie przerwane (restart serwera). Wyślij prośbę ponownie."}' WHERE role = 'assistant' AND json_extract(meta, '$.status') = 'running'`);

import { setRulesDb } from './util.js';

export const newId = (bytes = 6) => crypto.randomBytes(bytes).toString('hex');
export const newToken = () => crypto.randomBytes(32).toString('base64url');

// ---------- hasła ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(hash, expected);
}

// ---------- pomocnicze ----------
const q = (sql) => db.prepare(sql);
export const one = (sql, ...args) => q(sql).get(...args);
export const all = (sql, ...args) => q(sql).all(...args);
export const run = (sql, ...args) => q(sql).run(...args);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ---------- projekty ----------
export const MAX_VERSIONS = 60;

export function getProject(id) {
  const p = one('SELECT * FROM projects WHERE id = ?', String(id));
  if (!p) return null;
  return { ...p, files: JSON.parse(p.files), published_files: p.published_files ? JSON.parse(p.published_files) : null };
}

export function saveFiles(projectId, files, label) {
  const now = Date.now();
  const json = JSON.stringify(files);
  const vid = newId();
  tx(() => {
    run('UPDATE projects SET files = ?, updated_at = ? WHERE id = ?', json, now, projectId);
    run('INSERT INTO versions (id, project_id, label, files, ts) VALUES (?, ?, ?, ?, ?)', vid, projectId, String(label).slice(0, 140), json, now);
    const old = all('SELECT id FROM versions WHERE project_id = ? ORDER BY ts DESC LIMIT -1 OFFSET ?', projectId, MAX_VERSIONS);
    for (const o of old) run('DELETE FROM versions WHERE id = ?', o.id);
  });
  return vid;
}

export function touchProject(id) {
  run('UPDATE projects SET updated_at = ? WHERE id = ?', Date.now(), id);
}

export function listAssets(projectId) {
  return all('SELECT name, mime, size, ts FROM assets WHERE project_id = ? ORDER BY name', projectId);
}

export function getMessages(projectId) {
  return all('SELECT id, role, content, meta, ts FROM messages WHERE project_id = ? ORDER BY id', projectId).map((m) => ({
    ...m,
    meta: JSON.parse(m.meta),
  }));
}

export function addMessage(projectId, role, content, meta = {}) {
  const r = run('INSERT INTO messages (project_id, role, content, meta, ts) VALUES (?, ?, ?, ?, ?)', projectId, role, content, JSON.stringify(meta), Date.now());
  return Number(r.lastInsertRowid);
}

export function updateMessage(id, content, meta) {
  run('UPDATE messages SET content = ?, meta = ? WHERE id = ?', content, JSON.stringify(meta), id);
}

// sprzątanie wygasłych sesji
export function cleanupSessions() {
  const now = Date.now();
  run('DELETE FROM sessions WHERE expires_at < ?', now);
  run('DELETE FROM app_sessions WHERE expires_at < ?', now);
}

setRulesDb({ one });
