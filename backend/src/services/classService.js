import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { isValidISODate } from '../lib/dates.js';
import { optionalStr, oneOf, str } from '../lib/validate.js';

// Turmas dos cursos síncronos. Inscrição só em turma "em_formacao" com vaga.
// O link/local (location) só sai para quem edita o curso ou está na turma.

export const CLASS_STATUSES = ['em_formacao', 'em_andamento', 'finalizada'];

const courseStmt = db.prepare('SELECT id, type, author_id FROM courses WHERE id = ?');
const classStmt = db.prepare('SELECT * FROM course_classes WHERE id = ?');
const classesByCourseStmt = db.prepare(
  `SELECT k.*, (SELECT count(*) FROM enrollments e WHERE e.class_id = k.id) AS enrolled
   FROM course_classes k WHERE k.course_id = ?
   ORDER BY CASE k.status WHEN 'em_formacao' THEN 0 WHEN 'em_andamento' THEN 1 ELSE 2 END,
            COALESCE(k.start_date, '9999') ASC, k.created_at ASC`,
);
const enrolledCountStmt = db.prepare('SELECT count(*) AS n FROM enrollments WHERE class_id = ?');
const insertStmt = db.prepare(
  `INSERT INTO course_classes (id, course_id, name, start_date, end_date, schedule, capacity, location, status)
   VALUES (@id, @course_id, @name, @start_date, @end_date, @schedule, @capacity, @location, @status)`,
);
const updateStmt = db.prepare(
  `UPDATE course_classes SET name = @name, start_date = @start_date, end_date = @end_date, schedule = @schedule,
   capacity = @capacity, location = @location, status = @status WHERE id = @id`,
);
const deleteStmt = db.prepare('DELETE FROM course_classes WHERE id = ?');
const rosterStmt = db.prepare(
  `SELECT e.id AS enrollment_id, e.status, e.status_reason, e.created_at, u.id AS user_id, u.name, u.email, u.phone
   FROM enrollments e JOIN users u ON u.id = e.user_id
   WHERE e.class_id = ? ORDER BY u.name ASC`,
);

function canEdit(course, actor) {
  return actor?.role === 'admin' || (actor?.role === 'author' && course.author_id === actor.id);
}

function editableCourse(courseId, actor) {
  const course = courseStmt.get(courseId);
  if (!course) throw notFound('COURSE_NOT_FOUND');
  if (!canEdit(course, actor)) throw forbidden('COURSE_FORBIDDEN');
  if (course.type !== 'online') throw badRequest('CLASSES_ONLY_FOR_ONLINE');
  return course;
}

function seatsLeft(row) {
  if (row.capacity == null) return null;
  return Math.max(0, row.capacity - (row.enrolled ?? enrolledCountStmt.get(row.id).n));
}

export function classToApi(row, { withLocation = false } = {}) {
  const enrolled = row.enrolled ?? enrolledCountStmt.get(row.id).n;
  const left = row.capacity == null ? null : Math.max(0, row.capacity - enrolled);
  const api = {
    id: row.id,
    courseId: row.course_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    schedule: row.schedule,
    capacity: row.capacity,
    enrolled,
    seatsLeft: left,
    status: row.status,
    open: row.status === 'em_formacao' && (left == null || left > 0),
  };
  if (withLocation) api.location = row.location;
  return api;
}

function optionalDate(value, code) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!isValidISODate(text)) throw badRequest(code);
  return text;
}

function normalize(input = {}) {
  const startDate = optionalDate(input.startDate, 'CLASS_START_INVALID');
  const endDate = optionalDate(input.endDate, 'CLASS_END_INVALID');
  if (startDate && endDate && endDate < startDate) throw badRequest('CLASS_DATES_INVALID');
  const rawCapacity = String(input.capacity ?? '').trim();
  let capacity = null;
  if (rawCapacity) {
    capacity = Number.parseInt(rawCapacity, 10);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) throw badRequest('CLASS_CAPACITY_INVALID');
  }
  return {
    name: str(input.name, { code: 'CLASS_FIELDS_REQUIRED', min: 1, max: 120 }),
    start_date: startDate,
    end_date: endDate,
    schedule: optionalStr(input.schedule, { max: 200 }),
    capacity,
    location: optionalStr(input.location, { max: 500 }),
    status: oneOf(input.status || 'em_formacao', CLASS_STATUSES, { code: 'CLASS_STATUS_INVALID' }),
  };
}

// Público: só turmas em formação (sem link/local). Quem edita: todas, com link.
export function listClasses(courseId, viewer) {
  const course = courseStmt.get(courseId);
  if (!course) throw notFound('COURSE_NOT_FOUND');
  const editor = canEdit(course, viewer);
  return classesByCourseStmt.all(courseId)
    .filter((row) => editor || row.status === 'em_formacao')
    .map((row) => classToApi(row, { withLocation: editor }));
}

export function createClass(courseId, input, actor) {
  editableCourse(courseId, actor);
  const id = crypto.randomUUID();
  insertStmt.run({ id, course_id: courseId, ...normalize(input) });
  return classToApi(classStmt.get(id), { withLocation: true });
}

export function updateClass(courseId, classId, input, actor) {
  editableCourse(courseId, actor);
  const current = classStmt.get(classId);
  if (!current || current.course_id !== courseId) throw notFound('CLASS_NOT_FOUND');
  const next = normalize(input);
  const enrolled = enrolledCountStmt.get(classId).n;
  if (next.capacity != null && next.capacity < enrolled) throw conflict('CLASS_CAPACITY_BELOW_ENROLLED');
  updateStmt.run({ id: classId, ...next });
  return classToApi(classStmt.get(classId), { withLocation: true });
}

export function deleteClass(courseId, classId, actor) {
  editableCourse(courseId, actor);
  const current = classStmt.get(classId);
  if (!current || current.course_id !== courseId) throw notFound('CLASS_NOT_FOUND');
  if (enrolledCountStmt.get(classId).n > 0) throw conflict('CLASS_HAS_STUDENTS');
  deleteStmt.run(classId);
}

// Inscritos da turma (só admin — dados de alunos).
export function classRoster(courseId, classId) {
  const current = classStmt.get(classId);
  if (!current || current.course_id !== courseId) throw notFound('CLASS_NOT_FOUND');
  return {
    class: classToApi(current, { withLocation: true }),
    students: rosterStmt.all(classId).map((row) => ({
      enrollmentId: row.enrollment_id,
      userId: row.user_id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      enrollmentStatus: row.status,
      statusReason: row.status_reason,
      enrolledAt: row.created_at,
    })),
  };
}

// Valida a turma escolhida para uma matrícula. ignoreClassId: a matrícula já
// está nela (troca para a mesma turma não consome vaga). forStudent: exige
// turma em formação; o admin pode alocar em turma em andamento.
export function assertClassAvailable(courseId, classId, { forStudent = false, ignoreClassId = null } = {}) {
  const row = classStmt.get(String(classId || ''));
  if (!row || row.course_id !== courseId) throw badRequest('CLASS_INVALID');
  if (row.id === ignoreClassId) return row;
  if (row.status === 'finalizada') throw conflict('CLASS_CLOSED');
  if (forStudent && row.status !== 'em_formacao') throw conflict('CLASS_CLOSED');
  if (seatsLeft({ ...row, enrolled: undefined }) === 0) throw conflict('CLASS_FULL');
  return row;
}

export function getClass(classId) {
  const row = classId ? classStmt.get(classId) : null;
  return row || null;
}
