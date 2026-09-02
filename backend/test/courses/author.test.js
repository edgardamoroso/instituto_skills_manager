import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin, makeAuthorClient } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sentMessages, clearOutbox } from '../../src/lib/mailer.js';
import { db } from '../../src/db/index.js';

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

const courseBody = { title: 'Curso do Autor', type: 'gravado', description: 'desc', duration: '4 horas', priceCents: 9900 };

function authorHelper(name) {
  return makeAuthorClient({ server, createClient, admin, sentMessages, clearOutbox, name });
}

test('admin cria curso com authorId e o payload público traz o autor', async () => {
  // Given um autor cadastrado
  const author = await authorHelper('Helena');

  // When o admin cria um curso atribuindo esse autor
  const created = await admin.post('/api/courses', { body: { ...courseBody, authorId: author.id } });
  assert.equal(created.status, 201);

  // Then GET /:id traz author {id,name,bio}
  const detail = await admin.get(`/api/courses/${created.body.id}`);
  assert.equal(detail.body.author.id, author.id);
  assert.equal(detail.body.author.name, 'Helena');
  assert.equal(detail.body.author.bio, 'bio do autor');
});

test('admin cria curso com authorId inexistente → 400 COURSE_AUTHOR_INVALID', async () => {
  const response = await admin.post('/api/courses', { body: { ...courseBody, authorId: 'nao-existe' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'COURSE_AUTHOR_INVALID');
});

test('autor cria curso: fica como autor e aparece só no /mine dele', async () => {
  // Given dois autores
  const a = await authorHelper('Ana');
  const b = await authorHelper('Bruno');

  // When cada um cria um curso
  const courseA = await a.client.post('/api/courses', { body: courseBody });
  assert.equal(courseA.status, 201);
  assert.equal(courseA.body.author.id, a.id);
  await b.client.post('/api/courses', { body: courseBody });

  // Then /mine de A traz o curso de A e não o de B
  const mine = await a.client.get('/api/courses/mine');
  assert.equal(mine.status, 200);
  assert.ok(mine.body.some((c) => c.id === courseA.body.id));
  assert.equal(mine.body.every((c) => c.author?.id === a.id), true);
});

test('autor não edita/exclui curso de terceiro (403) mas edita o próprio', async () => {
  // Given um curso do autor A
  const a = await authorHelper('Alfa');
  const b = await authorHelper('Beta');
  const course = (await a.client.post('/api/courses', { body: courseBody })).body;

  // When B tenta mexer
  assert.equal((await b.client.patch(`/api/courses/${course.id}`, { body: courseBody })).status, 403);
  assert.equal((await b.client.delete(`/api/courses/${course.id}`)).status, 403);
  assert.equal((await b.client.post(`/api/courses/${course.id}/lessons`, { body: { title: 'x', resource: 'https://e.com', resourceType: 'link' } })).status, 403);

  // Then A consegue
  assert.equal((await a.client.patch(`/api/courses/${course.id}`, { body: { ...courseBody, title: 'Novo' } })).status, 200);
  const lesson = await a.client.post(`/api/courses/${course.id}/lessons`, { body: { title: 'Aula 1', resource: 'https://e.com', resourceType: 'link' } });
  assert.equal(lesson.status, 201);
});

test('autor não acessa alunos, matrículas nem outros autores', async () => {
  const a = await authorHelper('Gama');
  assert.equal((await a.client.get('/api/students')).status, 403);
  assert.equal((await a.client.get('/api/enrollments?courseId=x')).status, 403);
  assert.equal((await a.client.get('/api/authors')).status, 403);
});

test('cursos semeados continuam com author null e contrato antigo', async () => {
  // Given os 4 cursos do seed
  // When lista pública
  const list = await createClient(server.baseUrl).get('/api/courses');

  // Then contêm os campos antigos + author: null
  assert.equal(list.status, 200);
  const seeded = list.body.find((c) => c.id === 'gestao-equipes-resultados');
  assert.ok(seeded);
  assert.equal(seeded.author, null);
  assert.equal(typeof seeded.priceCents, 'number');
  assert.equal(typeof seeded.lessonCount, 'number');
});

test('auditoria de edição por autor registra o actor_user_id do autor', async () => {
  const a = await authorHelper('Auditada');
  const course = (await a.client.post('/api/courses', { body: courseBody })).body;
  await a.client.patch(`/api/courses/${course.id}`, { body: { ...courseBody, title: 'Editado' } });

  const row = db.prepare(
    "SELECT actor_user_id FROM audit_log WHERE action = 'course.update' AND target = ? ORDER BY at DESC LIMIT 1",
  ).get(course.id);
  assert.equal(row.actor_user_id, a.id);
});
