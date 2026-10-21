import crypto from 'node:crypto';
import path from 'node:path';
import { db, transaction } from '../db/index.js';
import { isLessonFile, lessonFilePath, removeLessonFile } from '../lib/lessonFiles.js';
import { toCents } from '../lib/money.js';
import { badRequest, notFound, unauthorized, forbidden } from '../lib/errors.js';
import { str, optionalStr, oneOf } from '../lib/validate.js';
import { sanitizeDescriptionHtml } from '../lib/richText.js';
import { parseVideoLink, embedUrlFor } from './videoService.js';
import { certificateFor, courseProgress } from './certificateService.js';
import { classToApi, getClass } from './classService.js';

export const COURSE_STATUSES = ['em_edicao', 'em_atualizacao', 'liberado'];

const listCoursesStmt = db.prepare('SELECT * FROM courses ORDER BY created_at DESC, title ASC');
const enrollmentOfStmt = db.prepare('SELECT id, class_id FROM enrollments WHERE user_id = ? AND course_id = ?');
const listCoursesByAuthorStmt = db.prepare('SELECT * FROM courses WHERE author_id = ? ORDER BY created_at DESC, title ASC');
const getCourseStmt = db.prepare('SELECT * FROM courses WHERE id = ?');
const getAuthorStmt = db.prepare("SELECT id, name, bio FROM users WHERE id = ? AND role = 'author'");
const listLessonsStmt = db.prepare('SELECT * FROM lessons WHERE course_id = ? ORDER BY position ASC, rowid ASC');
const insertCourseStmt = db.prepare(
  `INSERT INTO courses (id, title, type, description, duration, price_cents, author_id, status)
   VALUES (@id, @title, @type, @description, @duration, @price_cents, @author_id, @status)`,
);
const updateCourseStmt = db.prepare(
  `UPDATE courses SET title = @title, type = @type, description = @description,
   duration = @duration, price_cents = @price_cents, author_id = @author_id, status = @status WHERE id = @id`,
);
const deleteCourseStmt = db.prepare('DELETE FROM courses WHERE id = ?');
const insertLessonStmt = db.prepare(
  `INSERT INTO lessons (id, course_id, title, description, resource_type, resource, resource_name, position)
   VALUES (@id, @course_id, @title, @description, @resource_type, @resource, @resource_name, @position)`,
);
const getLessonStmt = db.prepare('SELECT * FROM lessons WHERE id = ? AND course_id = ?');
const updateLessonStmt = db.prepare(
  `UPDATE lessons SET title = @title, description = @description, resource_type = @resource_type,
   resource = @resource, resource_name = @resource_name WHERE id = @id`,
);
const setLessonPositionStmt = db.prepare('UPDATE lessons SET position = ? WHERE id = ?');
const deleteLessonStmt = db.prepare('DELETE FROM lessons WHERE id = ? AND course_id = ?');
const maxPositionStmt = db.prepare('SELECT COALESCE(MAX(position), 0) AS maxPos FROM lessons WHERE course_id = ?');
const activeEnrollmentStmt = db.prepare(
  'SELECT * FROM enrollments WHERE user_id = ? AND course_id = ?',
);
const openedLessonsStmt = db.prepare(
  `SELECT p.lesson_id FROM lesson_progress p JOIN lessons l ON l.id = p.lesson_id
   WHERE p.user_id = ? AND l.course_id = ?`,
);
const markOpenedStmt = db.prepare('INSERT OR IGNORE INTO lesson_progress (user_id, lesson_id) VALUES (?, ?)');

// Vídeo/PDF por link: links do Drive (e do YouTube, para vídeo) viram a URL do
// player incorporado — o link como foi colado (/view, watch?v=) não abre num iframe.
function lessonEmbedUrl(row) {
  if (row.resource_type !== 'video' && row.resource_type !== 'pdf') return null;
  try {
    const { provider, ref } = parseVideoLink(row.resource);
    if (row.resource_type === 'pdf' && provider !== 'drive') return null;
    return embedUrlFor(provider, ref);
  } catch {
    return null;
  }
}

const isPdfName = (name) => path.extname(String(name || '')).toLowerCase() === '.pdf';

