import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { lessonFilePath } from '../../src/lib/lessonFiles.js';

const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const PDF_BYTES = Buffer.from('%PDF-1.4\n% teste\n');

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

async function makeCourse() {
  const response = await admin.post('/api/courses', {
    body: { title: `Curso ${Math.random()}`, type: 'gravado', description: 'desc', duration: '2h', price: '100' },
  });
  return response.body;
}

function lessonForm(fields, file) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (file) form.set('file', new Blob([file.bytes], { type: file.type }), file.name);
  return form;
}

async function addLinkLesson(courseId, title, { type = 'link', url = 'https://exemplo.com/material' } = {}) {
  return admin.post(`/api/courses/${courseId}/lessons`, { body: { title, resourceType: type, resource: url } });
}

async function addPdfLesson(courseId, title) {
  return admin.post(`/api/courses/${courseId}/lessons`, {
    form: lessonForm({ title, resourceType: 'file' }, { bytes: PDF_BYTES, type: 'application/pdf', name: 'apostila.pdf' }),
  });
}

async function enrolledStudent(courseId) {
  const email = `l-${Date.now()}-${Math.random().toString(36).slice(2)}@ex.com`;
  const student = (await admin.post('/api/students', { body: { name: 'Aluno', email, password: 'aluno-1234' } })).body;
  await admin.post('/api/enrollments', { body: { userId: student.id, courseId } });
  const client = createClient(server.baseUrl);
  await client.post('/api/auth/login', { body: { email, password: 'aluno-1234' } });
  return client;
}

test('editar aula: troca título e substitui arquivo por link (apaga o arquivo antigo)', async () => {
  // Given uma aula com PDF enviado
  const course = await makeCourse();
  const created = (await addPdfLesson(course.id, 'Apostila')).body;
  const lessonRow = (await admin.get(`/api/courses/${course.id}`)).body.lessons[0];
  assert.ok(lessonRow.fileUrl, 'arquivo sai pela rota da aula');
  assert.equal(lessonRow.resource, null, 'o caminho do arquivo não é exposto');

  // When o admin edita só o título, mantendo o arquivo
  const renamed = await admin.patch(`/api/courses/${course.id}/lessons/${created.id}`, {
    form: lessonForm({ title: 'Apostila revisada', description: 'nova', resourceType: 'file' }),
  });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.title, 'Apostila revisada');
  assert.equal(renamed.body.resourceName, 'apostila.pdf');

  // And depois troca o arquivo por um vídeo do Drive
  const { db } = await import('../../src/db/index.js');
  const oldResource = db.prepare('SELECT resource FROM lessons WHERE id = ?').get(created.id).resource;
  assert.ok(existsSync(lessonFilePath(oldResource)));
  const swapped = await admin.patch(`/api/courses/${course.id}/lessons/${created.id}`, {
    form: lessonForm({ title: 'Vídeo', resourceType: 'video', resource: `https://drive.google.com/file/d/${DRIVE_ID}/view` }),
  });

  // Then vira vídeo com player do Drive e o arquivo antigo some do disco
  assert.equal(swapped.status, 200);
  assert.equal(swapped.body.resourceType, 'video');
  assert.equal(swapped.body.embedUrl, `https://drive.google.com/file/d/${DRIVE_ID}/preview`);
  assert.equal(existsSync(lessonFilePath(oldResource)), false);
});

test('tipo e recurso precisam combinar; trocar para link sem informar o link é recusado', async () => {
  const course = await makeCourse();
  const fileAsLink = await admin.post(`/api/courses/${course.id}/lessons`, {
    form: lessonForm({ title: 'X', resourceType: 'video' }, { bytes: PDF_BYTES, type: 'application/pdf', name: 'a.pdf' }),
  });
  assert.equal(fileAsLink.body.error, 'LESSON_RESOURCE_MISMATCH');

  const pdf = (await addPdfLesson(course.id, 'Apostila')).body;
  const noLink = await admin.patch(`/api/courses/${course.id}/lessons/${pdf.id}`, {
    form: lessonForm({ title: 'Apostila', resourceType: 'link' }),
  });
  assert.equal(noLink.status, 400);
  assert.equal(noLink.body.error, 'LESSON_RESOURCE_MISMATCH');
});

test('reordenar aulas para cima e para baixo', async () => {
  const course = await makeCourse();
  const a = (await addLinkLesson(course.id, 'A')).body;
  await addLinkLesson(course.id, 'B');
  await addLinkLesson(course.id, 'C');

  const down = await admin.post(`/api/courses/${course.id}/lessons/${a.id}/move`, { body: { direction: 'down' } });
  assert.deepEqual(down.body.map((l) => l.title), ['B', 'A', 'C']);

  const up = await admin.post(`/api/courses/${course.id}/lessons/${a.id}/move`, { body: { direction: 'up' } });
  assert.deepEqual(up.body.map((l) => l.title), ['A', 'B', 'C']);

  // mover a primeira para cima não muda nada
  const noop = await admin.post(`/api/courses/${course.id}/lessons/${a.id}/move`, { body: { direction: 'up' } });
  assert.deepEqual(noop.body.map((l) => l.title), ['A', 'B', 'C']);
});

