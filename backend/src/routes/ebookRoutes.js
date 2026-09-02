import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEbook,
  deleteEbook,
  getPublishedEbook,
  listAllEbooks,
  listPublishedEbooks,
  updateEbook,
  consumeDownload,
} from '../services/ebookService.js';
import { requireAdmin } from '../middleware/auth.js';
import { badRequest } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';
import { config } from '../lib/config.js';

const router = Router();
const uploadDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const DOC_EXT = new Set(['.pdf', '.epub']);
const DOC_MIME = new Set(['application/pdf', 'application/epub+zip', 'application/octet-stream']);

function fileFilter(_request, file, callback) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.fieldname === 'cover') {
    return callback(null, IMAGE_MIME.has(file.mimetype));
  }
  if (file.fieldname === 'sample') {
    return callback(null, ext === '.pdf' && file.mimetype === 'application/pdf');
  }
  if (file.fieldname === 'file') {
    return callback(null, DOC_EXT.has(ext) && DOC_MIME.has(file.mimetype));
  }
  return callback(null, false);
}

const upload = multer({
  dest: uploadDirectory,
  limits: { fileSize: config.ebook.maxFileMb * 1024 * 1024, files: 3 },
  fileFilter,
});

const uploadFields = upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'sample', maxCount: 1 },
]);

function handleUpload(request, response, next) {
  uploadFields(request, response, (error) => {
    if (!error) return next();
    next(badRequest(error.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_TYPE_NOT_ALLOWED'));
  });
}

function pickFiles(request) {
  const files = request.files || {};
  return { cover: files.cover?.[0], file: files.file?.[0], sample: files.sample?.[0] };
}

router.get('/', wrap((_request, response) => response.json(listPublishedEbooks())));

router.get('/manage', requireAdmin, wrap((_request, response) => response.json(listAllEbooks())));

router.get('/download/:token', wrap((request, response) => {
  const { absPath, downloadName } = consumeDownload(request.params.token);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');
  response.download(absPath, downloadName);
}));

router.get('/:ebookId', wrap((request, response) => response.json(getPublishedEbook(request.params.ebookId))));

router.post('/', requireAdmin, handleUpload, wrap((request, response) => {
  const ebook = createEbook(request.body, pickFiles(request));
  audit('ebook.create', { request, target: ebook.id, detail: ebook.title });
  response.status(201).json(ebook);
}));

router.patch('/:ebookId', requireAdmin, handleUpload, wrap((request, response) => {
  const ebook = updateEbook(request.params.ebookId, request.body, pickFiles(request));
  audit('ebook.update', { request, target: ebook.id });
  response.json(ebook);
}));

router.delete('/:ebookId', requireAdmin, wrap((request, response) => {
  deleteEbook(request.params.ebookId);
  audit('ebook.delete', { request, target: request.params.ebookId });
  response.status(204).end();
}));

export default router;