// Arquivo enviado nunca expõe o caminho: sai pela rota autenticada da aula.
// forStudent: vídeo com player incorporado não expõe o link original (só assistir).
function lessonToApi(row, { withResource = true, forStudent = false } = {}) {
  const lesson = {
    id: row.id,
    title: row.title,
    description: row.description,
    resourceType: row.resource_type,
  };
  if (withResource) {
    const stored = isLessonFile(row.resource);
    lesson.resource = stored ? null : row.resource;
    lesson.resourceName = row.resource_name;
    lesson.embedUrl = lessonEmbedUrl(row);
    lesson.fileUrl = stored ? `/api/courses/${row.course_id}/lessons/${row.id}/file` : null;
    lesson.isPdf = stored && isPdfName(row.resource_name);
    if (forStudent && row.resource_type === 'video' && lesson.embedUrl) lesson.resource = null;
  }
  return lesson;
}

function authorToApi(authorId) {
  if (!authorId) return null;
  return getAuthorStmt.get(authorId) || null;
}

// Endereço das aulas só para quem edita o curso; o resto vê a grade (título,
// descrição, tipo). O aluno recebe os recursos por getCourseContent.
function courseToApi(row, { withLessons = false, withResources = false } = {}) {
  const course = {
    id: row.id,
    title: row.title,
    type: row.type,
    description: row.description,
    duration: row.duration,
    priceCents: row.price_cents,
    author: authorToApi(row.author_id),
    status: row.status,
  };
  if (withLessons) {
    course.lessons = listLessonsStmt.all(row.id).map((lesson) => lessonToApi(lesson, { withResource: withResources }));
  } else {
    course.lessonCount = listLessonsStmt.all(row.id).length;
  }
  return course;
}

// Status: o informado; sem informar, mantém o atual (edição) ou "em edição" (novo curso).
function resolveStatus(input, currentStatus) {
  if (input.status === undefined || input.status === '') return currentStatus || 'em_edicao';
  return oneOf(input.status, COURSE_STATUSES, { code: 'COURSE_STATUS_INVALID' });
}

function normalizeCourseInput(input = {}) {
  const priceCents = toCents(input.priceCents ?? input.price);
  if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > 100_000_000) {
    throw badRequest('COURSE_PRICE_INVALID');
  }
  return {
    title: str(input.title, { code: 'COURSE_FIELDS_REQUIRED', min: 1, max: 160 }),
    type: oneOf(input.type === 'online' ? 'online' : 'gravado', ['gravado', 'online']),
    // Sanitiza antes de validar o tamanho: o editor rico manda HTML, e o
    // limite deve valer sobre o que de fato fica salvo, não sobre marcação
    // que pode ser descartada na sanitização.
    description: str(sanitizeDescriptionHtml(input.description), { code: 'COURSE_FIELDS_REQUIRED', min: 1, max: 4000 }),
    duration: str(input.duration, { code: 'COURSE_FIELDS_REQUIRED', min: 1, max: 80 }),
    price_cents: priceCents,
  };
}

// Resolve o author_id conforme quem está agindo.
// Autor: sempre ele mesmo. Admin: o que vier no input (validado), ou mantém o atual.
function resolveAuthorId(input, actor, currentAuthorId) {
  if (actor?.role === 'author') return actor.id;
  if (input.authorId === undefined) return currentAuthorId ?? null;
  if (!input.authorId) return null;
  if (!getAuthorStmt.get(input.authorId)) throw badRequest('COURSE_AUTHOR_INVALID');
  return input.authorId;
}

function canEditCourse(courseRow, actor) {
  return actor?.role === 'admin' || (actor?.role === 'author' && courseRow.author_id === actor.id);
}

function assertCourseOwnership(courseRow, actor) {
  if (!canEditCourse(courseRow, actor)) throw forbidden('COURSE_FORBIDDEN');
}

// Todos os status aparecem no site; só "liberado" aceita inscrição (enrollmentService).
export function getCourses() {
  return listCoursesStmt.all().map((row) => courseToApi(row));
}

export function listCoursesByAuthor(authorId) {
  return listCoursesByAuthorStmt.all(authorId).map((row) => courseToApi(row));
}

export function getCourse(courseId, viewer = null) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  return courseToApi(row, { withLessons: true, withResources: canEditCourse(row, viewer) });
}

