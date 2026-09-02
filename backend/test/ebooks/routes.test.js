import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../../src/db/index.js';
import { issueDownloadGrant } from '../../src/services/ebookService.js';

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

function ebookForm(fields, files = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  if (files.cover) form.set('cover', new Blob(['png'], { type: 'image/png' }), 'capa.png');
  if (files.file) form.set('file', new Blob(['%PDF-1.4 conteudo'], { type: 'application/pdf' }), 'livro.pdf');
  if (files.sample) form.set('sample', new Blob(['%PDF-1.4 amostra'], { type: 'application/pdf' }), 'amostra.pdf');
  return form;
}

test('catálogo público só mostra publicados', async () => {
  // Given um rascunho criado
  await admin.post('/api/ebooks', { form: ebookForm({ title: 'Rascunho', mode: 'venda_no_site', priceCents: '1000' }) });

  // When lista pública
  const list = await createClient(server.baseUrl).get('/api/ebooks');

  // Then não traz o rascunho
  assert.equal(list.status, 200);
  assert.equal(list.body.some((e) => e.title === 'Rascunho'), false);
});

test('publicar venda_no_site sem arquivo → 400; com upload → publica', async () => {
  // Given um rascunho
  const draft = await admin.post('/api/ebooks', { form: ebookForm({ title: 'Guia', mode: 'venda_no_site', priceCents: '4990' }) });
  assert.equal(draft.status, 201);
  assert.equal(draft.body.hasFile, false);

  // When publica sem arquivo
  const bad = await admin.patch(`/api/ebooks/${draft.body.id}`, {
    form: ebookForm({ title: 'Guia', mode: 'venda_no_site', priceCents: '4990', status: 'publicado' }),
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'EBOOK_FILE_REQUIRED');

  // Then publica com arquivo + amostra + capa
  const ok = await admin.patch(`/api/ebooks/${draft.body.id}`, {
    form: ebookForm(
      { title: 'Guia', mode: 'venda_no_site', priceCents: '4990', status: 'publicado', description: 'um guia' },
      { file: true, sample: true, cover: true },
    ),
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'publicado');
  assert.equal(ok.body.hasFile, true);
  assert.equal(ok.body.hasSample, true);
  assert.ok(ok.body.coverUrl.startsWith('/uploads/'));

  // e agora aparece no catálogo, sem vazar caminho de arquivo
  const pub = await createClient(server.baseUrl).get(`/api/ebooks/${draft.body.id}`);
  assert.equal(pub.body.mode, 'venda_no_site');
  assert.equal(pub.body.priceCents, 4990);
  assert.equal(pub.body.filePath, undefined);
  assert.ok(pub.body.sampleUrl.startsWith('/uploads/'));
});

test('eBook link_externo: sem URL → 400; com URL → publica com botão de loja', async () => {
  const bad = await admin.post('/api/ebooks', { form: ebookForm({ title: 'Kindle', mode: 'link_externo', status: 'publicado' }) });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'EBOOK_EXTERNAL_URL_INVALID');

  const ok = await admin.post('/api/ebooks', {
    form: ebookForm({ title: 'Kindle', mode: 'link_externo', status: 'publicado', externalUrl: 'https://www.amazon.com.br/dp/B0X', storeName: 'Amazon' }),
  });
  assert.equal(ok.status, 201);
  const pub = await createClient(server.baseUrl).get(`/api/ebooks/${ok.body.id}`);
  assert.equal(pub.body.externalUrl, 'https://www.amazon.com.br/dp/B0X');
  assert.equal(pub.body.storeName, 'Amazon');
  assert.equal(pub.body.sampleUrl, null);
});

test('não-admin não acessa manage nem CRUD', async () => {
  const anon = createClient(server.baseUrl);
  assert.equal((await anon.get('/api/ebooks/manage')).status, 401);
  assert.equal((await anon.post('/api/ebooks', { form: ebookForm({ title: 'x', mode: 'venda_no_site' }) })).status, 401);
});

test('DELETE de eBook com pedido → 409; sem pedido → 204', async () => {
  const ebook = await admin.post('/api/ebooks', {
    form: ebookForm({ title: 'Com pedido', mode: 'venda_no_site', priceCents: '1000' }, { file: true }),
  });
  db.prepare(
    `INSERT INTO ebook_orders (id, ebook_id, buyer_name, buyer_email, buyer_cpf, buyer_birthdate, payment_method, amount_cents)
     VALUES (?, ?, 'N', 'e@e.com', '39053344705', '1990-01-01', 'pix', 1000)`,
  ).run(crypto.randomUUID(), ebook.body.id);
  assert.equal((await admin.delete(`/api/ebooks/${ebook.body.id}`)).status, 409);

  const solo = await admin.post('/api/ebooks', { form: ebookForm({ title: 'Sozinho', mode: 'venda_no_site', priceCents: '1000' }) });
  assert.equal((await admin.delete(`/api/ebooks/${solo.body.id}`)).status, 204);
});

test('GET /api/ebooks/download/:token entrega o arquivo e respeita o limite', async () => {
  // Given um eBook publicado e um pedido entregue com grant
  const ebook = await admin.post('/api/ebooks', {
    form: ebookForm({ title: 'Baixável', mode: 'venda_no_site', priceCents: '1500', status: 'publicado' }, { file: true }),
  });
  const orderId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO ebook_orders (id, ebook_id, buyer_name, buyer_email, buyer_cpf, buyer_birthdate, payment_method, amount_cents, status)
     VALUES (?, ?, 'N', 'e@e.com', '39053344705', '1990-01-01', 'pix', 1500, 'entregue')`,
  ).run(orderId, ebook.body.id);
  db.prepare('UPDATE ebook_download_grants SET max_downloads = 1 WHERE order_id = ?').run(orderId); // n/a ainda
  const grant = issueDownloadGrant(orderId);
  db.prepare('UPDATE ebook_download_grants SET max_downloads = 1 WHERE token = ?').run(grant.token);

  // When baixa (guest, só o token)
  const first = await fetch(`${server.baseUrl}/api/ebooks/download/${grant.token}`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get('content-disposition') || '', /attachment/);

  // Then a segunda tentativa estoura o limite
  const second = await fetch(`${server.baseUrl}/api/ebooks/download/${grant.token}`);
  assert.equal(second.status, 429);

  // token forjado → 404
  const forged = await fetch(`${server.baseUrl}/api/ebooks/download/deadbeef`);
  assert.equal(forged.status, 404);
});
