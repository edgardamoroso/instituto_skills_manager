import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

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

async function makeCourse(type, status) {
  const body = { title: `Curso ${type} ${Math.random()}`, type, description: 'd', duration: '10h', price: '100' };
  if (status) body.status = status;
  return (await admin.post('/api/courses', { body })).body;
}

async function makeStudent() {
  const email = `t-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`;
  const student = (await admin.post('/api/students', { body: { name: 'Aluno Turma', email, password: 'aluno-1234' } })).body;
  const client = createClient(server.baseUrl);
  await client.post('/api/auth/login', { body: { email, password: 'aluno-1234' } });
  return { ...student, client };
}

const request = (student, courseId, classId) =>
  student.client.post('/api/enrollments/request', { body: { courseId, ...(classId ? { classId } : {}) } });

test('curso novo nasce "em edição", aparece no site, mas não aceita matrícula', async () => {
  const course = await makeCourse('gravado');
  assert.equal(course.status, 'em_edicao');

  // aparece no catálogo e na página do curso, com o status
  const catalog = await anon.get('/api/courses');
  assert.equal(catalog.body.find((c) => c.id === course.id)?.status, 'em_edicao');
  assert.equal((await anon.get(`/api/courses/${course.id}`)).status, 200);

  // mas a matrícula é recusada
  const student = await makeStudent();
  const response = await request(student, course.id);
  assert.equal(response.status, 409);
  assert.equal(response.body.error, 'COURSE_NOT_OPEN');
});

test('"em atualização" recusa matrícula; "liberado" aceita (assíncrono, sem turma)', async () => {
  const course = await makeCourse('gravado', 'em_atualizacao');
  const student = await makeStudent();
  assert.equal((await request(student, course.id)).body.error, 'COURSE_NOT_OPEN');

  // admin libera
  const freed = await admin.patch(`/api/courses/${course.id}`, {
    body: { title: course.title, type: 'gravado', description: 'd', duration: '10h', price: '100', status: 'liberado' },
  });
  assert.equal(freed.body.status, 'liberado');
  const ok = await request(student, course.id);
  assert.equal(ok.status, 201);
  assert.equal(ok.body.classId, null);

  // status inválido é recusado
  const bad = await admin.patch(`/api/courses/${course.id}`, {
    body: { title: course.title, type: 'gravado', description: 'd', duration: '10h', price: '100', status: 'publicado' },
  });
  assert.equal(bad.body.error, 'COURSE_STATUS_INVALID');
});

test('editar o curso sem mandar status mantém o status atual', async () => {
  const course = await makeCourse('gravado', 'liberado');
  const edited = await admin.patch(`/api/courses/${course.id}`, {
    body: { title: 'Novo título', type: 'gravado', description: 'd', duration: '10h', price: '100' },
  });
  assert.equal(edited.body.status, 'liberado');
});

test('síncrono: inscrição exige turma em formação; público não vê o link', async () => {
  const course = await makeCourse('online', 'liberado');
  const student = await makeStudent();

  // sem turma → recusado
  assert.equal((await request(student, course.id)).body.error, 'CLASS_REQUIRED');

  // admin cria turmas
  const open = (await admin.post(`/api/courses/${course.id}/classes`, {
    body: { name: 'Turma Nov/2026', startDate: '2026-11-03', endDate: '2026-12-10', schedule: 'Ter e Qui, 19h às 21h', capacity: '30', location: 'https://meet.example/abc' },
  })).body;
  assert.equal(open.status, 'em_formacao');
  assert.equal(open.location, 'https://meet.example/abc');
  const running = (await admin.post(`/api/courses/${course.id}/classes`, {
    body: { name: 'Turma Out/2026', status: 'em_andamento' },
  })).body;

  // público vê só a turma em formação, sem link
  const publicList = await anon.get(`/api/courses/${course.id}/classes`);
  assert.deepEqual(publicList.body.map((c) => c.name), ['Turma Nov/2026']);
  assert.equal(publicList.body[0].location, undefined);
  assert.equal(publicList.body[0].seatsLeft, 30);

  // turma em andamento não aceita inscrição do aluno
  assert.equal((await request(student, course.id, running.id)).body.error, 'CLASS_CLOSED');

  // turma em formação aceita
  const enrolled = await request(student, course.id, open.id);
  assert.equal(enrolled.status, 201);
  assert.equal(enrolled.body.classId, open.id);
  assert.equal(enrolled.body.class.name, 'Turma Nov/2026');

  // o aluno (com matrícula ativa) vê o link da sua turma no conteúdo do curso
  await admin.patch(`/api/enrollments/${enrolled.body.id}`, { body: { status: 'ativa' } });
  const content = await student.client.get(`/api/courses/${course.id}/content`);
  assert.equal(content.body.class.location, 'https://meet.example/abc');
});

