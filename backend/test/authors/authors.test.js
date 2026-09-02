import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin, tokenFromEmail } from '../helpers/auth.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sentMessages, clearOutbox } from '../../src/lib/mailer.js';

let server;
let admin;

before(async () => {
  server = await startApp();
  admin = createClient(server.baseUrl);
  await loginAsAdmin(admin);
});

after(async () => {
  await server.close();
  await removeDbFile();
});

beforeEach(() => clearOutbox());

async function createAuthor(overrides = {}) {
  const body = { name: 'Autora Teste', email: `a${Date.now()}${Math.random()}@ex.com`, bio: 'bio', ...overrides };
  const response = await admin.post('/api/authors', { body });
  return { response, body };
}

test('admin cria autor: 201, pendingInvite e e-mail de convite na outbox', async () => {
  // Given um admin autenticado
  // When cria um autor
  const { response, body } = await createAuthor();

  // Then o autor volta pendente e recebeu o convite
  assert.equal(response.status, 201);
  assert.equal(response.body.pendingInvite, true);
  assert.equal(response.body.active, true);
  assert.equal(response.body.coursesCount, 0);
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, body.email);
  assert.match(sentMessages[0].text, /definir-senha\.html\?token=/);
});

test('não-admin não cria autor', async () => {
  // Given um cliente sem sessão
  const anon = createClient(server.baseUrl);

  // When tenta criar autor
  const response = await anon.post('/api/authors', { body: { name: 'X', email: 'x@x.com' } });

  // Then é barrado
  assert.equal(response.status, 401);
});

test('e-mail já usado por outro usuário → 409 AUTHOR_EMAIL_IN_USE', async () => {
  // Given o e-mail do admin já existe
  // When criamos um autor com esse e-mail
  const response = await admin.post('/api/authors', { body: { name: 'Dup', email: 'admin@skills.local' } });

  // Then conflito
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'AUTHOR_EMAIL_IN_USE');
});

test('fluxo de convite: autor define a senha pelo token e fica logado', async () => {
  // Given um autor recém-criado
  const { body } = await createAuthor();
  const token = tokenFromEmail(sentMessages[0]);
  assert.ok(token);

  // When define a senha
  const authorClient = createClient(server.baseUrl);
  const set = await authorClient.post('/api/auth/set-password', { body: { token, password: 'senha-forte-1' } });

  // Then recebe sessão e autentica
  assert.equal(set.status, 200);
  assert.equal(set.body.user.email, body.email);
  assert.equal(set.body.user.role, 'author');
  const me = await authorClient.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'author');
});

test('token de definição de senha inválido → 400 PASSWORD_SET_INVALID', async () => {
  const client = createClient(server.baseUrl);
  const response = await client.post('/api/auth/set-password', { body: { token: 'nao-existe', password: 'senha-forte-1' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'PASSWORD_SET_INVALID');
});

test('desativar autor derruba a sessão e bloqueia novo login', async () => {
  // Given um autor com senha definida e logado
  const { response: created, body } = await createAuthor();
  const token = tokenFromEmail(sentMessages[0]);
  const authorClient = createClient(server.baseUrl);
  await authorClient.post('/api/auth/set-password', { body: { token, password: 'senha-forte-1' } });
  assert.equal((await authorClient.get('/api/auth/me')).status, 200);

  // When o admin desativa o autor
  const patch = await admin.patch(`/api/authors/${created.body.id}`, { body: { active: false } });
  assert.equal(patch.status, 200);
  assert.equal(patch.body.active, false);

  // Then a sessão anterior deixa de valer e o login recusa
  assert.equal((await authorClient.get('/api/auth/me')).status, 401);
  const login = await authorClient.post('/api/auth/login', { body: { email: body.email, password: 'senha-forte-1' } });
  assert.equal(login.status, 401);
  assert.equal(login.body.error, 'ACCOUNT_DISABLED');
});

test('reinvite gera novo token e invalida o anterior', async () => {
  // Given um autor criado
  const { response: created } = await createAuthor();
  const firstToken = tokenFromEmail(sentMessages[0]);
  clearOutbox();

  // When o admin reenvia o convite
  const reinvite = await admin.post(`/api/authors/${created.body.id}/reinvite`);
  assert.equal(reinvite.status, 204);
  const secondToken = tokenFromEmail(sentMessages[0]);

  // Then o token novo funciona e o antigo não
  assert.notEqual(firstToken, secondToken);
  const withOld = await createClient(server.baseUrl).post('/api/auth/set-password', { body: { token: firstToken, password: 'senha-forte-1' } });
  assert.equal(withOld.status, 400);
  const withNew = await createClient(server.baseUrl).post('/api/auth/set-password', { body: { token: secondToken, password: 'senha-forte-1' } });
  assert.equal(withNew.status, 200);
});

test('DELETE de autor sem cursos → 204; listagem reflete', async () => {
  const { response: created } = await createAuthor();
  const del = await admin.delete(`/api/authors/${created.body.id}`);
  assert.equal(del.status, 204);
  const list = await admin.get('/api/authors');
  assert.equal(list.body.some((a) => a.id === created.body.id), false);
});
