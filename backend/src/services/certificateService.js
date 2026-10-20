import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';

// Certificado de conclusão: liberado quando o aluno abriu todas as aulas do
// curso (lesson_progress). Emitido uma vez por aluno/curso; nome, curso e carga
// horária ficam gravados como estavam na emissão. O código é público: quem tem o
// link consegue conferir a autenticidade.

const courseStmt = db.prepare('SELECT * FROM courses WHERE id = ?');
const authorNameStmt = db.prepare("SELECT name FROM users WHERE id = ? AND role = 'author'");
const userStmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
const enrollmentStmt = db.prepare('SELECT status FROM enrollments WHERE user_id = ? AND course_id = ?');
const progressStmt = db.prepare(
  `SELECT count(*) AS total,
          sum(CASE WHEN p.lesson_id IS NULL THEN 0 ELSE 1 END) AS opened
   FROM lessons l LEFT JOIN lesson_progress p ON p.lesson_id = l.id AND p.user_id = ?
   WHERE l.course_id = ?`,
);
const byUserCourseStmt = db.prepare('SELECT * FROM certificates WHERE user_id = ? AND course_id = ?');
const byCodeStmt = db.prepare('SELECT * FROM certificates WHERE code = ?');
const byUserStmt = db.prepare('SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC');
const insertStmt = db.prepare(
  `INSERT INTO certificates (code, user_id, course_id, student_name, course_title, duration, author_name, issued_at)
   VALUES (@code, @user_id, @course_id, @student_name, @course_title, @duration, @author_name, @issued_at)`,
);

// Sem 0/O/1/I/L para não confundir quem digita o código.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_FORMAT = /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

function newCode() {
  const bytes = crypto.randomBytes(12);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function toApi(row) {
  return {
    code: row.code,
    courseId: row.course_id,
    studentName: row.student_name,
    courseTitle: row.course_title,
    duration: row.duration,
    authorName: row.author_name || null,
    issuedAt: row.issued_at,
  };
}

// Progresso do aluno no curso (aulas abertas / total).
export function courseProgress(userId, courseId) {
  const { total, opened } = progressStmt.get(userId, courseId);
  const done = Number(opened || 0);
  return { total, opened: done, completed: total > 0 && done >= total };
}

export function certificateFor(userId, courseId) {
  const row = byUserCourseStmt.get(userId, courseId);
  return row ? toApi(row) : null;
}

// Emite (ou devolve o já emitido) para o aluno logado.
export function issueCertificate(courseId, user) {
  if (!user) throw unauthorized('AUTH_REQUIRED');
  const course = courseStmt.get(String(courseId || ''));
  if (!course) throw notFound('COURSE_NOT_FOUND');
  const existing = byUserCourseStmt.get(user.id, course.id);
  if (existing) return toApi(existing);

  const enrollment = enrollmentStmt.get(user.id, course.id);
  if (!enrollment) throw forbidden('ENROLLMENT_NOT_FOUND');
  if (enrollment.status !== 'ativa') throw forbidden('ENROLLMENT_INACTIVE');
  if (!courseProgress(user.id, course.id).completed) throw forbidden('COURSE_NOT_COMPLETED');

  const student = userStmt.get(user.id);
  const row = {
    code: newCode(),
    user_id: user.id,
    course_id: course.id,
    student_name: student.name,
    course_title: course.title,
    duration: course.duration || '',
    author_name: course.author_id ? (authorNameStmt.get(course.author_id)?.name || '') : '',
    issued_at: new Date().toISOString(),
  };
  insertStmt.run(row);
  return toApi(row);
}

export function getCertificate(code) {
  const normalized = normalizeCode(code);
  const row = CODE_FORMAT.test(normalized) ? byCodeStmt.get(normalized) : null;
  if (!row) throw notFound('CERTIFICATE_NOT_FOUND');
  return toApi(row);
}

export function listMyCertificates(user) {
  if (!user) throw unauthorized('AUTH_REQUIRED');
  return byUserStmt.all(user.id).map(toApi);
}
