import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderCertificatePdf, formatIssuedDate } from '../../src/lib/certificatePdf.js';

let server;
let admin;
let anon;

before(async () => {
  server = await startApp();
  admin = createClient(server.baseUrl);
  anon = createClient(server.baseUrl);
  await loginAsAdmin(admin);
});

after(async () => {
  await server.close();
  await removeDbFile();
});

// Curso com duas aulas e um aluno matriculado (logado).
async function setup({ name = 'Maria da Conceição' } = {}) {
  const course = (await admin.post('/api/courses', {
    body: { title: `Explorando a IA ${Math.random()}`, type: 'gravado', description: 'desc', duration: '20 horas', price: '100' },
  })).body;
  const lessons = [];
  for (const title of ['Aula 1', 'Aula 2']) {
    lessons.push((await admin.post(`/api/courses/${course.id}/lessons`, {
      body: { title, resourceType: 'link', resource: 'https://exemplo.com' },
    })).body);
  }
  const email = `c-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`;
  const student = (await admin.post('/api/students', { body: { name, email, password: 'aluno-1234' } })).body;
  const enrollment = (await admin.post('/api/enrollments', { body: { userId: student.id, courseId: course.id } })).body;
  const client = createClient(server.baseUrl);
  await client.post('/api/auth/login', { body: { email, password: 'aluno-1234' } });
  return { course, lessons, student, enrollment, client };
}

// Em sequência: cada aula só libera depois da anterior.
async function openAll(client, course, lessons) {
  for (const lesson of lessons) await client.post(`/api/courses/${course.id}/lessons/${lesson.id}/open`);
}

test('certificado só sai depois de abrir todas as aulas', async () => {
  const { course, lessons, client } = await setup();

  // Given só a primeira aula aberta
  await client.post(`/api/courses/${course.id}/lessons/${lessons[0].id}/open`);
  let content = (await client.get(`/api/courses/${course.id}/content`)).body;
  assert.deepEqual(content.progress, { total: 2, opened: 1, completed: false });
  assert.equal(content.certificate, null);

  // Then pedir o certificado é recusado
  const early = await client.post('/api/certificates', { body: { courseId: course.id } });
  assert.equal(early.status, 403);
  assert.equal(early.body.error, 'COURSE_NOT_COMPLETED');

  // When abre a segunda (última) aula
  await client.post(`/api/courses/${course.id}/lessons/${lessons[1].id}/open`);
  content = (await client.get(`/api/courses/${course.id}/content`)).body;
  assert.equal(content.progress.completed, true);

  // Then o certificado é emitido com os dados do curso
  const issued = await client.post('/api/certificates', { body: { courseId: course.id } });
  assert.equal(issued.status, 201);
  assert.match(issued.body.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(issued.body.studentName, 'Maria da Conceição');
  assert.equal(issued.body.courseTitle, course.title);
  assert.equal(issued.body.duration, '20 horas');
  assert.match(issued.body.verifyUrl, new RegExp(`certificado\\.html\\?code=${issued.body.code}$`));

  // And pedir de novo devolve o mesmo certificado
  const again = await client.post('/api/certificates', { body: { courseId: course.id } });
  assert.equal(again.body.code, issued.body.code);
  content = (await client.get(`/api/courses/${course.id}/content`)).body;
  assert.equal(content.certificate.code, issued.body.code);

  // And aparece em "meus certificados"
  const mine = await client.get('/api/certificates/mine');
  assert.deepEqual(mine.body.map((c) => c.code), [issued.body.code]);
});

test('verificação pública e PDF para baixar', async () => {
  const { course, lessons, client } = await setup();
  await openAll(client, course, lessons);
  const { code } = (await client.post('/api/certificates', { body: { courseId: course.id } })).body;

  // Given qualquer pessoa com o código (sem login)
  const view = await anon.get(`/api/certificates/${code}`);
  assert.equal(view.status, 200);
  assert.equal(view.body.studentName, 'Maria da Conceição');

  // código em minúsculas também vale
  assert.equal((await anon.get(`/api/certificates/${code.toLowerCase()}`)).status, 200);

  // When baixa o PDF
  const pdf = await anon.get(`/api/certificates/${code}/pdf`);
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert.match(pdf.headers.get('content-disposition'), new RegExp(`attachment; filename="certificado-${code}\\.pdf"`));
  assert.ok(pdf.text.startsWith('%PDF-'));

  // And código inexistente ou malformado → 404
  assert.equal((await anon.get('/api/certificates/AAAA-BBBB-CCCC')).status, 404);
  assert.equal((await anon.get('/api/certificates/nada')).status, 404);
  assert.equal((await anon.get('/api/certificates/nada/pdf')).status, 404);
});

test('sem matrícula ativa não emite; visitante não emite', async () => {
  const { course, lessons, client, enrollment } = await setup();
  await openAll(client, course, lessons);
  await admin.patch(`/api/enrollments/${enrollment.id}`, { body: { status: 'inativa', statusReason: 'teste' } });

  const inactive = await client.post('/api/certificates', { body: { courseId: course.id } });
  assert.equal(inactive.status, 403);
  assert.equal(inactive.body.error, 'ENROLLMENT_INACTIVE');

  const outsider = await setup();
  const noEnrollment = await outsider.client.post('/api/certificates', { body: { courseId: course.id } });
  assert.equal(noEnrollment.body.error, 'ENROLLMENT_NOT_FOUND');

  assert.equal((await anon.post('/api/certificates', { body: { courseId: course.id } })).status, 401);
  assert.equal((await client.post('/api/certificates', { body: { courseId: 'nao-existe' } })).status, 404);
});

test('curso sem aulas nunca conta como concluído', async () => {
  const course = (await admin.post('/api/courses', {
    body: { title: 'Vazio', type: 'gravado', description: 'd', duration: '1h', price: '0' },
  })).body;
  const email = `v-${Date.now()}@ex.com`;
  const student = (await admin.post('/api/students', { body: { name: 'A', email, password: 'aluno-1234' } })).body;
  await admin.post('/api/enrollments', { body: { userId: student.id, courseId: course.id } });
  const client = createClient(server.baseUrl);
  await client.post('/api/auth/login', { body: { email, password: 'aluno-1234' } });

  const response = await client.post('/api/certificates', { body: { courseId: course.id } });
  assert.equal(response.body.error, 'COURSE_NOT_COMPLETED');
});

test('PDF é gerado com e sem autor; data por extenso em português', async () => {
  const base = { code: 'ABCD-EFGH-JKMN', studentName: 'João Ávila', courseTitle: 'Curso – Teste', duration: '', issuedAt: '2026-10-20T15:00:00.000Z' };
  for (const cert of [{ ...base, authorName: null }, { ...base, authorName: 'Ana Autora', duration: '10h' }]) {
    const buffer = await renderCertificatePdf(cert, { verifyUrl: 'https://exemplo/certificado.html?code=ABCD-EFGH-JKMN' });
    assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  }
  assert.equal(formatIssuedDate('2026-10-20T15:00:00.000Z'), '20 de outubro de 2026');
});
