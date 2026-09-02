import express from 'express';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, assertProductionConfig } from './lib/config.js';
import { attachUser } from './middleware/auth.js';
import { securityHeaders, forceHttps } from './middleware/securityHeaders.js';
import { sameOrigin } from './middleware/sameOrigin.js';
import { rateLimit } from './middleware/rateLimit.js';
import { errorHandler } from './lib/http.js';
import authRoutes from './routes/authRoutes.js';
import authorRoutes from './routes/authorRoutes.js';
import ebookRoutes from './routes/ebookRoutes.js';
import ebookOrderRoutes from './routes/ebookOrderRoutes.js';
import courseRoutes from './routes/courseRoutes.js';
import studentRoutes from './routes/studentRoutes.js';
import enrollmentRoutes from './routes/enrollmentRoutes.js';
import overviewRoutes from './routes/overviewRoutes.js';

assertProductionConfig();

const backendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteDirectory = path.resolve(backendDirectory, '..');
const uploadsDirectory = config.uploadsDir;

await mkdir(uploadsDirectory, { recursive: true });

// Estáticos: apenas o que compõe o site — nunca o diretório backend/ nem dotfiles.
function isAllowedStatic(p) {
  if (p === '/' || p === '/favicon.ico' || p === '/styles.css') return true;
  if (p.startsWith('/assets/') || p.startsWith('/js/')) return true;
  return /^\/[a-z0-9-]+\.html$/.test(p);
}

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy);

app.use(forceHttps);
app.use(securityHeaders);
app.use('/api', express.json({ limit: '100kb' }));
app.use(attachUser);

app.get('/health', (_request, response) => response.json({ status: 'ok' }));

// Uploads: nunca renderizar no navegador; forçar download.
app.use('/uploads', (request, response, next) => {
  response.setHeader('Content-Disposition', 'attachment');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'none'");
  next();
}, express.static(uploadsDirectory, { index: false, dotfiles: 'deny', setHeaders: (res) => res.setHeader('Cache-Control', 'private, max-age=0') }));

// API
app.use('/api', rateLimit({ name: 'api-ip', limit: 300, windowMs: 60 * 1000 }));
app.use('/api', sameOrigin);
app.use('/api/auth', authRoutes);
app.use('/api/authors', authorRoutes);
app.use('/api/ebooks', ebookRoutes);
app.use('/api/ebook-orders', ebookOrderRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api', (_request, response) => response.status(404).json({ error: 'NOT_FOUND' }));

app.use((request, response, next) => {
  if (isAllowedStatic(request.path)) return next();
  return response.status(404).send('Not found');
});
app.use(express.static(siteDirectory, { dotfiles: 'ignore', index: 'index.html', extensions: [] }));

app.use(errorHandler);
