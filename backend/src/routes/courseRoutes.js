import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { config } from '../lib/config.js';
import {
  addLesson,
  createCourse,
  deleteCourse,
  deleteLesson,
  getCourse,
  getCourseContent,
  getCourses,
  lessonFileFor,
  listCoursesByAuthor,
  moveLesson,
  openLesson,
  updateCourse,
  updateLesson,
} from '../services/courseService.js';
import { requireAuth, requireCourseEditor } from '../middleware/auth.js';
import { badRequest } from '../lib/errors.js';
import { httpUrl, oneOf, str } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { removeLessonFile, saveLessonFile } from '../lib/lessonFiles.js';
import { wrap } from '../lib/http.js';

const router = Router();
const uploadDirectory = config.uploadsDir;

const ALLOWED_UPLOAD_EXT = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.txt', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.csv', '.zip']);
const ALLOWED_UPLOAD_MIME = new Set([
  'application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'text/plain', 'text/csv', 'application/zip',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_UPLOAD_EXT.has(ext) && ALLOWED_UPLOAD_MIME.has(file.mimetype)) {
      return callback(null, true);
    }
    return callback(new Error('UPLOAD_TYPE_NOT_ALLOWED'));
  },
});

function handleUpload(request, response, next) {
  upload.single('file')(request, response, (error) => {
    if (!error) return next();
    const code = error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_TYPE_NOT_ALLOWED';
    next(badRequest(code));
  });
}

router.get('/', wrap((_request, response) => response.json(getCourses())));

router.get('/mine', requireCourseEditor, wrap((request, response) => {
  const courses = request.user.role === 'admin' ? getCourses() : listCoursesByAuthor(request.user.id);
  response.json(courses);
}));

// Visitante vê a grade de aulas sem os endereços; quem edita o curso vê tudo.
router.get('/:courseId', wrap((request, response) => response.json(getCourse(request.params.courseId, request.user))));

router.get('/:courseId/content', requireAuth, wrap((request, response) => {
  response.json(getCourseContent(request.params.courseId, request.user));
}));

router.post('/', requireCourseEditor, wrap((request, response) => {
  const course = createCourse(request.body, request.user);
  audit('course.create', { request, target: course.id, detail: course.title });
  response.status(201).json(course);
}));

router.patch('/:courseId', requireCourseEditor, wrap((request, response) => {
  const course = updateCourse(request.params.courseId, request.body, request.user);
  audit('course.update', { request, target: course.id });
  response.json(course);
}));

router.delete('/:courseId', requireCourseEditor, wrap((request, response) => {
  deleteCourse(request.params.courseId, request.user);
  audit('course.delete', { request, target: request.params.courseId });
  response.status(204).end();
}));

// Recurso da aula vindo do formulário: arquivo enviado ou link.
// Devolve undefined quando nada foi informado (na edição, mantém o atual).
function lessonResourceFrom(request) {
  if (request.file) {
    const resourceName = str(request.file.originalname, { max: 200, min: 1 });
    request.savedLessonResource = saveLessonFile(request.file.path, resourceName);
    return { resource: request.savedLessonResource, resourceName };
  }
  const url = String(request.body.resource || '').trim();
  if (!url) return undefined;
  return { resource: httpUrl(url, { code: 'INVALID_RESOURCE_URL' }), resourceName: '' };
}

// Se a validação falhar depois do upload, o arquivo recém-enviado não fica órfão.
function discardUploadOnError(handler) {
  return (request, response) => {
    try {
      return handler(request, response);
    } catch (error) {
      if (request.file) rmSync(request.file.path, { force: true });
      if (request.savedLessonResource) removeLessonFile(request.savedLessonResource);
      throw error;
    }
  };
}

router.post('/:courseId/lessons', requireCourseEditor, handleUpload, wrap(discardUploadOnError((request, response) => {
  const resourceType = oneOf(request.body.resourceType, ['video', 'pdf', 'link', 'file'], { code: 'INVALID_RESOURCE_TYPE' });
  const source = lessonResourceFrom(request) || { resource: '', resourceName: '' };
  const lesson = addLesson(request.params.courseId, {
    title: request.body.title,
    description: request.body.description || '',
    resourceType,
    ...source,
  }, request.user);
  audit('lesson.create', { request, target: request.params.courseId, detail: lesson.title });
  response.status(201).json(lesson);
})));

router.patch('/:courseId/lessons/:lessonId', requireCourseEditor, handleUpload, wrap(discardUploadOnError((request, response) => {
  const lesson = updateLesson(request.params.courseId, request.params.lessonId, {
    title: request.body.title,
    description: request.body.description,
    resourceType: request.body.resourceType,
    ...(lessonResourceFrom(request) || {}),
  }, request.user);
  audit('lesson.update', { request, target: request.params.lessonId, detail: lesson.title });
  response.json(lesson);
})));

router.post('/:courseId/lessons/:lessonId/move', requireCourseEditor, wrap((request, response) => {
  const lessons = moveLesson(request.params.courseId, request.params.lessonId, request.body?.direction, request.user);
  audit('lesson.move', { request, target: request.params.lessonId, detail: String(request.body?.direction || '') });
  response.json(lessons);
}));

// Arquivo da aula (só para quem tem acesso à aula). PDF abre no navegador;
// ?download=1 (ou outros tipos) força o download.
router.get('/:courseId/lessons/:lessonId/file', requireAuth, wrap((request, response) => {
  const { filePath, fileName, isPdf } = lessonFileFor(request.params.courseId, request.params.lessonId, request.user);
  const inline = isPdf && request.query.download === undefined;
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (inline) {
    response.type('application/pdf');
    response.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    // O leitor de PDF do navegador roda nesta resposta; ela só pode ser embutida pelo próprio site.
    response.setHeader('X-Frame-Options', 'SAMEORIGIN');
    response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
    return response.sendFile(filePath);
  }
  return response.download(filePath, fileName);
}));

// Aluno abriu a aula: registra o progresso e libera a próxima.
router.post('/:courseId/lessons/:lessonId/open', requireAuth, wrap((request, response) => {
  response.json(openLesson(request.params.courseId, request.params.lessonId, request.user));
}));

router.delete('/:courseId/lessons/:lessonId', requireCourseEditor, wrap((request, response) => {
  deleteLesson(request.params.courseId, request.params.lessonId, request.user);
  audit('lesson.delete', { request, target: request.params.lessonId });
  response.status(204).end();
}));

export default router;
