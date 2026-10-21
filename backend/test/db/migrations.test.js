// Testa a migração de um banco com o schema ANTIGO (sem 'author', sem bio/active,
// sem courses.author_id) para o schema atual. Constrói o banco antigo antes de
// importar qualquer coisa de src/.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const dbFile = path.join(os.tmpdir(), `sm-mig-${crypto.randomUUID()}.db`);
const uploadsDir = path.join(os.tmpdir(), `sm-mig-uploads-${crypto.randomUUID()}`);
const lessonsDir = path.join(os.tmpdir(), `sm-mig-lessons-${crypto.randomUUID()}`);

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
    CREATE TABLE lessons (
      id TEXT PRIMARY KEY, course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', resource_type TEXT NOT NULL DEFAULT 'link',
      resource TEXT NOT NULL DEFAULT '', resource_name TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL
    );
  `);
  old.prepare("INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, 'Admin', 'a@b.com', 'hash', 'admin', 1)").run('u1');
  old.prepare("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, 'Aluno', 'c@d.com', 'hash', 'student')").run('u2');
  old.prepare("INSERT INTO courses (id, title, type) VALUES ('c1', 'Curso', 'gravado')").run();
  old.prepare("INSERT INTO courses (id, title, type) VALUES ('c-vazio', 'Sem aulas', 'gravado')").run();
  old.prepare("INSERT INTO courses (id, title, type) VALUES ('c-online', 'Síncrono', 'online')").run();
  const addCourse = old.prepare("INSERT INTO courses (id, title, type, description) VALUES (?, 'Legado', 'gravado', ?)");
  addCourse.run('c-xss', '<p onclick="alert(1)">Oi</p><img src=x onerror="alert(2)"><script>alert(3)</script>');
  addCourse.run('c-rich', '<p class="ql-align-center"><strong>Curso</strong> completo</p>');
  addCourse.run('c-text', 'Texto puro com a < b & c > d\nsegunda linha');
  const addLesson = old.prepare("INSERT INTO lessons (id, course_id, title, resource_type, resource, resource_name) VALUES (?, 'c1', 'Aula', 'file', ?, 'apostila.pdf')");
  addLesson.run('l-legado', '/uploads/legado123');
  addLesson.run('l-sumiu', '/uploads/nao-existe');
  mkdirSync(uploadsDir, { recursive: true });
  writeFileSync(path.join(uploadsDir, 'legado123'), 'conteudo antigo');
  old.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES ('t1', 'u1', datetime('now','+1 day'))").run();
  old.close();

  process.env.DB_FILE = dbFile;
  process.env.UPLOADS_DIR = uploadsDir;
  process.env.LESSON_STORAGE_DIR = lessonsDir;
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = '';
});

after(async () => {
  const { closeDatabase } = await import('../../src/db/index.js');
  closeDatabase();
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try { rmSync(dbFile + suffix, { force: true }); } catch { /* preso; SO limpa */ }
  }
  rmSync(uploadsDir, { recursive: true, force: true });
  rmSync(lessonsDir, { recursive: true, force: true });
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

test('descrições legadas com HTML são sanitizadas; texto puro fica intacto', async () => {
  const { db } = await import('../../src/db/index.js');
  const description = (id) => db.prepare('SELECT description FROM courses WHERE id = ?').get(id).description;

  // Given descrições gravadas antes do editor rico
  // Then o HTML perigoso some e o conteúdo permitido fica
  assert.equal(description('c-xss'), '<p>Oi</p>');
  assert.equal(description('c-rich'), '<p class="ql-align-center"><strong>Curso</strong> completo</p>');
  // e o texto puro não é tocado (o frontend o escapa na renderização)
  assert.equal(description('c-text'), 'Texto puro com a < b & c > d\nsegunda linha');
});

test('arquivos de aula em /uploads migram para o storage protegido', async () => {
  const { db } = await import('../../src/db/index.js');
  const resource = (id) => db.prepare('SELECT resource FROM lessons WHERE id = ?').get(id).resource;

  // Given um arquivo de aula antigo, público em /uploads
  // Then ele foi movido para o storage de aulas e o registro aponta para lá
  assert.equal(resource('l-legado'), 'stored:legado123');
  assert.equal(existsSync(path.join(uploadsDir, 'legado123')), false);
  assert.equal(readFileSync(path.join(lessonsDir, 'legado123'), 'utf8'), 'conteudo antigo');

  // e um registro cujo arquivo sumiu fica como estava
  assert.equal(resource('l-sumiu'), '/uploads/nao-existe');
});

test('status dos cursos existentes: assíncrono com aulas = liberado; demais = em edição', async () => {
  const { db } = await import('../../src/db/index.js');
  const status = (id) => db.prepare('SELECT status FROM courses WHERE id = ?').get(id).status;
  assert.equal(status('c1'), 'liberado'); // gravado com aulas (l-legado, l-sumiu)
  assert.equal(status('c-vazio'), 'em_edicao');
  assert.equal(status('c-online'), 'em_edicao');
  const cols = db.prepare('PRAGMA table_info(enrollments)').all().map((c) => c.name);
  assert.ok(cols.includes('class_id'));
});

test('nenhuma violação de FK após a migração', async () => {
  const { db } = await import('../../src/db/index.js');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('reexecutar o boot é idempotente (schema estável)', async () => {
  const first = await import('../../src/db/index.js');
  const before = first.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get().sql;
  const descriptionsBefore = first.db.prepare('SELECT id, description FROM courses ORDER BY id').all();

  // When um novo módulo db roda de novo sobre o mesmo arquivo já migrado
  const second = await import('../../src/db/index.js?again=1');
  const after = second.db.prepare("SELECT sql FROM sqlite_master WHERE name = 'users'").get().sql;
  const descriptionsAfter = second.db.prepare('SELECT id, description FROM courses ORDER BY id').all();

  // Then não muda nada e não lança
  assert.equal(after, before);
  assert.deepEqual(descriptionsAfter, descriptionsBefore);
  second.closeDatabase();
});
