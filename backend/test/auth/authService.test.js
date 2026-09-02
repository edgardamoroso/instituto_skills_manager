import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { tokenFromEmail } from '../helpers/auth.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sentMessages, clearOutbox } from '../../src/lib/mailer.js';
import { resetAll } from '../../src/middleware/rateLimit.js';

let server;

before(async () => { server = await startApp(); });
after(async () => { await server.close(); await removeDbFile(); });
beforeEach(() => { clearOutbox(); resetAll(); });

function client() {
  return createClient(server.baseUrl);
}

async function registerAndVerify(overrides = {}) {
  const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`;
  const c = client();
  const reg = await c.post('/api/auth/register', { body: { name: 'Aluno', email, password: 'senha-forte-1', ...overrides } });
  const token = tokenFromEmail(sentMessages.at(-1));
  return { c, email, reg, token };
}

test('register: cria pendente e envia verificação', async () => {
  const { reg } = await registerAndVerify();
  assert.equal(reg.status, 202);
  assert.equal(reg.body.pending, true);
  assert.match(sentMessages.at(-1).text, /verificar-email\.html\?token=/);
});

test('register com senha curta → 400 PASSWORD_TOO_SHORT', async () => {
  const c = client();
  const response = await c.post('/api/auth/register', { body: { name: 'X', email: 'x@y.com', password: 'curta' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'PASSWORD_TOO_SHORT');
});

test('register com e-mail já usado responde 202 (não revela) e avisa o dono', async () => {
  const { email } = await registerAndVerify();
  clearOutbox();
  const again = await client().post('/api/auth/register', { body: { name: 'Outro', email, password: 'outra-senha-1' } });
  assert.equal(again.status, 202);
  assert.match(sentMessages.at(-1).text, /já está cadastrado/i);
});

test('verify-email: token válido cria sessão; inválido → 400', async () => {
  const { c, token } = await registerAndVerify();
  const ok = await c.post('/api/auth/verify-email', { body: { token } });
  assert.equal(ok.status, 200);
  assert.equal((await c.get('/api/auth/me')).status, 200);

  const bad = await client().post('/api/auth/verify-email', { body: { token: 'xxx' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'VERIFICATION_INVALID');
});

test('login: credenciais erradas, e-mail não verificado, sucesso', async () => {
  const { c, email, token } = await registerAndVerify();

  // não verificado ainda
  const notVerified = await client().post('/api/auth/login', { body: { email, password: 'senha-forte-1' } });
  assert.equal(notVerified.status, 401);
  assert.equal(notVerified.body.error, 'EMAIL_NOT_VERIFIED');

  await c.post('/api/auth/verify-email', { body: { token } });

  // senha errada
  const wrong = await client().post('/api/auth/login', { body: { email, password: 'errada' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error, 'INVALID_CREDENTIALS');

  // e-mail inexistente (caminho do DUMMY_HASH)
  const ghost = await client().post('/api/auth/login', { body: { email: 'nao@existe.com', password: 'qualquer' } });
  assert.equal(ghost.status, 401);

  // sucesso
  const ok = await client().post('/api/auth/login', { body: { email, password: 'senha-forte-1' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.role, 'student');
});

test('change-password: valida atual, tamanho e diferença; encerra outras sessões', async () => {
  const { c, email, token } = await registerAndVerify();
  await c.post('/api/auth/verify-email', { body: { token } });

  // uma segunda sessão do mesmo usuário
  const other = client();
  await other.post('/api/auth/login', { body: { email, password: 'senha-forte-1' } });

  assert.equal((await c.post('/api/auth/change-password', { body: { currentPassword: 'errada', newPassword: 'nova-senha-1' } })).status, 400);
  assert.equal((await c.post('/api/auth/change-password', { body: { currentPassword: 'senha-forte-1', newPassword: 'curta' } })).status, 400);
  assert.equal((await c.post('/api/auth/change-password', { body: { currentPassword: 'senha-forte-1', newPassword: 'senha-forte-1' } })).status, 400);

  const ok = await c.post('/api/auth/change-password', { body: { currentPassword: 'senha-forte-1', newPassword: 'nova-senha-9' } });
  assert.equal(ok.status, 204);

  // a outra sessão caiu
  assert.equal((await other.get('/api/auth/me')).status, 401);
  // a sessão atual segue
  assert.equal((await c.get('/api/auth/me')).status, 200);
});

test('logout encerra a sessão', async () => {
  const { c, token } = await registerAndVerify();
  await c.post('/api/auth/verify-email', { body: { token } });
  assert.equal((await c.post('/api/auth/logout')).status, 204);
  assert.equal((await c.get('/api/auth/me')).status, 401);
});

test('resend-verification é sempre 202', async () => {
  const { email } = await registerAndVerify();
  assert.equal((await client().post('/api/auth/resend-verification', { body: { email } })).status, 202);
  assert.equal((await client().post('/api/auth/resend-verification', { body: { email: 'nada@nada.com' } })).status, 202);
});
