import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../lib/config.js'; // carrega backend/.env antes de qualquer coisa
import { seedDatabase } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDirectory = path.resolve(here, '../../data');
const databaseFile = process.env.DB_FILE || path.join(dataDirectory, 'skills-manager.db');

mkdirSync(dataDirectory, { recursive: true });

export const db = new DatabaseSync(databaseFile);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
db.exec(readFileSync(path.join(here, 'schema.sql'), 'utf8'));

// Migrações leves para bancos criados antes destas colunas.
function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}
if (!columnExists('users', 'email_verified')) {
  db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  db.exec("UPDATE users SET email_verified = 1"); // usuários pré-existentes seguem válidos
}

const courseCount = db.prepare('SELECT count(*) AS total FROM courses').get().total;
const userCount = db.prepare('SELECT count(*) AS total FROM users').get().total;
if (courseCount === 0 && userCount === 0) {
  seedDatabase(db);
}

// Limpeza de sessões e tokens expirados: no boot e a cada 6 h.
function cleanupExpired() {
  try {
    db.exec("DELETE FROM sessions WHERE expires_at < datetime('now')");
    db.exec("DELETE FROM email_tokens WHERE expires_at < datetime('now')");
  } catch (error) {
    console.error('Falha na limpeza de expirados:', error.message);
  }
}
cleanupExpired();
setInterval(cleanupExpired, 6 * 60 * 60 * 1000).unref();

export function uid() {
  return crypto.randomUUID();
}

// node:sqlite não tem helper de transação como o better-sqlite3.
export function transaction(run) {
  db.exec('BEGIN');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
