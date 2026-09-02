import { AppError } from '../lib/errors.js';

// Rate limiting em memória (janela fixa por chave). Suficiente para uma
// instância atrás de proxy reverso; o estado zera ao reiniciar.

const buckets = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000).unref();

function hit(key, limit, windowMs) {
  const now = Date.now();
  let entry = buckets.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs };
    buckets.set(key, entry);
  }
  entry.count += 1;
  return { allowed: entry.count <= limit, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
}

// Middleware: limita por IP.
export function rateLimit({ name, limit, windowMs }) {
  return (request, response, next) => {
    const key = `${name}:${request.ip}`;
    const { allowed, retryAfter } = hit(key, limit, windowMs);
    if (!allowed) {
      response.setHeader('Retry-After', String(retryAfter));
      return next(new AppError('RATE_LIMITED', 429));
    }
    next();
  };
}

// Uso manual dentro de um handler (ex.: limitar por e-mail no login).
export function consume(key, limit, windowMs) {
  const { allowed, retryAfter } = hit(key, limit, windowMs);
  if (!allowed) {
    const error = new AppError('RATE_LIMITED', 429);
    error.retryAfter = retryAfter;
    throw error;
  }
}

export function reset(key) {
  buckets.delete(key);
}

// Usado nos testes para isolar cenários de rate limit.
export function resetAll() {
  buckets.clear();
}