export function createCourse(input, actor) {
  const data = normalizeCourseInput(input);
  const id = crypto.randomUUID();
  insertCourseStmt.run({ id, ...data, author_id: resolveAuthorId(input, actor, null), status: resolveStatus(input, null) });
  return getCourse(id, actor);
}

export function updateCourse(courseId, input, actor) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  assertCourseOwnership(row, actor);
  const data = normalizeCourseInput(input);
  updateCourseStmt.run({ id: courseId, ...data, author_id: resolveAuthorId(input, actor, row.author_id), status: resolveStatus(input, row.status) });
  return getCourse(courseId, actor);
}

export function deleteCourse(courseId, actor) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  assertCourseOwnership(row, actor);
  deleteCourseStmt.run(courseId);
}

// Tipo "file" <=> arquivo enviado; demais tipos <=> link. Evita, por exemplo,
// um "Arquivo local" apontando para um link ou um "Vídeo por link" com upload.
function assertResourceMatchesType(resourceType, resource) {
  if ((resourceType === 'file') !== isLessonFile(resource)) throw badRequest('LESSON_RESOURCE_MISMATCH');
}

export function addLesson(courseId, lesson, actor) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  assertCourseOwnership(row, actor);
  const title = str(lesson.title, { code: 'LESSON_FIELDS_REQUIRED', min: 1, max: 160 });
  const resource = str(lesson.resource, { code: 'LESSON_FIELDS_REQUIRED', min: 1, max: 2000 });
  const resourceType = oneOf(lesson.resourceType || 'link', ['video', 'pdf', 'link', 'file'], { code: 'INVALID_RESOURCE_TYPE' });
  assertResourceMatchesType(resourceType, resource);
  const stored = {
    id: crypto.randomUUID(),
    course_id: courseId,
    title,
    description: optionalStr(lesson.description, { max: 2000 }),
    resource_type: resourceType,
    resource,
    resource_name: optionalStr(lesson.resourceName, { max: 200 }),
    position: maxPositionStmt.get(courseId).maxPos + 1,
  };
  insertLessonStmt.run(stored);
  return lessonToApi(stored);
}

// Edita uma aula. `input.resource` ausente = mantém o recurso atual (desde que
// continue compatível com o tipo escolhido). Trocar um arquivo enviado por outro
// recurso apaga o arquivo antigo do disco.
export function updateLesson(courseId, lessonId, input, actor) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  assertCourseOwnership(row, actor);
  const current = getLessonStmt.get(lessonId, courseId);
  if (!current) throw notFound('LESSON_NOT_FOUND');

  const resourceType = oneOf(input.resourceType || current.resource_type, ['video', 'pdf', 'link', 'file'], { code: 'INVALID_RESOURCE_TYPE' });
  const replacing = input.resource !== undefined;
  const resource = replacing
    ? str(input.resource, { code: 'LESSON_FIELDS_REQUIRED', min: 1, max: 2000 })
    : current.resource;
  assertResourceMatchesType(resourceType, resource);

  const next = {
    id: lessonId,
    title: input.title === undefined ? current.title : str(input.title, { code: 'LESSON_FIELDS_REQUIRED', min: 1, max: 160 }),
    description: input.description === undefined ? current.description : optionalStr(input.description, { max: 2000 }),
    resource_type: resourceType,
    resource,
    resource_name: replacing ? optionalStr(input.resourceName, { max: 200 }) : current.resource_name,
  };
  updateLessonStmt.run(next);
  if (replacing && current.resource !== resource) removeLessonFile(current.resource);
  return lessonToApi({ ...current, ...next });
}

// Move a aula uma posição para cima/baixo e renumera as posições do curso.
export function moveLesson(courseId, lessonId, direction, actor) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  assertCourseOwnership(row, actor);
  const dir = oneOf(direction, ['up', 'down'], { code: 'INVALID_DIRECTION' });
  const lessons = listLessonsStmt.all(courseId);
  const index = lessons.findIndex((lesson) => lesson.id === lessonId);
  if (index < 0) throw notFound('LESSON_NOT_FOUND');
  const target = dir === 'up' ? index - 1 : index + 1;
  if (target >= 0 && target < lessons.length) {
    [lessons[index], lessons[target]] = [lessons[target], lessons[index]];
  }
  transaction(() => lessons.forEach((lesson, position) => setLessonPositionStmt.run(position + 1, lesson.id)));
  return listLessonsStmt.all(courseId).map((lesson) => lessonToApi(lesson));
}

