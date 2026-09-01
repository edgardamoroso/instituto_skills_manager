import { config } from '../lib/config.js';
import { forbidden } from '../lib/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function allowedHosts(request) {
  const hosts = new Set();
  try {
    hosts.add(new URL(config.publicUrl).host);
  } catch {
    /* ignora publicUrl inválido */
  }
  if (request.headers.host) hosts.add(request.headers.host);
  return hosts;
}

// Defesa em profundidade contra CSRF: mutações precisam vir da própria origem.
export function sameOrigin(request, response, next) {
  if (SAFE_METHODS.has(request.method)) return next();

  const origin = request.headers.origin;
  const referer = request.headers.referer;
  const source = origin || referer;
  if (!source) return next(forbidden('ORIGIN_REQUIRED'));

  let host;
  try {
    host = new URL(source).host;
  } catch {
    return next(forbidden('ORIGIN_INVALID'));
  }
  if (!allowedHosts(request).has(host)) return next(forbidden('ORIGIN_MISMATCH'));
  next();
}
