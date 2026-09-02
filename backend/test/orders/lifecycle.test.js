import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import { loginAsAdmin } from '../helpers/auth.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { db } from '../../src/db/index.js';
import { sentMessages, clearOutbox } from '../../src/lib/mailer.js';
import { resetAll } from '../../src/middleware/rateLimit.js';
import { saveProtected } from '../../src/lib/storage.js';

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

beforeEach(() => {
  clearOutbox();
  resetAll();
});

const VALID_CPF = '390.533.447-05';

// Os e-mails usam config.publicUrl (localhost:3000); nos testes o app roda numa porta
// efêmera, então trocamos a origem pelo baseUrl real.
function downloadPath(text) {
  return /\/api\/ebooks\/download\/\w+/.exec(text)[0];
}

function sellableEbook(priceCents = 4990) {
  const id = crypto.randomUUID();
  const tmp = path.join(os.tmpdir(), `eb-${id}.pdf`);
  writeFileSync(tmp, '%PDF-1.4 conteudo do ebook');
  const relPath = saveProtected(tmp, '.pdf');
  db.prepare(
    `INSERT INTO ebooks (id, title, mode, status, price_cents, file_path, file_name)
     VALUES (?, 'eBook', 'venda_no_site', 'publicado', ?, ?, 'ebook.pdf')`,
  ).run(id, priceCents, relPath);
  return id;
}

async function newOrder(ebookId) {
  const response = await createClient(server.baseUrl).post('/api/ebook-orders', {
    body: { ebookId, name: 'Marina Alves', email: 'marina@example.com', phone: '(61) 99999-1234', cpf: VALID_CPF, birthdate: '1990-04-12', paymentMethod: 'pix' },
  });
  return response;
}

test('pedido: criação pública 201 e auditoria sem CPF', async () => {
  // Given um eBook vendável
  const ebookId = sellableEbook();

  // When um convidado cria o pedido
  const response = await newOrder(ebookId);

  // Then 201 e o audit_log não contém o CPF
  assert.equal(response.status, 201);
  assert.equal(response.body.status, 'aguardando_link');
  const audits = db.prepare("SELECT detail FROM audit_log WHERE action = 'ebook_order.create'").all();
  assert.ok(audits.length >= 1);
  assert.equal(audits.every((a) => !a.detail.includes('39053344705')), true);
});

test('pedido de eBook link_externo → 400 ORDER_EBOOK_NOT_SELLABLE', async () => {
  const id = crypto.randomUUID();
  db.prepare("INSERT INTO ebooks (id, title, mode, status, external_url) VALUES (?, 'Ext', 'link_externo', 'publicado', 'https://a.com/x')").run(id);
  const response = await newOrder(id);
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'ORDER_EBOOK_NOT_SELLABLE');
});

