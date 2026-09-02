import { Router } from 'express';
import {
  createAuthor,
  deleteAuthor,
  listAuthors,
  reinviteAuthor,
  updateAuthor,
} from '../services/authorService.js';
import { requireAdmin } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();

router.get('/', requireAdmin, wrap((_request, response) => response.json(listAuthors())));

router.post('/', requireAdmin, wrap((request, response) => {
  const author = createAuthor(request.body || {});
  audit('author.create', { request, target: author.id, detail: author.email });
  response.status(201).json(author);
}));

router.patch('/:authorId', requireAdmin, wrap((request, response) => {
  const author = updateAuthor(request.params.authorId, request.body || {});
  const detail = request.body?.active === undefined ? '' : `active=${author.active}`;
  audit('author.update', { request, target: author.id, detail });
  response.json(author);
}));

router.post('/:authorId/reinvite', requireAdmin, wrap((request, response) => {
  reinviteAuthor(request.params.authorId);
  audit('author.reinvite', { request, target: request.params.authorId });
  response.status(204).end();
}));

router.delete('/:authorId', requireAdmin, wrap((request, response) => {
  deleteAuthor(request.params.authorId);
  audit('author.delete', { request, target: request.params.authorId });
  response.status(204).end();
}));

export default router;
