// Testa a migração de um banco com o schema ANTIGO (sem 'author', sem bio/active,
// sem courses.author_id) para o schema atual. Constrói o banco antigo antes de
// importar qualquer coisa de src/.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dbFile = path.join(os.tmpdir(), `sm-mig-${crypto.randomUUID()}.db`);

before(() => {
  const old = new DatabaseSync(dbFile);
  old.exec('PRAGMA foreign_keys = ON');
  old.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE courses (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, type TEXT NOT NULL CHECK (type IN ('gravado','online')),
      description TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
    );
  `);
  old.prepare("INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, 'Admin', 'a@b.com', 'hash', 'admin', 1)").run('u1');
  old.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Aluno', 'c@d.com', 'hash', 'student')").run('u2');
  old.prepare("INSERT INTO courses (id, title, type) VALUES ('c1', 'Curso', 'gravado')").run();
  old.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES ('t1', 'u1', datetime('now','+1 day'))").run();
  old.close();

  process.env.DB_FILE = dbFile;
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = '';
});

after(async () => {
  const { closeDatabase } = await import('../../src/db/index.js');
  closeDatabase();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { rmSync(dbFile + suffix, { force: true }); } catch { /* preso; SO limpa */ }
  }
});

test('a migração amplia o CHECK de role e adiciona bio/active preservando linhas', async () => {
  // Given o banco antigo criado acima
  // When importamos db/index.js (dispara as migrações no boot)
  const { db } = await import('../../src/db/index.js');

  // Then users aceita 'author' e ganhou bio/active
  const usersSql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get().sql;
  assert.match(usersSql, /'author'/);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  assert.ok(cols.includes('bio'));
  assert.ok(cols.includes('active'));

  // e as linhas pré-existentes seguem lá, com defaults aplicados
  const admin = db.prepare("SELECT * FROM users WHERE id = 'u1'").get();
  assert.equal(admin.role, 'admin');
  assert.equal(admin.email, 'a@b.com');
  assert.equal(admin.bio, '');
  assert.equal(admin.active, 1);
  assert.equal(db.prepare('SELECT count(*) AS n FROM users').get().n, 2);

  // a sessão (FK -> users) continua íntegra
  assert.equal(db.prepare("SELECT user_id FROM sessions WHERE token = 't1'").get().user_id, 'u1');
});

test('courses.author_id foi adicionado como FK opcional', async () => {
  const { db } = await import('../../src/db/index.js');

  // Given a coluna nova
  const cols = db.prepare('PRAGMA table_info(courses)').all().map((c) => c.name);
  assert.ok(cols.includes('author_id'));

  // When um curso fica sem autor -> ok
  assert.equal(db.prepare("SELECT author_id FROM courses WHERE id = 'c1'").get().author_id, null);

  // Then a FK recusa um autor inexistente
  assert.throws(
    () => db.prepare("UPDATE courses SET author_id = 'nao-existe' WHERE id = 'c1'").run(),
    /FOREIGN KEY/i,
  );
});

test('nenhuma violação de FK após a migração', async () => {
  const { db } = await import('../../src/db/index.js');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('reexecutar o boot é idempotente (schema estável)', async () => {
  const first = await import('../../src/db/index.js');
  const before = first.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get().sql;

  // When um novo módulo db roda de novo sobre o mesmo arquivo já migrado
  const second = await import('../../src/db/index.js?again=1');
  const after = second.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get().sql;

  // Then não muda nada e não lança
  assert.equal(after, before);
  second.closeDatabase();
});
