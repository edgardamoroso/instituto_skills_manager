import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { hashPassword } from '../lib/password.js';
import { conflict, notFound, badRequest } from '../lib/errors.js';
import { str, email as validateEmail, optionalStr } from '../lib/validate.js';

const listStmt = db.prepare(
  `SELECT u.id, u.name, u.email, u.phone, u.address, u.created_at,
          (SELECT count(*) FROM enrollments e WHERE e.user_id = u.id) AS enrollments_total,
          (SELECT count(*) FROM enrollments e WHERE e.user_id = u.id AND e.status = 'ativa') AS enrollments_active
   FROM users u WHERE u.role = 'student' ORDER BY u.name ASC`,
);
const getStmt = db.prepare("SELECT id, name, email, phone, address, created_at FROM users WHERE id = ? AND role = 'student'");
const getByEmailStmt = db.prepare('SELECT id FROM users WHERE email = ?');
const insertStmt = db.prepare(
  `INSERT INTO users (id, name, email, password_hash, phone, address, role, email_verified)
   VALUES (@id, @name, @email, @password_hash, @phone, @address, 'student', 1)`,
);
const updateStmt = db.prepare(
  'UPDATE users SET name = @name, email = @email, phone = @phone, address = @address WHERE id = @id',
);
const setPasswordStmt = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const deleteStmt = db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'");
const deleteSessionsStmt = db.prepare('DELETE FROM sessions WHERE user_id = ?');

function normalize(input = {}) {
  return {
    name: str(input.name, { code: 'STUDENT_FIELDS_REQUIRED', min: 1, max: 120 }),
    email: validateEmail(input.email, { code: 'STUDENT_FIELDS_REQUIRED' }),
    phone: optionalStr(input.phone, { max: 40 }),
    address: optionalStr(input.address, { max: 200 }),
  };
}

function toApi(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    enrollmentsTotal: row.enrollments_total ?? 0,
    enrollmentsActive: row.enrollments_active ?? 0,
  };
}

function randomPassword() {
  return crypto.randomBytes(9).toString('base64url');
}

function assertPassword(value) {
  const text = String(value);
  if (text.length < 8 || text.length > 200) throw badRequest('PASSWORD_TOO_SHORT');
  return text;
}

export function listStudents() {
  return listStmt.all().map(toApi);
}

export function getStudent(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('STUDENT_NOT_FOUND');
  return toApi({ ...row, enrollments_total: 0, enrollments_active: 0 });
}

export function createStudent(input) {
  const data = normalize(input);
  if (getByEmailStmt.get(data.email)) throw conflict('EMAIL_IN_USE');
  const id = crypto.randomUUID();
  const provided = input?.password ? assertPassword(input.password) : '';
  const temporaryPassword = provided || randomPassword();
  insertStmt.run({ id, ...data, password_hash: hashPassword(temporaryPassword) });
  return { ...getStudent(id), temporaryPassword };
}

export function updateStudent(id, input) {
  if (!getStmt.get(id)) throw notFound('STUDENT_NOT_FOUND');
  const data = normalize(input);
  const clash = getByEmailStmt.get(data.email);
  if (clash && clash.id !== id) throw conflict('EMAIL_IN_USE');
  updateStmt.run({ id, ...data });
  const result = getStudent(id);
  if (input?.password) {
    setPasswordStmt.run(hashPassword(assertPassword(input.password)), id);
    deleteSessionsStmt.run(id); // invalida sessões ativas do aluno
  }
  return result;
}

export function resetStudentPassword(id) {
  if (!getStmt.get(id)) throw notFound('STUDENT_NOT_FOUND');
  const temporaryPassword = randomPassword();
  setPasswordStmt.run(hashPassword(temporaryPassword), id);
  deleteSessionsStmt.run(id);
  return { temporaryPassword };
}

export function deleteStudent(id) {
  if (!getStmt.get(id)) throw notFound('STUDENT_NOT_FOUND');
  deleteStmt.run(id);
}
