import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { conflict, notFound } from '../lib/errors.js';
import { str, email as validateEmail, optionalStr } from '../lib/validate.js';
import { issuePasswordSet } from './authService.js';

const listStmt = db.prepare(
  `SELECT u.id, u.name, u.email, u.bio, u.active, u.password_hash, u.created_at,
          (SELECT count(*) FROM courses c WHERE c.author_id = u.id) AS courses_count
   FROM users u WHERE u.role = 'author' ORDER BY u.name ASC`,
);
const getStmt = db.prepare(
  `SELECT u.id, u.name, u.email, u.bio, u.active, u.password_hash, u.created_at,
          (SELECT count(*) FROM courses c WHERE c.author_id = u.id) AS courses_count
   FROM users u WHERE u.id = ? AND u.role = 'author'`,
);
const getByEmailStmt = db.prepare('SELECT id FROM users WHERE email = ?');
const insertStmt = db.prepare(
  `INSERT INTO users (id, name, email, password_hash, role, email_verified, bio, active)
   VALUES (@id, @name, @email, '', 'author', 1, @bio, 1)`,
);
const updateStmt = db.prepare('UPDATE users SET name = @name, bio = @bio, active = @active WHERE id = @id');
const deleteStmt = db.prepare("DELETE FROM users WHERE id = ? AND role = 'author'");
const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    bio: row.bio,
    active: row.active === 1,
    pendingInvite: !row.password_hash,
    coursesCount: row.courses_count ?? 0,
    createdAt: row.created_at,
  };
}

function normalize(input = {}) {
  return {
    name: str(input.name, { code: 'AUTHOR_FIELDS_REQUIRED', min: 1, max: 120 }),
    email: validateEmail(input.email, { code: 'AUTHOR_FIELDS_REQUIRED' }),
    bio: optionalStr(input.bio, { max: 2000 }),
  };
}

export function listAuthors() {
  return listStmt.all().map(toApi);
}

export function getAuthor(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('AUTHOR_NOT_FOUND');
  return toApi(row);
}

export function createAuthor(input) {
  const data = normalize(input);
  if (getByEmailStmt.get(data.email)) throw conflict('AUTHOR_EMAIL_IN_USE');
  const id = crypto.randomUUID();
  insertStmt.run({ id, ...data });
  issuePasswordSet({ id, name: data.name, email: data.email });
  return getAuthor(id);
}

export function updateAuthor(id, input = {}) {
  const current = getStmt.get(id);
  if (!current) throw notFound('AUTHOR_NOT_FOUND');
  const name = input.name === undefined ? current.name : str(input.name, { code: 'AUTHOR_FIELDS_REQUIRED', min: 1, max: 120 });
  const bio = input.bio === undefined ? current.bio : optionalStr(input.bio, { max: 2000 });
  const active = input.active === undefined ? current.active : (input.active ? 1 : 0);
  updateStmt.run({ id, name, bio, active });
  if (active === 0) deleteSessionsStmt.run(id);
  return getAuthor(id);
}

export function reinviteAuthor(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('AUTHOR_NOT_FOUND');
  issuePasswordSet({ id: row.id, name: row.name, email: row.email });
}

export function deleteAuthor(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('AUTHOR_NOT_FOUND');
  if (row.courses_count > 0) throw conflict('AUTHOR_HAS_COURSES');
  deleteStmt.run(id);
}
