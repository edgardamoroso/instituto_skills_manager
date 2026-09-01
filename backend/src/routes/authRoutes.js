import { Router } from 'express';
import {
  changePassword,
  login,
  logout,
  me,
  register,
  resendVerification,
  verifyEmail,
} from '../services/authService.js';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth.js';
import { rateLimit, consume } from '../middleware/rateLimit.js';
import { config } from '../lib/config.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();

function setSessionCookie(response, token) {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    maxAge: config.sessionTtlDays * 86400 * 1000,
    path: '/',
  });
}

const loginLimiter = rateLimit({ name: 'login-ip', limit: 10, windowMs: 15 * 60 * 1000 });
const registerLimiter = rateLimit({ name: 'register-ip', limit: 5, windowMs: 60 * 60 * 1000 });
const resendLimiter = rateLimit({ name: 'resend-ip', limit: 5, windowMs: 60 * 60 * 1000 });

router.post('/register', registerLimiter, wrap((request, response) => {
  register(request.body);
  audit('auth.register', { request, target: String(request.body?.email || '').toLowerCase() });
  response.status(202).json({ pending: true });
}));

router.post('/verify-email', wrap((request, response) => {
  const { user, session } = verifyEmail(request.body?.token);
  setSessionCookie(response, session.token);
  audit('auth.verify_email', { request, actorId: user.id });
  response.json({ user });
}));

router.post('/resend-verification', resendLimiter, wrap((request, response) => {
  resendVerification(request.body?.email);
  response.status(202).json({ pending: true });
}));

router.post('/login', loginLimiter, wrap((request, response) => {
  const emailAddr = String(request.body?.email || '').trim().toLowerCase();
  if (emailAddr) consume(`login-email:${emailAddr}`, 5, 15 * 60 * 1000);
  try {
    const { user, session } = login(request.body || {});
    setSessionCookie(response, session.token);
    audit('auth.login', { request, actorId: user.id });
    response.json({ user });
  } catch (error) {
    audit('auth.login_failed', { request, target: emailAddr, detail: error.code || 'error' });
    throw error;
  }
}));

router.post('/logout', requireAuth, wrap((request, response) => {
  logout(request.sessionToken);
  response.clearCookie(SESSION_COOKIE, { path: '/' });
  audit('auth.logout', { request });
  response.status(204).end();
}));

router.get('/me', requireAuth, wrap((request, response) => {
  response.json({ user: me(request.user.id) });
}));

router.post('/change-password', requireAuth, wrap((request, response) => {
  changePassword(
    request.user.id,
    request.body?.currentPassword,
    request.body?.newPassword,
    request.sessionToken,
  );
  audit('auth.change_password', { request });
  response.status(204).end();
}));

export default router;