test('ciclo completo: link de pagamento → pago → entregue → download', async () => {
  // Given um pedido
  const ebookId = sellableEbook();
  const orderId = (await newOrder(ebookId)).body.id;

  // When registra o link de pagamento
  const linked = await admin.post(`/api/ebook-orders/${orderId}/payment-link`, {
    body: { paymentLinkUrl: 'https://www.asaas.com/c/abc123', asaasChargeId: 'pay_0001' },
  });
  assert.equal(linked.status, 200);
  assert.equal(linked.body.status, 'aguardando_pagamento');
  assert.match(sentMessages.at(-1).text, /asaas\.com\/c\/abc123/);

  // e marca como pago
  clearOutbox();
  const paid = await admin.post(`/api/ebook-orders/${orderId}/mark-paid`);
  assert.equal(paid.status, 200);
  assert.equal(paid.body.status, 'entregue');
  const deliveryPath = downloadPath(sentMessages.at(-1).text);

  // Then o link do e-mail baixa o arquivo
  const download = await fetch(`${server.baseUrl}${deliveryPath}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition') || '', /attachment/);
});

test('transições inválidas → 409', async () => {
  const ebookId = sellableEbook();
  const orderId = (await newOrder(ebookId)).body.id;

  // mark-paid antes do link
  assert.equal((await admin.post(`/api/ebook-orders/${orderId}/mark-paid`)).status, 409);

  // depois de entregue não cancela
  await admin.post(`/api/ebook-orders/${orderId}/payment-link`, { body: { paymentLinkUrl: 'https://asaas.com/c/x' } });
  await admin.post(`/api/ebook-orders/${orderId}/mark-paid`);
  assert.equal((await admin.post(`/api/ebook-orders/${orderId}/cancel`)).status, 409);
});

test('payment-link inválido → 400 PAYMENT_LINK_INVALID', async () => {
  const orderId = (await newOrder(sellableEbook())).body.id;
  const response = await admin.post(`/api/ebook-orders/${orderId}/payment-link`, { body: { paymentLinkUrl: 'javascript:alert(1)' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'PAYMENT_LINK_INVALID');
});

test('resend delivery emite novo token e expira o anterior', async () => {
  const ebookId = sellableEbook();
  const orderId = (await newOrder(ebookId)).body.id;
  await admin.post(`/api/ebook-orders/${orderId}/payment-link`, { body: { paymentLinkUrl: 'https://asaas.com/c/x' } });
  await admin.post(`/api/ebook-orders/${orderId}/mark-paid`);
  const firstPath = downloadPath(sentMessages.at(-1).text);

  clearOutbox();
  assert.equal((await admin.post(`/api/ebook-orders/${orderId}/resend`, { body: { kind: 'delivery' } })).status, 204);
  const secondPath = downloadPath(sentMessages.at(-1).text);

  assert.notEqual(firstPath, secondPath);
  assert.equal((await fetch(`${server.baseUrl}${firstPath}`)).status, 410); // antigo expirou
  assert.equal((await fetch(`${server.baseUrl}${secondPath}`)).status, 200);
});

test('PATCH corrige o e-mail; DELETE remove pedido e grants', async () => {
  const ebookId = sellableEbook();
  const orderId = (await newOrder(ebookId)).body.id;
  await admin.post(`/api/ebook-orders/${orderId}/payment-link`, { body: { paymentLinkUrl: 'https://asaas.com/c/x' } });
  await admin.post(`/api/ebook-orders/${orderId}/mark-paid`);

  const patched = await admin.patch(`/api/ebook-orders/${orderId}`, { body: { buyerEmail: 'novo@example.com' } });
  assert.equal(patched.body.buyerEmail, 'novo@example.com');

  assert.equal((await admin.delete(`/api/ebook-orders/${orderId}`)).status, 204);
  assert.equal(db.prepare('SELECT count(*) AS n FROM ebook_download_grants WHERE order_id = ?').get(orderId).n, 0);
});

test('"meus eBooks": só entregues do e-mail do usuário; download de terceiro → 404', async () => {
  // Given um pedido entregue para o e-mail do admin
  const ebookId = sellableEbook();
  const orderId = (await newOrder(ebookId)).body.id;
  db.prepare("UPDATE ebook_orders SET buyer_email = 'admin@skills.local' WHERE id = ?").run(orderId);
  await admin.post(`/api/ebook-orders/${orderId}/payment-link`, { body: { paymentLinkUrl: 'https://asaas.com/c/x' } });
  await admin.post(`/api/ebook-orders/${orderId}/mark-paid`);

  // When o admin (mesmo e-mail) consulta
  const mine = await admin.get('/api/ebook-orders/mine');
  assert.equal(mine.status, 200);
  assert.equal(mine.body.some((o) => o.id === orderId), true);
  assert.equal(mine.body.every((o) => o.buyerCpf === undefined), true);

  // e gera um novo link
  const link = await admin.post(`/api/ebook-orders/mine/${orderId}/download`);
  assert.equal(link.status, 200);
  assert.match(link.body.url, /\/api\/ebooks\/download\//);

  // Then um pedido de outro e-mail → 404
  const other = (await newOrder(sellableEbook())).body.id; // buyer_email = marina@example.com
  db.prepare("UPDATE ebook_orders SET status = 'entregue', delivered_at = datetime('now') WHERE id = ?").run(other);
  assert.equal((await admin.post(`/api/ebook-orders/mine/${other}/download`)).status, 404);
});

test('student não acessa a lista de pedidos', async () => {
  // Given um aluno logado
  const studentEmail = `stu-${Date.now()}@ex.com`;
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, 'Stu', ?, '', 'student', 1)")
    .run(crypto.randomUUID(), studentEmail);
  db.prepare('UPDATE users SET password_hash = ? WHERE email = ?')
    .run((await import('../../src/lib/password.js')).hashPassword('senha-forte-1'), studentEmail);
  const student = createClient(server.baseUrl);
  await student.post('/api/auth/login', { body: { email: studentEmail, password: 'senha-forte-1' } });

  // When acessa a lista de pedidos → 403
  assert.equal((await student.get('/api/ebook-orders')).status, 403);
});