test('visitante vê a grade de aulas sem os endereços', async () => {
  const course = await makeCourse();
  await addLinkLesson(course.id, 'Aula secreta', { url: 'https://exemplo.com/segredo' });

  const response = await anon.get(`/api/courses/${course.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.lessons[0].title, 'Aula secreta');
  assert.equal(response.body.lessons[0].resource, undefined);
  assert.ok(!response.text.includes('segredo'));
});

test('sequência: a próxima aula só libera depois de abrir a anterior', async () => {
  // Given um curso com 3 aulas e um aluno matriculado
  const course = await makeCourse();
  const first = (await addLinkLesson(course.id, 'Aula 1', { url: 'https://exemplo.com/um' })).body;
  const second = (await addLinkLesson(course.id, 'Aula 2', { url: 'https://exemplo.com/dois' })).body;
  await addLinkLesson(course.id, 'Aula 3', { url: 'https://exemplo.com/tres' });
  const student = await enrolledStudent(course.id);

  // Then só a primeira vem liberada, e as bloqueadas vêm sem o endereço
  let content = (await student.get(`/api/courses/${course.id}/content`)).body;
  assert.deepEqual(content.lessons.map((l) => l.locked), [false, true, true]);
  assert.equal(content.lessons[1].resource, undefined);
  assert.ok(!JSON.stringify(content).includes('exemplo.com/dois'));

  // And abrir uma aula bloqueada é recusado
  const skip = await student.post(`/api/courses/${course.id}/lessons/${second.id}/open`);
  assert.equal(skip.status, 403);
  assert.equal(skip.body.error, 'LESSON_LOCKED');

  // When o aluno abre a primeira
  const opened = await student.post(`/api/courses/${course.id}/lessons/${first.id}/open`);
  assert.equal(opened.status, 200);

  // Then a segunda libera (e a terceira continua bloqueada)
  content = (await student.get(`/api/courses/${course.id}/content`)).body;
  assert.deepEqual(content.lessons.map((l) => l.locked), [false, false, true]);
  assert.deepEqual(content.lessons.map((l) => l.opened), [true, false, false]);
  assert.equal(content.lessons[1].resource, 'https://exemplo.com/dois');

  // And o admin vê tudo liberado (prévia)
  const preview = (await admin.get(`/api/courses/${course.id}/content`)).body;
  assert.equal(preview.preview, true);
  assert.ok(preview.lessons.every((l) => !l.locked));
});

test('vídeo: aluno recebe só o player, nunca o link original', async () => {
  const course = await makeCourse();
  await addLinkLesson(course.id, 'Vídeo', { type: 'video', url: `https://drive.google.com/file/d/${DRIVE_ID}/view` });
  const student = await enrolledStudent(course.id);

  const lesson = (await student.get(`/api/courses/${course.id}/content`)).body.lessons[0];
  assert.equal(lesson.resource, null);
  assert.equal(lesson.embedUrl, `https://drive.google.com/file/d/${DRIVE_ID}/preview`);
});

test('PDF da aula: abre no navegador, pode baixar, e respeita matrícula e sequência', async () => {
  // Given um curso cuja segunda aula é um PDF
  const course = await makeCourse();
  const first = (await addLinkLesson(course.id, 'Intro')).body;
  const pdf = (await addPdfLesson(course.id, 'Apostila')).body;
  const fileUrl = `/api/courses/${course.id}/lessons/${pdf.id}/file`;
  const student = await enrolledStudent(course.id);

  // Then visitante e aluno sem matrícula não acessam; aluno com a aula bloqueada também não
  assert.equal((await anon.get(fileUrl)).status, 401);
  const outsider = await enrolledStudent((await makeCourse()).id);
  assert.equal((await outsider.get(fileUrl)).status, 403);
  assert.equal((await student.get(fileUrl)).status, 403);

  // When o aluno abre a primeira aula, o PDF libera
  await student.post(`/api/courses/${course.id}/lessons/${first.id}/open`);
  const inline = await student.get(fileUrl);
  assert.equal(inline.status, 200);
  assert.match(inline.headers.get('content-type'), /application\/pdf/);
  assert.match(inline.headers.get('content-disposition'), /^inline/);
  assert.equal(inline.text, PDF_BYTES.toString());

  // And com ?download=1 o navegador baixa
  const download = await student.get(`${fileUrl}?download=1`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  assert.match(download.headers.get('content-disposition'), /apostila\.pdf/);
});

test('excluir aula apaga o arquivo do disco', async () => {
  const course = await makeCourse();
  const pdf = (await addPdfLesson(course.id, 'Apostila')).body;
  const { db } = await import('../../src/db/index.js');
  const resource = db.prepare('SELECT resource FROM lessons WHERE id = ?').get(pdf.id).resource;
  assert.ok(existsSync(lessonFilePath(resource)));

  assert.equal((await admin.delete(`/api/courses/${course.id}/lessons/${pdf.id}`)).status, 204);
  assert.equal(existsSync(lessonFilePath(resource)), false);
});

test('nome de arquivo com acento e travessão é preservado (UTF-8)', async () => {
  const course = await makeCourse();
  const created = await admin.post(`/api/courses/${course.id}/lessons`, {
    form: lessonForm({ title: 'Aula 06', resourceType: 'file' }, { bytes: PDF_BYTES, type: 'application/pdf', name: 'Aula 06 – Vídeo e Ação.pdf' }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.resourceName, 'Aula 06 – Vídeo e Ação.pdf');

  // e o download usa o nome correto
  const download = await admin.get(`/api/courses/${course.id}/lessons/${created.body.id}/file?download=1`);
  assert.match(decodeURIComponent(download.headers.get('content-disposition')), /Aula 06 – Vídeo e Ação.pdf/);
});
