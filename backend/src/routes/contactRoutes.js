import { Router } from 'express';
import { contactConfig, submitContact } from '../services/contactService.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();
const contactLimiter = rateLimit({ name: 'contact-ip', limit: 5, windowMs: 60 * 60 * 1000 });

router.get('/config', (_request, response) => response.json(contactConfig()));

router.post('/', contactLimiter, wrap(async (request, response) => {
  await submitContact(request.body || {});
  audit('contact.submit', { request, detail: String(request.body?.email || '') });
  response.status(204).end();
}));

export default router;
