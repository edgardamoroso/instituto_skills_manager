import '../helpers/harness.js';
import { removeDbFile } from '../helpers/harness.js';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { db } from '../../src/db/index.js';
import {
  createEbook,
  updateEbook,
  deleteEbook,
  getPublishedEbook,
  consumeDownload,
  issueDownloadGrant,
} from '../../src/services/ebookService.js';

after(async () => removeDbFile());

function fakeUpload(ext = '.pdf', mime = 'application/pdf') {
  const p = path.join(os.tmpdir(), `mup-${crypto.randomUUID()}${ext}`);
  writeFileSync(p, 'bytes');
  return { path: p, filename: path.basename(p), originalname: `arquivo${ext}`, mimetype: mime };
}

const base = { title: 'eBook Teste', description: 'desc', mode: 'venda_no_site', priceCents: '2990' };

test('createEbook exige título', () => {
  assert.throws(() => createEbook({ ...base, title: '' }), /EBOOK_FIELDS_REQUIRED/);
});

test('publicar venda_no_site sem arquivo → EBOOK_FILE_REQUIRED', () => {
  assert.throws(() => createEbook({ ...base, status: 'publicado' }), /EBOOK_FILE_REQUIRED/);
});

test('publicar venda_no_site com preço 0 → EBOOK_PRICE_INVALID', () => {
  assert.throws(
    () => createEbook({ ...base, status: 'publicado', priceCents: '0' }, { file: fakeUpload() }),
    /EBOOK_PRICE_INVALID/,
  );
});

test('link_externo sem URL → EBOOK_EXTERNAL_URL_INVALID', () => {
  assert.throws(() => createEbook({ title: 'X', mode: 'link_externo' }), /EBOOK_EXTERNAL_URL_INVALID/);
});

test('cria rascunho venda_no_site sem arquivo (ok) e publica depois com arquivo', () => {
  // Given um rascunho
  const draft = createEbook({ ...base });
  assert.equal(draft.status, 'rascunho');
  assert.equal(draft.hasFile, false);

  // When publica com arquivo
  const published = updateEbook(draft.id, { ...base, status: 'publicado' }, { file: fakeUpload() });

  // Then fica publicado e com arquivo
  assert.equal(published.status, 'publicado');
  assert.equal(published.hasFile, true);
  assert.equal(getPublishedEbook(draft.id).id, draft.id);
});

test('rascunho não aparece no catálogo público', () => {
  const draft = createEbook({ ...base, title: 'Oculto' });
  assert.throws(() => getPublishedEbook(draft.id), /EBOOK_NOT_FOUND/);
});

test('publicToApi: link_externo tem sampleUrl null e externalUrl/storeName preenchidos', () => {
  const ebook = createEbook({
    title: 'Na Amazon', mode: 'link_externo', status: 'publicado',
    externalUrl: 'https://www.amazon.com.br/dp/B0TEST', storeName: 'Amazon',
  });
  const pub = getPublishedEbook(ebook.id);
  assert.equal(pub.mode, 'link_externo');
  assert.equal(pub.sampleUrl, null);
  assert.equal(pub.externalUrl, 'https://www.amazon.com.br/dp/B0TEST');
  assert.equal(pub.storeName, 'Amazon');
  assert.equal(pub.priceCents, null);
});

test('trocar modalidade com pedidos → EBOOK_MODE_LOCKED', () => {
  // Given um eBook venda_no_site com um pedido
  const ebook = createEbook({ ...base, status: 'publicado' }, { file: fakeUpload() });
  db.prepare(
    `INSERT INTO ebook_orders (id, ebook_id, buyer_name, buyer_email, buyer_cpf, buyer_birthdate, payment_method, amount_cents)
     VALUES (?, ?, 'N', 'e@e.com', '39053344705', '1990-01-01', 'pix', 2990)`,
  ).run(crypto.randomUUID(), ebook.id);

  // When tenta virar link_externo
  assert.throws(
    () => updateEbook(ebook.id, { title: base.title, mode: 'link_externo', externalUrl: 'https://a.com' }),
    /EBOOK_MODE_LOCKED/,
  );
  // e não pode ser excluído
  assert.throws(() => deleteEbook(ebook.id), /EBOOK_HAS_ORDERS/);
});

test('consumeDownload: token inexistente / expirado / no limite', () => {
  const ebook = createEbook({ ...base, status: 'publicado' }, { file: fakeUpload() });
  const orderId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO ebook_orders (id, ebook_id, buyer_name, buyer_email, buyer_cpf, buyer_birthdate, payment_method, amount_cents, status)
     VALUES (?, ?, 'N', 'e@e.com', '39053344705', '1990-01-01', 'pix', 2990, 'entregue')`,
  ).run(orderId, ebook.id);

  assert.throws(() => consumeDownload('nada'), /DOWNLOAD_TOKEN_NOT_FOUND/);

  const grant = issueDownloadGrant(orderId);
  db.prepare('UPDATE ebook_download_grants SET expires_at = ? WHERE token = ?')
    .run(new Date(Date.now() - 3600_000).toISOString(), grant.token);
  assert.throws(() => consumeDownload(grant.token), /DOWNLOAD_TOKEN_EXPIRED/);

  const g2 = issueDownloadGrant(orderId);
  db.prepare('UPDATE ebook_download_grants SET download_count = max_downloads WHERE token = ?').run(g2.token);
  assert.throws(() => consumeDownload(g2.token), /DOWNLOAD_LIMIT_REACHED/);
});

test('consumeDownload feliz: incrementa o contador e devolve o arquivo', () => {
  const ebook = createEbook({ ...base, status: 'publicado' }, { file: fakeUpload() });
  const orderId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO ebook_orders (id, ebook_id, buyer_name, buyer_email, buyer_cpf, buyer_birthdate, payment_method, amount_cents, status)
     VALUES (?, ?, 'N', 'e@e.com', '39053344705', '1990-01-01', 'pix', 2990, 'entregue')`,
  ).run(orderId, ebook.id);
  const grant = issueDownloadGrant(orderId);

  const result = consumeDownload(grant.token);
  assert.match(result.absPath, /storage[/\\]ebooks[/\\]/);
  assert.equal(db.prepare('SELECT download_count AS n FROM ebook_download_grants WHERE token = ?').get(grant.token).n, 1);
});
