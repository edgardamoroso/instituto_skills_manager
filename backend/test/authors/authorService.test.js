import '../helpers/harness.js';
import { removeDbFile } from '../helpers/harness.js';
import test, { after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../../src/db/index.js';
import { createAuthor, updateAuthor, deleteAuthor, getAuthor } from '../../src/services/authorService.js';
import { completePasswordSet } from '../../src/services/authService.js';
import { clearOutbox } from '../../src/lib/mailer.js';

beforeEach(() => clearOutbox());
after(async () => removeDbFile());

function uniqueEmail() {
  return `svc-${crypto.randomUUID()}@ex.com`;
}

test('createAuthor grava papel author e volta pendente de convite', () => {
  // Given dados válidos
  // When criado
  const author = createAuthor({ name: 'Fulana', email: uniqueEmail(), bio: 'x' });

  // Then é author, ativo, pendente
  const row = db.prepare('SELECT role, active, password_hash FROM users WHERE id = ?').get(author.id);
  assert.equal(row.role, 'author');
  assert.equal(row.active, 1);
  assert.equal(row.password_hash, '');
  assert.equal(author.pendingInvite, true);
});

test('createAuthor exige nome e e-mail', () => {
  assert.throws(() => createAuthor({ name: '', email: 'a@b.com' }), /AUTHOR_FIELDS_REQUIRED/);
  assert.throws(() => createAuthor({ name: 'X', email: 'invalido' }), /AUTHOR_FIELDS_REQUIRED/);
});

test('updateAuthor altera a bio sem tocar no resto', () => {
  const author = createAuthor({ name: 'Bio', email: uniqueEmail() });
  const updated = updateAuthor(author.id, { bio: 'nova bio' });
  assert.equal(updated.bio, 'nova bio');
  assert.equal(updated.name, 'Bio');
});

test('deleteAuthor recusa autor que assina curso', () => {
  // Given um autor com um curso atribuído
  const author = createAuthor({ name: 'ComCurso', email: uniqueEmail() });
  db.prepare("INSERT INTO courses (id, title, type, author_id) VALUES (?, 'C', 'gravado', ?)")
    .run(crypto.randomUUID(), author.id);

  // When tentamos remover
  // Then conflito
  assert.throws(() => deleteAuthor(author.id), /AUTHOR_HAS_COURSES/);
  assert.ok(getAuthor(author.id));
});

test('completePasswordSet recusa token expirado', () => {
  // Given um autor e um token set_password já expirado
  const author = createAuthor({ name: 'Exp', email: uniqueEmail() });
  const token = crypto.randomBytes(8).toString('hex');
  db.prepare("INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?, ?, 'set_password', ?)")
    .run(token, author.id, new Date(Date.now() - 1000).toISOString());

  // When tentamos completar
  // Then inválido
  assert.throws(() => completePasswordSet(token, 'senha-forte-1'), /PASSWORD_SET_INVALID/);
});

test('completePasswordSet recusa senha curta', () => {
  const author = createAuthor({ name: 'Curta', email: uniqueEmail() });
  const token = crypto.randomBytes(8).toString('hex');
  db.prepare("INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?, ?, 'set_password', ?)")
    .run(token, author.id, new Date(Date.now() + 3600_000).toISOString());
  assert.throws(() => completePasswordSet(token, 'curta'), /PASSWORD_TOO_SHORT/);
});