test('vagas: turma lota e para de aceitar; não reduz abaixo dos inscritos', async () => {
  const course = await makeCourse('online', 'liberado');
  const klass = (await admin.post(`/api/courses/${course.id}/classes`, { body: { name: 'Turma pequena', capacity: '1' } })).body;
  const first = await makeStudent();
  const second = await makeStudent();

  assert.equal((await request(first, course.id, klass.id)).status, 201);
  const full = await request(second, course.id, klass.id);
  assert.equal(full.status, 409);
  assert.equal(full.body.error, 'CLASS_FULL');

  const listed = (await admin.get(`/api/courses/${course.id}/classes`)).body[0];
  assert.equal(listed.enrolled, 1);
  assert.equal(listed.open, false);

  const below = await admin.patch(`/api/courses/${course.id}/classes/${klass.id}`, { body: { name: 'Turma pequena', capacity: '0' } });
  assert.equal(below.body.error, 'CLASS_CAPACITY_INVALID');
  const remove = await admin.delete(`/api/courses/${course.id}/classes/${klass.id}`);
  assert.equal(remove.body.error, 'CLASS_HAS_STUDENTS');
});

test('inscritos por turma (só admin) e troca de turma', async () => {
  const course = await makeCourse('online', 'liberado');
  const a = (await admin.post(`/api/courses/${course.id}/classes`, { body: { name: 'Turma A' } })).body;
  const b = (await admin.post(`/api/courses/${course.id}/classes`, { body: { name: 'Turma B', capacity: '5' } })).body;
  const student = await makeStudent();
  const enrollment = (await request(student, course.id, a.id)).body;

  // lista de inscritos da turma A
  const roster = await admin.get(`/api/courses/${course.id}/classes/${a.id}/students`);
  assert.equal(roster.status, 200);
  assert.deepEqual(roster.body.students.map((s) => s.name), ['Aluno Turma']);
  assert.equal((await anon.get(`/api/courses/${course.id}/classes/${a.id}/students`)).status, 401);
  assert.equal((await student.client.get(`/api/courses/${course.id}/classes/${a.id}/students`)).status, 403);

  // admin troca para a turma B
  const moved = await admin.put(`/api/enrollments/${enrollment.id}/class`, { body: { classId: b.id } });
  assert.equal(moved.body.classId, b.id);
  assert.equal((await admin.get(`/api/courses/${course.id}/classes/${a.id}/students`)).body.students.length, 0);
  assert.equal((await admin.get(`/api/courses/${course.id}/classes/${b.id}/students`)).body.students.length, 1);

  // turma de outro curso é recusada; tirar da turma é permitido
  const other = await makeCourse('online', 'liberado');
  const foreign = (await admin.post(`/api/courses/${other.id}/classes`, { body: { name: 'X' } })).body;
  assert.equal((await admin.put(`/api/enrollments/${enrollment.id}/class`, { body: { classId: foreign.id } })).body.error, 'CLASS_INVALID');
  assert.equal((await admin.put(`/api/enrollments/${enrollment.id}/class`, { body: { classId: null } })).body.classId, null);

  // admin matricula direto já numa turma
  const another = await makeStudent();
  const direct = await admin.post('/api/enrollments', { body: { userId: another.id, courseId: course.id, classId: a.id } });
  assert.equal(direct.status, 201);
  assert.equal(direct.body.class.name, 'Turma A');
});

test('turmas só em curso síncrono; validações de datas e status', async () => {
  const recorded = await makeCourse('gravado', 'liberado');
  assert.equal((await admin.post(`/api/courses/${recorded.id}/classes`, { body: { name: 'X' } })).body.error, 'CLASSES_ONLY_FOR_ONLINE');

  const course = await makeCourse('online', 'liberado');
  const url = `/api/courses/${course.id}/classes`;
  assert.equal((await admin.post(url, { body: { name: '' } })).body.error, 'CLASS_FIELDS_REQUIRED');
  assert.equal((await admin.post(url, { body: { name: 'X', startDate: '2026-12-01', endDate: '2026-11-01' } })).body.error, 'CLASS_DATES_INVALID');
  assert.equal((await admin.post(url, { body: { name: 'X', startDate: '01/12/2026' } })).body.error, 'CLASS_START_INVALID');
  assert.equal((await admin.post(url, { body: { name: 'X', status: 'aberta' } })).body.error, 'CLASS_STATUS_INVALID');

  // turma finalizada some do público; admin edita e exclui turma vazia
  const klass = (await admin.post(url, { body: { name: 'Antiga' } })).body;
  const done = await admin.patch(`${url}/${klass.id}`, { body: { name: 'Antiga', status: 'finalizada' } });
  assert.equal(done.body.status, 'finalizada');
  assert.equal((await anon.get(url)).body.length, 0);
  assert.equal((await admin.delete(`${url}/${klass.id}`)).status, 204);
  assert.equal((await admin.delete(`${url}/${klass.id}`)).status, 404);
  assert.equal((await anon.post(url, { body: { name: 'X' } })).status, 401);
});