export function deleteLesson(courseId, lessonId, actor) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  assertCourseOwnership(row, actor);
  const lesson = getLessonStmt.get(lessonId, courseId);
  deleteLessonStmt.run(lessonId, courseId);
  if (lesson) removeLessonFile(lesson.resource);
}

// Quem pode ver o conteúdo: admin e o autor do curso (prévia, tudo liberado) ou
// aluno com matrícula ativa. Devolve se a sequência obrigatória se aplica.
function assertContentAccess(courseRow, user) {
  if (!user) throw unauthorized('AUTH_REQUIRED');
  if (canEditCourse(courseRow, user)) return { preview: true };
  const enrollment = activeEnrollmentStmt.get(user.id, courseRow.id);
  if (!enrollment) throw forbidden('ENROLLMENT_NOT_FOUND');
  if (enrollment.status !== 'ativa') {
    const error = forbidden('ENROLLMENT_INACTIVE');
    error.reason = enrollment.status_reason || '';
    throw error;
  }
  return { preview: false };
}

// Aula liberada = primeira do curso ou anterior já aberta pelo aluno.
function lessonsWithProgress(courseId, user, preview) {
  const lessons = listLessonsStmt.all(courseId);
  const opened = preview ? new Set() : new Set(openedLessonsStmt.all(user.id, courseId).map((r) => r.lesson_id));
  return lessons.map((lesson, index) => {
    const unlocked = preview || index === 0 || opened.has(lessons[index - 1].id);
    return { lesson, unlocked, opened: preview || opened.has(lesson.id) };
  });
}

// Turma do aluno no curso, com link/local (só para quem está nela).
function myClass(userId, courseId) {
  const row = getClass(enrollmentOfStmt.get(userId, courseId)?.class_id);
  return row ? classToApi(row, { withLocation: true }) : null;
}

// Conteúdo protegido. Aulas bloqueadas vão sem o endereço do recurso.
export function getCourseContent(courseId, user) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  const { preview } = assertContentAccess(row, user);
  return {
    course: courseToApi(row),
    preview,
    progress: preview ? null : courseProgress(user.id, courseId),
    certificate: preview ? null : certificateFor(user.id, courseId),
    class: preview ? null : myClass(user.id, courseId),
    lessons: lessonsWithProgress(courseId, user, preview).map(({ lesson, unlocked, opened }) => ({
      ...lessonToApi(lesson, { withResource: unlocked, forStudent: !preview }),
      locked: !unlocked,
      opened,
    })),
  };
}

// Registra que o aluno abriu a aula (libera a próxima). Só aulas já liberadas.
export function openLesson(courseId, lessonId, user) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  const { preview } = assertContentAccess(row, user);
  const entry = lessonsWithProgress(courseId, user, preview).find(({ lesson }) => lesson.id === lessonId);
  if (!entry) throw notFound('LESSON_NOT_FOUND');
  if (!entry.unlocked) throw forbidden('LESSON_LOCKED');
  if (!preview) markOpenedStmt.run(user.id, lessonId);
  return lessonToApi(entry.lesson, { forStudent: !preview });
}

// Arquivo da aula para exibição no site. Mesma regra de acesso de openLesson:
// matrícula ativa e aula liberada (ou quem edita o curso).
export function lessonFileFor(courseId, lessonId, user) {
  const row = getCourseStmt.get(courseId);
  if (!row) throw notFound('COURSE_NOT_FOUND');
  const { preview } = assertContentAccess(row, user);
  const entry = lessonsWithProgress(courseId, user, preview).find(({ lesson }) => lesson.id === lessonId);
  if (!entry || !isLessonFile(entry.lesson.resource)) throw notFound('LESSON_NOT_FOUND');
  if (!entry.unlocked) throw forbidden('LESSON_LOCKED');
  return {
    filePath: lessonFilePath(entry.lesson.resource),
    fileName: entry.lesson.resource_name || 'arquivo',
    isPdf: isPdfName(entry.lesson.resource_name),
  };
}
