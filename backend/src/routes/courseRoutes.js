import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addLesson,
  createCourse,
  deleteCourse,
  deleteLesson,
  getCourse,
  getCourseContent,
  getCourses,
  updateCourse,
} from '../services/courseService.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { badRequest } from '../lib/errors.js';
import { httpUrl, oneOf, str } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();
const uploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

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

router.get('/:courseId', wrap((request, response) => response.json(getCourse(request.params.courseId))));

router.get('/:courseId/content', requireAuth, wrap((request, response) => {
  response.json(getCourseContent(request.params.courseId, request.user));
}));

router.post('/', requireAdmin, wrap((request, response) => {
  const course = createCourse(request.body);
  audit('course.create', { request, target: course.id, detail: course.title });
  response.status(201).json(course);
}));

router.patch('/:courseId', requireAdmin, wrap((request, response) => {
  const course = updateCourse(request.params.courseId, request.body);
  audit('course.update', { request, target: course.id });
  response.json(course);
}));

router.delete('/:courseId', requireAdmin, wrap((request, response) => {
  deleteCourse(request.params.courseId);
  audit('course.delete', { request, target: request.params.courseId });
  response.status(204).end();
}));

router.post('/:courseId/lessons', requireAdmin, handleUpload, wrap((request, response) => {
  const resourceType = oneOf(request.body.resourceType, ['video', 'pdf', 'link', 'file'], { code: 'INVALID_RESOURCE_TYPE' });
  let resource;
  let resourceName = '';
  if (request.file) {
    resource = `/uploads/${path.basename(request.file.filename)}`;
    resourceName = str(request.file.originalname, { max: 200, min: 1 });
  } else {
    resource = httpUrl(request.body.resource, { code: 'INVALID_RESOURCE_URL' });
  }
  const lesson = addLesson(request.params.courseId, {
    title: request.body.title,
    description: request.body.description || '',
    resourceType,
    resource,
    resourceName,
  });
  audit('lesson.create', { request, target: request.params.courseId, detail: lesson.title });
  response.status(201).json(lesson);
}));

router.delete('/:courseId/lessons/:lessonId', requireAdmin, wrap((request, response) => {
  deleteLesson(request.params.courseId, request.params.lessonId);
  audit('lesson.delete', { request, target: request.params.lessonId });
  response.status(204).end();
}));

export default router;
