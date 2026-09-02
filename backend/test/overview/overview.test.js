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

test('overview agrega contadores, totais e cursos', async () => {
  // Given um aluno com matrícula parcelada, uma parcela paga e uma vencida
  const student = (await admin.post('/api/students', { body: { name: 'A', email: `ov-${Date.now()}@ex.com`, password: 'aluno-1234' } })).body;
  const enrollment = (await admin.post('/api/enrollments', {
    body: { userId: student.id, courseId: 'gestao-equipes-resultados', installmentsCount: 2, installmentValueCents: 5000, firstDueDate: '2020-01-01' },
  })).body;
  const payments = (await admin.get(`/api/enrollments/${enrollment.id}/payments`)).body;
  await admin.patch(`/api/enrollments/${enrollment.id}/payments/${payments[0].id}`, { body: { paid: true } });

  // When consultamos a visão geral
  const overview = await admin.get('/api/overview');

  // Then os agregados refletem o cenário
  assert.equal(overview.status, 200);
  assert.equal(overview.body.counts.courses, 4);
  assert.ok(overview.body.counts.students >= 1);
  assert.equal(overview.body.totals.plannedCents >= 10000, true);
  assert.equal(overview.body.totals.paidCents >= 5000, true);
  assert.equal(overview.body.totals.overdueCents >= 5000, true); // segunda parcela venceu em 2020
  const course = overview.body.courses.find((c) => c.id === 'gestao-equipes-resultados');
  assert.ok(course.enrollments >= 1);
});

test('overview exige admin', async () => {
  assert.equal((await createClient(server.baseUrl).get('/api/overview')).status, 401);
});
