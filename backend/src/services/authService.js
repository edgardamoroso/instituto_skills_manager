import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { config } from '../lib/config.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { badRequest, unauthorized } from '../lib/errors.js';
import { email as validateEmail, str } from '../lib/validate.js';
import { sendMail } from '../lib/mailer.js';

// Hash "descartável" usado para igualar o tempo de resposta quando o e-mail não existe.
const DUMMY_HASH = hashPassword('senha-inexistente-para-timing');

const getUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
const getUserById = db.prepare(
  'SELECT id, name, email, phone, address, role, email_verified, created_at FROM users WHERE id = ?',
);
const insertUser = db.prepare(
  `INSERT INTO users (id, name, email, password_hash, phone, address, role, email_verified)
   VALUES (@id, @name, @email, @password_hash, @phone, @address, 'student', 0)`,
);
const insertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)');
const deleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
const insertEmailToken = db.prepare(
  'INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)',
);
const getEmailToken = db.prepare("SELECT * FROM email_tokens WHERE token = ? AND purpose = 'verify'");
const deleteEmailTokensForUser = db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'verify'");
const getPasswordSetToken = db.prepare("SELECT * FROM email_tokens WHERE token = ? AND purpose = 'set_password'");
const deletePasswordSetTokensForUser = db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = 'set_password'");
const markVerified = db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?');
const getUserWithHash = db.prepare('SELECT id, password_hash FROM users WHERE id = ?');
const setPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
const deleteOtherSessions = db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?');

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 86400000).toISOString();
  insertSession.run(token, userId, expiresAt);
  return { token, expiresAt };
}

function issueVerification(user) {
  deleteEmailTokensForUser.run(user.id);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  insertEmailToken.run(token, user.id, 'verify', expiresAt);
  const link = `${config.publicUrl}/verificar-email.html?token=${token}`;
  sendMail({
    to: user.email,
    subject: 'Confirme seu e-mail — Instituto Skills Manager',
    text: `Olá, ${user.name}.\n\nConfirme seu e-mail para ativar sua conta:\n${link}\n\nO link expira em 24 horas. Se você não criou esta conta, ignore este e-mail.`,
  });
}

// Convite para o autor definir a própria senha (reaproveita email_tokens).
export function issuePasswordSet(user) {
  deletePasswordSetTokensForUser.run(user.id);
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
  insertEmailToken.run(token, user.id, 'set_password', expiresAt);
  const link = `${config.publicUrl}/definir-senha.html?token=${token}`;
  sendMail({
    to: user.email,
    subject: 'Defina sua senha — Instituto Skills Manager',
    text: `Olá, ${user.name}.\n\nVocê foi cadastrado como autor. Defina sua senha de acesso:\n${link}\n\nO link expira em 72 horas.`,
  });
}

export function completePasswordSet(token, newPassword) {
  const row = getPasswordSetToken.get(String(token || ''));
  if (!row || Date.parse(row.expires_at) < Date.now()) throw badRequest('PASSWORD_SET_INVALID');
  const password = String(newPassword ?? '');
  if (password.length < 8 || password.length > 200) throw badRequest('PASSWORD_TOO_SHORT');
  setPassword.run(hashPassword(password), row.user_id);
  markVerified.run(row.user_id);
  deletePasswordSetTokensForUser.run(row.user_id);
  const dbUser = getUserById.get(row.user_id);
  const session = createSession(dbUser.id);
  return { user: publicUser(dbUser), session };
}

export function register(input) {
  const name = str(input?.name, { code: 'AUTH_FIELDS_REQUIRED', min: 1, max: 120 });
  const emailAddr = validateEmail(input?.email, { code: 'AUTH_FIELDS_REQUIRED' });
  const password = String(input?.password ?? '');
  const phone = str(input?.phone ?? '', { max: 40, min: 0 });
  const address = str(input?.address ?? '', { max: 200, min: 0 });
  if (!password) throw badRequest('AUTH_FIELDS_REQUIRED');
  if (password.length < 8 || password.length > 200) throw badRequest('PASSWORD_TOO_SHORT');

  const existing = getUserByEmail.get(emailAddr);
  if (existing) {
    // Não revela que a conta existe: avisa o dono e responde como sucesso.
    sendMail({
      to: emailAddr,
      subject: 'Tentativa de cadastro — Instituto Skills Manager',
      text: 'Alguém tentou criar uma conta com este e-mail, que já está cadastrado. Se foi você, faça login normalmente ou use "Esqueci minha senha". Caso contrário, ignore este aviso.',
    });
    return { pending: true };
  }

  const user = {
    id: crypto.randomUUID(),
    name,
    email: emailAddr,
    password_hash: hashPassword(password),
    phone,
    address,
  };
  insertUser.run(user);
  issueVerification(user);
  return { pending: true };
}

export function verifyEmail(token) {
  const cleanToken = String(token || '');
  const row = cleanToken && getEmailToken.get(cleanToken);
  if (!row || Date.parse(row.expires_at) < Date.now()) throw badRequest('VERIFICATION_INVALID');
  markVerified.run(row.user_id);
  deleteEmailTokensForUser.run(row.user_id);
  const dbUser = getUserById.get(row.user_id);
  const session = createSession(dbUser.id);
  return { user: publicUser(dbUser), session };
}

export function resendVerification(emailInput) {
  const emailAddr = String(emailInput || '').trim().toLowerCase();
  const row = getUserByEmail.get(emailAddr);
  if (row && !row.email_verified) issueVerification(row);
  return { pending: true }; // resposta genérica sempre
}

export function login({ email: emailInput, password }) {
  const emailAddr = String(emailInput || '').trim().toLowerCase();
  const row = getUserByEmail.get(emailAddr);
  const ok = row
    ? verifyPassword(password, row.password_hash)
    : (verifyPassword(password, DUMMY_HASH), false);
  if (!ok) throw unauthorized('INVALID_CREDENTIALS');
  if (row.active === 0) throw unauthorized('ACCOUNT_DISABLED');
  if (!row.email_verified) throw unauthorized('EMAIL_NOT_VERIFIED');
  const session = createSession(row.id);
  return { user: publicUser(row), session };
}

export function changePassword(userId, currentPassword, newPassword, keepToken) {
  const row = getUserWithHash.get(userId);
  if (!row) throw unauthorized('AUTH_REQUIRED');
  if (!verifyPassword(currentPassword, row.password_hash)) throw badRequest('CURRENT_PASSWORD_INVALID');
  const next = String(newPassword ?? '');
  if (next.length < 8 || next.length > 200) throw badRequest('PASSWORD_TOO_SHORT');
  if (verifyPassword(next, row.password_hash)) throw badRequest('PASSWORD_UNCHANGED');
  setPassword.run(hashPassword(next), userId);
  deleteOtherSessions.run(userId, keepToken || '');
}

export function logout(token) {
  if (token) deleteSession.run(token);
}

export function me(userId) {
  return getUserById.get(userId) || null;
}
