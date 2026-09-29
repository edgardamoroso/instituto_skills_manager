import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoLink } from '../../src/services/videoService.js';

const DRIVE_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const DRIVE_LINK = `https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`;

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

test('parseVideoLink reconhece os formatos de link do Drive e do YouTube', () => {
  // Given links como o usuário copia de cada plataforma
  const cases = [
    [DRIVE_LINK, { provider: 'drive', ref: DRIVE_ID }],
    [`https://drive.google.com/file/d/${DRIVE_ID}/preview`, { provider: 'drive', ref: DRIVE_ID }],
    [`https://drive.google.com/open?id=${DRIVE_ID}`, { provider: 'drive', ref: DRIVE_ID }],
    [`https://drive.google.com/uc?id=${DRIVE_ID}&export=download`, { provider: 'drive', ref: DRIVE_ID }],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s', { provider: 'youtube', ref: 'dQw4w9WgXcQ' }],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', { provider: 'youtube', ref: 'dQw4w9WgXcQ' }],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', { provider: 'youtube', ref: 'dQw4w9WgXcQ' }],
    ['https://m.youtube.com/embed/dQw4w9WgXcQ', { provider: 'youtube', ref: 'dQw4w9WgXcQ' }],
  ];

  // Then cada um vira provedor + id
  for (const [link, expected] of cases) {
    assert.deepEqual(parseVideoLink(link), expected, link);
  }
});

test('parseVideoLink recusa links inválidos ou de outros sites', () => {
  const invalid = [
    '',
    'não é link',
    'javascript:alert(1)',
    'https://drive.google.com/drive/folders/abc',
    'https://drive.google.com/file/d/curto/view',
    'https://www.youtube.com/watch?v=curto',
  ];
  for (const link of invalid) {
    assert.throws(() => parseVideoLink(link), /VIDEO_LINK_INVALID/, link);
  }
  assert.throws(() => parseVideoLink('https://vimeo.com/123456'), /VIDEO_LINK_UNSUPPORTED/);
});

test('admin cadastra vídeo do Drive: nasce rascunho e devolve URL do player', async () => {
  // When o admin cadastra um vídeo
  const response = await admin.post('/api/videos', {
    body: { title: 'Por que fazer o curso', description: 'Conheça o curso', link: DRIVE_LINK },
  });

  // Then fica em rascunho, com o player do Drive montado a partir do id
  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'rascunho');
  assert.equal(response.body.provider, 'drive');
  assert.equal(response.body.embedUrl, `https://drive.google.com/file/d/${DRIVE_ID}/preview`);
});

test('só vídeos publicados aparecem na página pública', async () => {
  // Given um rascunho e um publicado
  const draft = await admin.post('/api/videos', { body: { title: 'Rascunho', link: DRIVE_LINK } });
  const published = await admin.post('/api/videos', {
    body: { title: 'Publicado', link: 'https://youtu.be/dQw4w9WgXcQ', status: 'publicado' },
  });

  // When um visitante lista os vídeos
  const response = await anon.get('/api/videos');

  // Then vê só o publicado
  assert.equal(response.status, 200);
  const ids = response.body.map((video) => video.id);
  assert.ok(ids.includes(published.body.id));
  assert.ok(!ids.includes(draft.body.id));
  assert.equal(response.body.find((v) => v.id === published.body.id).embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
});

test('publicar e editar parcialmente preserva os demais campos', async () => {
  // Given um vídeo em rascunho
  const created = await admin.post('/api/videos', { body: { title: 'Original', description: 'desc', link: DRIVE_LINK } });

  // When o admin só publica, sem reenviar título nem link
  const response = await admin.patch(`/api/videos/${created.body.id}`, { body: { status: 'publicado' } });

  // Then o restante é preservado
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'publicado');
  assert.equal(response.body.title, 'Original');
  assert.equal(response.body.description, 'desc');
  assert.equal(response.body.provider, 'drive');
});

test('trocar o link muda o provedor e o player', async () => {
  // Given um vídeo do Drive
  const created = await admin.post('/api/videos', { body: { title: 'Troca', link: DRIVE_LINK } });

  // When o admin troca por um link do YouTube
  const response = await admin.patch(`/api/videos/${created.body.id}`, { body: { link: 'https://youtu.be/dQw4w9WgXcQ' } });

  // Then o player passa a ser o do YouTube
  assert.equal(response.body.provider, 'youtube');
  assert.equal(response.body.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
});

test('validações: título, link e status', async () => {
  const noTitle = await admin.post('/api/videos', { body: { title: '', link: DRIVE_LINK } });
  assert.equal(noTitle.status, 400);
  assert.equal(noTitle.body.error, 'VIDEO_FIELDS_REQUIRED');

  const badLink = await admin.post('/api/videos', { body: { title: 'X', link: 'https://exemplo.com/video.mp4' } });
  assert.equal(badLink.body.error, 'VIDEO_LINK_UNSUPPORTED');

  const badStatus = await admin.post('/api/videos', { body: { title: 'X', link: DRIVE_LINK, status: 'ao-vivo' } });
  assert.equal(badStatus.body.error, 'VIDEO_STATUS_INVALID');
});

test('excluir vídeo; excluir de novo é 404', async () => {
  const created = await admin.post('/api/videos', { body: { title: 'Temporário', link: DRIVE_LINK } });

  const first = await admin.delete(`/api/videos/${created.body.id}`);
  assert.equal(first.status, 204);

  const second = await admin.delete(`/api/videos/${created.body.id}`);
  assert.equal(second.status, 404);
  assert.equal(second.body.error, 'VIDEO_NOT_FOUND');

  const patch = await admin.patch(`/api/videos/${created.body.id}`, { body: { title: 'Y' } });
  assert.equal(patch.status, 404);
});

test('visitante não gerencia vídeos', async () => {
  assert.equal((await anon.get('/api/videos/manage')).status, 401);
  assert.equal((await anon.post('/api/videos', { body: { title: 'X', link: DRIVE_LINK } })).status, 401);
});
