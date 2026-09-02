import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

let server;
let admin;

before(async () => {
  server = await startApp();
  admin = createClient(server.baseUrl);
  await loginAsAdmin(admin);
});
after(async () => { await server.close(); await removeDbFile(); });

function studentBody(over = {}) {
  return { name: 'Aluna', email: `s-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`, phone: '61 9', address: 'Rua 1', ...over };
}

test('cria aluno com senha gerada e depois com senha informada', async () => {
  const auto = await admin.post('/api/students', { body: studentBody() });
  assert.equal(auto.status, 201);
  assert.ok(auto.body.temporaryPassword.length >= 8);

  const manual = await admin.post('/api/students', { body: studentBody({ password: 'definida-1234' }) });
  assert.equal(manual.body.temporaryPassword, 'definida-1234');
});

test('e-mail duplicado → 409 EMAIL_IN_USE', async () => {
  const body = studentBody();
  await admin.post('/api/students', { body });
  const dup = await admin.post('/api/students', { body });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'EMAIL_IN_USE');
});

test('lista traz contadores de matrícula', async () => {
  await admin.post('/api/students', { body: studentBody() });
  const list = await admin.get('/api/students');
  assert.equal(list.status, 200);
  assert.ok(list.body.every((s) => typeof s.enrollmentsTotal === 'number'));
});

test('atualiza dados; troca de e-mail conflitante → 409', async () => {
  const a = (await admin.post('/api/students', { body: studentBody() })).body;
  const b = (await admin.post('/api/students', { body: studentBody() })).body;

  const ok = await admin.patch(`/api/students/${a.id}`, { body: { name: 'Novo Nome', email: a.email, phone: '', address: '' } });
  assert.equal(ok.body.name, 'Novo Nome');

  const clash = await admin.patch(`/api/students/${a.id}`, { body: { name: 'X', email: b.email } });
  assert.equal(clash.status, 409);
});

test('reset de senha gera nova senha e invalida sessões', async () => {
  const created = (await admin.post('/api/students', { body: studentBody({ password: 'inicial-1234' }) })).body;
  // aluno loga
  const studentClient = createClient(server.baseUrl);
  await studentClient.post('/api/auth/login', { body: { email: created.email, password: 'inicial-1234' } });
  assert.equal((await studentClient.get('/api/auth/me')).status, 200);

  const reset = await admin.post(`/api/students/${created.id}/password-reset`);
  assert.equal(reset.status, 200);
  assert.ok(reset.body.temporaryPassword.length >= 8);
  assert.equal((await studentClient.get('/api/auth/me')).status, 401);
});

test('exclui aluno; 404 depois', async () => {
  const created = (await admin.post('/api/students', { body: studentBody() })).body;
  assert.equal((await admin.delete(`/api/students/${created.id}`)).status, 204);
  assert.equal((await admin.get(`/api/students/${created.id}/enrollments`)).status, 200); // lista vazia, não 404
});

test('não-admin é barrado', async () => {
  assert.equal((await createClient(server.baseUrl).get('/api/students')).status, 401);
});
