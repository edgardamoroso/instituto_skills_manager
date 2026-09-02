import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { summarizePayments, paymentStatus } from '../../src/services/paymentService.js';

let server;
let admin;

before(async () => {
  server = await startApp();
  admin = createClient(server.baseUrl);
  await loginAsAdmin(admin);
});
after(async () => { await server.close(); await removeDbFile(); });

async function makeStudent() {
  const body = { name: 'Aluno', email: `e-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`, password: 'aluno-1234' };
  const created = (await admin.post('/api/students', { body })).body;
  return { ...created, password: 'aluno-1234' };
}

const COURSE_ID = 'gestao-equipes-resultados'; // do seed

test('paymentStatus: paga / atrasada / pendente', () => {
  assert.equal(paymentStatus({ paid_at: '2026-01-01' }, '2026-06-01'), 'paga');
  assert.equal(paymentStatus({ paid_at: null, due_date: '2026-01-01' }, '2026-06-01'), 'atrasada');
  assert.equal(paymentStatus({ paid_at: null, due_date: '2026-12-01' }, '2026-06-01'), 'pendente');
});

test('summarizePayments agrega valores e marca inadimplência', () => {
  const today = '2026-06-01';
  const rows = [
    { amount_cents: 1000, paid_at: '2026-05-01', due_date: '2026-05-01' },
    { amount_cents: 1000, paid_at: null, due_date: '2026-01-01' }, // atrasada
    { amount_cents: 1000, paid_at: null, due_date: '2026-12-01' }, // pendente
  ];
  const summary = summarizePayments(rows, today);
  assert.equal(summary.total, 3);
  assert.equal(summary.paidCents, 1000);
  assert.equal(summary.overdueCents, 1000);
  assert.equal(summary.outstandingCents, 2000);
  assert.equal(summary.delinquent, true);
});

test('createEnrollment sem plano e com plano de parcelas', async () => {
  const student = await makeStudent();

  const noPlan = await admin.post('/api/enrollments', { body: { userId: student.id, courseId: COURSE_ID } });
  assert.equal(noPlan.status, 201);
  assert.equal(noPlan.body.payment.total, 0);

  const other = await makeStudent();
  const withPlan = await admin.post('/api/enrollments', {
    body: { userId: other.id, courseId: COURSE_ID, installmentsCount: 3, installmentValueCents: 5000, firstDueDate: '2026-01-10' },
  });
  assert.equal(withPlan.status, 201);
  assert.equal(withPlan.body.payment.total, 3);
  assert.equal(withPlan.body.payment.plannedCents, 15000);
});

test('createEnrollment: aluno/curso inexistente e duplicada', async () => {
  const student = await makeStudent();
  assert.equal((await admin.post('/api/enrollments', { body: { userId: 'nao', courseId: COURSE_ID } })).status, 404);
  assert.equal((await admin.post('/api/enrollments', { body: { userId: student.id, courseId: 'nao' } })).status, 404);

  await admin.post('/api/enrollments', { body: { userId: student.id, courseId: COURSE_ID } });
  const dup = await admin.post('/api/enrollments', { body: { userId: student.id, courseId: COURSE_ID } });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, 'ALREADY_ENROLLED');
});

test('requestEnrollment pelo aluno cria matrícula inativa e é idempotente', async () => {
  const student = await makeStudent();
  const sc = createClient(server.baseUrl);
  await sc.post('/api/auth/login', { body: { email: student.email, password: student.password } });

  const first = await sc.post('/api/enrollments/request', { body: { courseId: COURSE_ID } });
  assert.equal(first.status, 201);
  assert.equal(first.body.status, 'inativa');

  const second = await sc.post('/api/enrollments/request', { body: { courseId: COURSE_ID } });
  assert.equal(second.body.id, first.body.id);
});

test('regenera plano, muda status e paga parcela', async () => {
  const student = await makeStudent();
  const enrollment = (await admin.post('/api/enrollments', { body: { userId: student.id, courseId: COURSE_ID } })).body;

  const planned = await admin.put(`/api/enrollments/${enrollment.id}/plan`, {
    body: { installmentsCount: 2, installmentValueCents: 8000, firstDueDate: '2026-02-01' },
  });
  assert.equal(planned.body.payment.total, 2);

  const payments = await admin.get(`/api/enrollments/${enrollment.id}/payments`);
  const paid = await admin.patch(`/api/enrollments/${enrollment.id}/payments/${payments.body[0].id}`, { body: { paid: true } });
  assert.equal(paid.body.status, 'paga');

  const inactive = await admin.patch(`/api/enrollments/${enrollment.id}`, { body: { status: 'inativa', statusReason: 'teste' } });
  assert.equal(inactive.body.status, 'inativa');

  assert.equal((await admin.delete(`/api/enrollments/${enrollment.id}`)).status, 204);
});

test('aluno vê só as próprias matrículas em /mine', async () => {
  const student = await makeStudent();
  await admin.post('/api/enrollments', { body: { userId: student.id, courseId: COURSE_ID } });
  const sc = createClient(server.baseUrl);
  await sc.post('/api/auth/login', { body: { email: student.email, password: student.password } });
  const mine = await sc.get('/api/enrollments/mine');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.every((e) => e.courseId === COURSE_ID), true);
});

test('content protegido: sem matrícula ativa → 403; com admin → ok', async () => {
  const student = await makeStudent();
  const sc = createClient(server.baseUrl);
  await sc.post('/api/auth/login', { body: { email: student.email, password: student.password } });
  const blocked = await sc.get(`/api/courses/${COURSE_ID}/content`);
  assert.equal(blocked.status, 403);

  const ok = await admin.get(`/api/courses/${COURSE_ID}/content`);
  assert.equal(ok.status, 200);
  assert.ok(Array.isArray(ok.body.lessons));
});
