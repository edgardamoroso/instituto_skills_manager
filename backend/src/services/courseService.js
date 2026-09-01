import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { toCents } from '../lib/money.js';
import { badRequest, notFound, unauthorized, forbidden } from '../lib/errors.js';
import { str, optionalStr, oneOf } from '../lib/validate.js';

const listCoursesStmt = db.prepare('SELECT * FROM courses ORDER BY created_at DESC, title ASC');
const getCourseStmt = db.prepare('SELECT * FROM courses WHERE id = ?');
const listLessonsStmt = db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position ASC, rowid ASC');
const insertCourseStmt = db.prepare(
  `INSERT INTO courses (id, title, type, description, duration, price_cents)
   VALUES (@id, @title, @type, @description, @duration, @price_cents)`,
);
const updateCourseStmt = db.prepare(
  `UPDATE courses SET title = @title, type = @type, description = @description,
   duration = @duration, price_cents = @price_cents WHERE id = @id`,
);
const deleteCourseStmt = db.prepare('DELETE FROM courses WHERE id = ?');
const insertLessonStmt = db.prepare(
  `INSERT INTO lessons (id, course_id, title, description, resource_type, resource, resource_name, position)
   VALUES (@id, @course_id, @title, @description, @resource_type, @resource, @resource_name, @position)`,
);
const deleteLessonStmt = db.prepare('DELETE FROM lessons WHERE id = ? AND course_id = ?');
const maxPositionStmt = db.prepare('SELECT COALESCE(MAX(position), 0) AS maxPos FROM lessons WHERE course_id = ?');
const activeEnrollmentStmt = db.prepare(
  "SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?",
);

function lessonToApi(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    resourceType: row.resource_type,
    resource: row.resource,
    resourceName: row.resource_name,
  };
}

function courseToApi(row, { withLessons = false } = {}) {
  const course = {
    id: row.id,
    title: row.title,
    type: row.type,
    description: row.description,
    duration: row.duration,
    priceCents: row.price_cents,
  };
  if (withLessons) {
    course.lessons = listLessonsStmt.all(row.id).map(lessonToApi);
  } else {
    course.lessonCount = listLessonsStmt.all(row.id).length;
  }
  return course;
}

function normalizeCourseInput(input = {}) {
  const priceCents = toCents(input.priceCents ?? input.price);
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) {
    throw badRequest('COURSE_PRICE_INVALID');
  }
  return {
    title: str(input.title, { code: 'COURSE_FIELDS_REQUIRED', min: 1, max: 160 }),
    type: oneOf(input.type === 'online' ? 'online' : 'gravado', ['gravado', 'online']),
    description: str(input.description, { code: 'COURSE_FIELDS_REQUIRED', min: 1, max: 2000 }),
    duration: str(input.duration, { code: 'COURSE_FIELDS_REQUIRED', min: 1, max: 80 }),
    price_cents: priceCents,
  };
}

function assertCourseInput(data) {
  if (!data.title || !data.description || !data.duration) throw badRequest('COURSE_FIELDS_REQUIRED');
}

export function getCourses() {
  return listCoursesStmt.all().map((row) => courseToApi(row));
}

export function getCourse(courseId) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  return courseToApi(row, { withLessons: true });
}

export function createCourse(input) {
  const data = normalizeCourseInput(input);
  assertCourseInput(data);
  const id = crypto.randomUUID();
  insertCourseStmt.run({ id, ...data });
  return getCourse(id);
}

export function updateCourse(courseId, input) {
  if (!getCourseStmt.get(courseId)) throw notFound('COURSE_NOT_FOUND');
  const data = normalizeCourseInput(input);
  assertCourseInput(data);
  updateCourseStmt.run({ id: courseId, ...data });
  return getCourse(courseId);
}

export function deleteCourse(courseId) {
  if (!getCourseStmt.get(courseId)) throw notFound('COURSE_NOT_FOUND');
  deleteCourseStmt.run(courseId);
}

export function addLesson(courseId, lesson) {
  if (!getCourseStmt.get(courseId)) throw notFound('COURSE_NOT_FOUND');
  const title = str(lesson.title, { code: 'LESSON_FIELDS_REQUIRED', min: 1, max: 160 });
  const resource = str(lesson.resource, { code: 'LESSON_FIELDS_REQUIRED', min: 1, max: 2000 });
  const row = {
    id: crypto.randomUUID(),
    course_id: courseId,
    title,
    description: optionalStr(lesson.description, { max: 2000 }),
    resource_type: oneOf(lesson.resourceType || 'link', ['video', 'pdf', 'link', 'file']),
    resource,
    resource_name: optionalStr(lesson.resourceName, { max: 200 }),
    position: maxPositionStmt.get(courseId).maxPos + 1,
  };
  insertLessonStmt.run(row);
  return lessonToApi(row);
}

export function deleteLesson(courseId, lessonId) {
  if (!getCourseStmt.get(courseId)) throw notFound('COURSE_NOT_FOUND');
  deleteLessonStmt.run(lessonId, courseId);
}

// Conteúdo protegido: só com matrícula ativa (ou admin).
export function getCourseContent(courseId, user) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  if (!user) throw unauthorized('AUTH_REQUIRED');

  if (user.role !== 'admin') {
    const enrollment = activeEnrollmentStmt.get(user.id, courseId);
    if (!enrollment) throw forbidden('ENROLLMENT_NOT_FOUND');
    if (enrollment.status !== 'ativa') {
      const error = forbidden('ENROLLMENT_INACTIVE');
      error.reason = enrollment.status_reason || '';
      throw error;
    }
  }

  return {
    course: courseToApi(row),
    lessons: listLessonsStmt.all(courseId).map(lessonToApi),
  };
}
