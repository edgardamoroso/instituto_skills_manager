import crypto from 'node:crypto';
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

// Migrações leves e idempotentes para bancos criados antes destas mudanças.
function columnExists(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function tableSql(name) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);
  return row ? row.sql : '';
}

// 1) users.email_verified (bancos anteriores a esta coluna).
if (!columnExists('users', 'email_verified')) {
  db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  db.exec('UPDATE users SET email_verified = 1'); // usuários pré-existentes seguem válidos
}

// 2) users: papel 'author' no CHECK + colunas bio/active. SQLite não faz DROP CONSTRAINT,
//    então reconstrói a tabela pelo procedimento oficial de 12 passos.
if (!tableSql('users').includes("'author'")) {
  db.exec('PRAGMA foreign_keys = OFF');
  transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id             TEXT PRIMARY KEY,
        name           TEXT NOT NULL,
        email          TEXT NOT NULL UNIQUE,
        password_hash  TEXT NOT NULL,
        phone          TEXT NOT NULL DEFAULT '',
        address        TEXT NOT NULL DEFAULT '',
        role           TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student', 'author')),
        email_verified INTEGER NOT NULL DEFAULT 0,
        bio            TEXT NOT NULL DEFAULT '',
        active         INTEGER NOT NULL DEFAULT 1,
        created_at     TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    db.exec(`
      INSERT INTO users_new (id, name, email, password_hash, phone, address, role, email_verified, bio, active, created_at)
      SELECT id, name, email, password_hash, phone, address, role, COALESCE(email_verified, 0), '', 1, created_at
      FROM users`);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
  });
  const violations = db.prepare('PRAGMA foreign_key_check').all();
  db.exec('PRAGMA foreign_keys = ON');
  if (violations.length) {
    throw new Error(`Migração de users deixou ${violations.length} violação(ões) de FK`);
  }
}

// 3) courses.author_id (FK opcional para o autor do curso). O índice fica aqui, e não
//    no schema.sql, porque a coluna pode não existir quando o schema roda num banco antigo.
if (!columnExists('courses', 'author_id')) {
  db.exec('ALTER TABLE courses ADD COLUMN author_id TEXT REFERENCES users(id) ON DELETE SET NULL');
}
db.exec('CREATE INDEX IF NOT EXISTS idx_courses_author ON courses(author_id)');

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

// Fecha a conexão. Usado nos testes para liberar o arquivo temporário antes de removê-lo.
export function closeDatabase() {
  try {
    db.close();
  } catch {
    /* já fechada */
  }
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
