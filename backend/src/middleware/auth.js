import { db } from '../db/index.js';
import { config } from '../lib/config.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export const SESSION_COOKIE = config.cookieName;

export function parseCookies(header = '') {
  return header.split(';').reduce((acc, part) => {
    const index = part.indexOf('=');
    if (index === -1) return acc;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

const findSession = db.prepare(
  `SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role
   FROM sessions s JOIN users u ON u.id = s.user_id
   WHERE s.token = ?`,
);
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');

export function attachUser(request, _response, next) {
  const cookies = parseCookies(request.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  request.user = null;
  request.sessionToken = null;
  if (token) {
    const session = findSession.get(token);
    if (session) {
      if (Date.parse(session.expires_at) < Date.now()) {
        deleteSession.run(token);
      } else {
        request.user = { id: session.id, name: session.name, email: session.email, role: session.role };
        request.sessionToken = token;
      }
    }
  }
  next();
}

export function requireAuth(request, _response, next) {
  if (!request.user) return next(unauthorized());
  next();
}

export function requireAdmin(request, _response, next) {
  if (!request.user) return next(unauthorized());
  if (request.user.role !== 'admin') return next(forbidden());
  next();
}
