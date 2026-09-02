import '../helpers/harness.js';
import { removeDbFile } from '../helpers/harness.js';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/db/index.js';
import { createEbook } from '../../src/services/ebookService.js';
import { createOrder, assertTransition, adminApi } from '../../src/services/ebookOrderService.js';

after(async () => removeDbFile());

const VALID_CPF = '39053344705';

function makeSellable(priceCents = 3990) {
  // cria rascunho e publica via SQL direto (evita mexer com upload aqui)
  const draft = createEbook({ title: 'Vendável', description: 'd', mode: 'venda_no_site', priceCents: String(priceCents) });
  db.prepare("UPDATE ebooks SET status = 'publicado', file_path = 'x.pdf', file_name = 'x.pdf' WHERE id = ?").run(draft.id);
  return draft.id;
}

test('assertTransition: aceita as válidas e recusa as inválidas', () => {
  assert.doesNotThrow(() => assertTransition('aguardando_link', 'aguardando_pagamento'));
  assert.doesNotThrow(() => assertTransition('aguardando_pagamento', 'pago'));
  assert.doesNotThrow(() => assertTransition('pago', 'entregue'));
  assert.throws(() => assertTransition('aguardando_link', 'pago'), /ORDER_STATE_INVALID/);
  assert.throws(() => assertTransition('entregue', 'cancelado'), /ORDER_STATE_INVALID/);
  assert.throws(() => assertTransition('cancelado', 'aguardando_pagamento'), /ORDER_STATE_INVALID/);
});

test('createOrder: CPF inválido → ORDER_CPF_INVALID', () => {
  const ebookId = makeSellable();
  assert.throws(
    () => createOrder({ ebookId, name: 'N', email: 'a@b.com', phone: '1', cpf: '11111111111', birthdate: '1990-01-01', paymentMethod: 'pix' }),
    /ORDER_CPF_INVALID/,
  );
});

test('createOrder: nascimento no futuro → ORDER_BIRTHDATE_INVALID', () => {
  const ebookId = makeSellable();
  assert.throws(
    () => createOrder({ ebookId, name: 'N', email: 'a@b.com', phone: '1', cpf: VALID_CPF, birthdate: '2999-01-01', paymentMethod: 'pix' }),
    /ORDER_BIRTHDATE_INVALID/,
  );
});

test('createOrder: eBook link_externo → ORDER_EBOOK_NOT_SELLABLE', () => {
  const ebook = createEbook({ title: 'Ext', mode: 'link_externo', status: 'publicado', externalUrl: 'https://a.com/x' });
  assert.throws(
    () => createOrder({ ebookId: ebook.id, name: 'N', email: 'a@b.com', phone: '1', cpf: VALID_CPF, birthdate: '1990-01-01', paymentMethod: 'pix' }),
    /ORDER_EBOOK_NOT_SELLABLE/,
  );
});

test('createOrder: grava snapshot do preço e status inicial', () => {
  const ebookId = makeSellable(7777);
  const { id, status } = createOrder({ ebookId, name: 'Marina', email: 'M@Ex.com', phone: '(61) 9', cpf: '390.533.447-05', birthdate: '1990-04-12', paymentMethod: 'credito' });
  assert.equal(status, 'aguardando_link');
  const row = db.prepare('SELECT * FROM ebook_orders WHERE id = ?').get(id);
  assert.equal(row.amount_cents, 7777);
  assert.equal(row.buyer_email, 'm@ex.com');
  assert.equal(row.buyer_cpf, VALID_CPF);
  assert.equal(row.payment_method, 'credito');
});

test('adminApi expõe CPF e nascimento (contrato admin)', () => {
  const ebookId = makeSellable();
  const { id } = createOrder({ ebookId, name: 'N', email: 'a@b.com', phone: '1', cpf: VALID_CPF, birthdate: '1990-01-01', paymentMethod: 'pix' });
  const row = db.prepare('SELECT * FROM ebook_orders WHERE id = ?').get(id);
  const api = adminApi(row);
  assert.equal(api.buyerCpf, VALID_CPF);
  assert.equal(api.buyerBirthdate, '1990-01-01');
  assert.equal(api.paymentLinkUrl, null);
});
