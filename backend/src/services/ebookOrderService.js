import crypto from 'node:crypto';
import { db, transaction } from '../db/index.js';
import { badRequest, notFound, conflict } from '../lib/errors.js';
import { str, email as validateEmail, oneOf, isoDate } from '../lib/validate.js';
import { isValidCpf, onlyDigits } from '../lib/cpf.js';
import { sendMail } from '../lib/mailer.js';
import { config } from '../lib/config.js';
import { issueDownloadGrant, expireDownloadGrants } from './ebookService.js';

const getEbookStmt = db.prepare('SELECT id, title, mode, status, price_cents FROM ebooks WHERE id = ?');
const insertStmt = db.prepare(
  `INSERT INTO ebook_orders (id, ebook_id, buyer_name, buyer_email, buyer_phone, buyer_cpf, buyer_birthdate,
     payment_method, amount_cents, status)
   VALUES (@id, @ebook_id, @buyer_name, @buyer_email, @buyer_phone, @buyer_cpf, @buyer_birthdate,
     @payment_method, @amount_cents, 'aguardando_link')`,
);
const getStmt = db.prepare('SELECT * FROM ebook_orders WHERE id = ?');
const listStmt = db.prepare('SELECT * FROM ebook_orders ORDER BY created_at DESC');
const listByStatusStmt = db.prepare('SELECT * FROM ebook_orders WHERE status = ? ORDER BY created_at DESC');
const listMineStmt = db.prepare(
  "SELECT * FROM ebook_orders WHERE status = 'entregue' AND lower(buyer_email) = lower(?) ORDER BY delivered_at DESC",
);
const setLinkStmt = db.prepare(
  "UPDATE ebook_orders SET payment_link_url = ?, asaas_charge_id = ?, status = 'aguardando_pagamento', updated_at = datetime('now') WHERE id = ?",
);
const setPaidStmt = db.prepare("UPDATE ebook_orders SET status = 'pago', paid_at = datetime('now'), updated_at = datetime('now') WHERE id = ?");
const setDeliveredStmt = db.prepare("UPDATE ebook_orders SET status = 'entregue', delivered_at = datetime('now'), updated_at = datetime('now') WHERE id = ?");
const setCancelledStmt = db.prepare("UPDATE ebook_orders SET status = 'cancelado', cancelled_at = datetime('now'), status_reason = ?, updated_at = datetime('now') WHERE id = ?");
const setEmailStmt = db.prepare("UPDATE ebook_orders SET buyer_email = ?, updated_at = datetime('now') WHERE id = ?");
const deleteStmt = db.prepare('DELETE FROM ebook_orders WHERE id = ?');

const TRANSITIONS = {
  aguardando_link: ['aguardando_pagamento', 'cancelado'],
  aguardando_pagamento: ['aguardando_pagamento', 'pago', 'cancelado'],
  pago: ['entregue'],
  entregue: [],
  cancelado: [],
};

export function assertTransition(from, to) {
  if (!TRANSITIONS[from] || !TRANSITIONS[from].includes(to)) throw conflict('ORDER_STATE_INVALID');
}

function ebookRef(ebookId) {
  const row = getEbookStmt.get(ebookId);
  return row ? { id: row.id, title: row.title } : { id: ebookId, title: '(removido)' };
}

function baseApi(row) {
  return {
    id: row.id,
    ebook: ebookRef(row.ebook_id),
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    buyerPhone: row.buyer_phone,
    paymentMethod: row.payment_method,
    amountCents: row.amount_cents,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function adminApi(row) {
  return {
    ...baseApi(row),
    buyerCpf: row.buyer_cpf,
    buyerBirthdate: row.buyer_birthdate,
    paymentLinkUrl: row.payment_link_url || null,
    asaasChargeId: row.asaas_charge_id || null,
    statusReason: row.status_reason || '',
    paidAt: row.paid_at,
    deliveredAt: row.delivered_at,
    cancelledAt: row.cancelled_at,
  };
}

function mineApi(row) {
  const ebook = getEbookStmt.get(row.ebook_id);
  return {
    id: row.id,
    ebook: { id: row.ebook_id, title: ebook?.title ?? '(removido)', coverUrl: null },
    status: 'entregue',
    deliveredAt: row.delivered_at,
  };
}

export function createOrder(input = {}) {
  const ebook = getEbookStmt.get(String(input.ebookId || ''));
  if (!ebook || ebook.status !== 'publicado' || ebook.mode !== 'venda_no_site') {
    throw badRequest('ORDER_EBOOK_NOT_SELLABLE');
  }
  const cpf = onlyDigits(input.cpf);
  if (!isValidCpf(cpf)) throw badRequest('ORDER_CPF_INVALID');
  const birthdate = isoDate(input.birthdate, { code: 'ORDER_BIRTHDATE_INVALID' });
  if (Date.parse(birthdate) > Date.now()) throw badRequest('ORDER_BIRTHDATE_INVALID');

  const row = {
    id: crypto.randomUUID(),
    ebook_id: ebook.id,
    buyer_name: str(input.name, { code: 'ORDER_FIELDS_REQUIRED', min: 1, max: 120 }),
    buyer_email: validateEmail(input.email, { code: 'ORDER_FIELDS_REQUIRED' }),
    buyer_phone: str(input.phone, { code: 'ORDER_FIELDS_REQUIRED', min: 1, max: 40 }),
    buyer_cpf: cpf,
    buyer_birthdate: birthdate,
    payment_method: oneOf(input.paymentMethod, ['pix', 'credito', 'debito'], { code: 'ORDER_FIELDS_REQUIRED' }),
    amount_cents: ebook.price_cents,
  };
  insertStmt.run(row);
  return { id: row.id, status: 'aguardando_link' };
}

export function listOrders({ status } = {}) {
  const rows = status ? listByStatusStmt.all(status) : listStmt.all();
  return rows.map(adminApi);
}

export function getOrder(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('ORDER_NOT_FOUND');
  return adminApi(row);
}

function loadOrder(id) {
  const row = getStmt.get(id);
  if (!row) throw notFound('ORDER_NOT_FOUND');
  return row;
}

function paymentEmail(row) {
  sendMail({
    to: row.buyer_email,
    subject: 'Seu link de pagamento — Instituto Skills Manager',
    text: `Olá, ${row.buyer_name}.\n\nPague o eBook "${ebookRef(row.ebook_id).title}" por este link:\n${row.payment_link_url}\n\nApós a confirmação enviaremos o arquivo para download.`,
  });
}

function deliveryEmail(row, grant) {
  sendMail({
    to: row.buyer_email,
    subject: 'Seu eBook está pronto — Instituto Skills Manager',
    text: `Olá, ${row.buyer_name}.\n\nPagamento confirmado. Baixe "${ebookRef(row.ebook_id).title}" aqui:\n${grant.url}\n\nO link expira em ${config.ebook.downloadTtlHours} horas e permite até ${config.ebook.maxDownloads} downloads.`,
  });
}

export function attachPaymentLink(id, { paymentLinkUrl, asaasChargeId } = {}) {
  const row = loadOrder(id);
  assertTransition(row.status, 'aguardando_pagamento');
  const url = String(paymentLinkUrl || '').trim();
  if (!/^https?:\/\//i.test(url) || url.length > 2000) throw badRequest('PAYMENT_LINK_INVALID');
  setLinkStmt.run(url, String(asaasChargeId || '').slice(0, 60), id);
  paymentEmail(getStmt.get(id));
  return getOrder(id);
}

export function markPaid(id) {
  const row = loadOrder(id);
  assertTransition(row.status, 'pago');
  const grant = transaction(() => {
    setPaidStmt.run(id);
    const created = issueDownloadGrant(id);
    setDeliveredStmt.run(id);
    return created;
  });
  deliveryEmail(getStmt.get(id), grant);
  return getOrder(id);
}

export function cancelOrder(id, reason = '') {
  const row = loadOrder(id);
  assertTransition(row.status, 'cancelado');
  setCancelledStmt.run(String(reason || '').slice(0, 300), id);
  return getOrder(id);
}

export function updateBuyerEmail(id, emailInput) {
  loadOrder(id);
  const clean = validateEmail(emailInput, { code: 'ORDER_FIELDS_REQUIRED' });
  setEmailStmt.run(clean, id);
  return getOrder(id);
}

export function resendOrderEmail(id, kind) {
  const row = loadOrder(id);
  if (kind === 'payment') {
    if (!row.payment_link_url) throw badRequest('ORDER_STATE_INVALID');
    paymentEmail(row);
    return;
  }
  if (kind === 'delivery') {
    if (row.status !== 'entregue') throw badRequest('ORDER_STATE_INVALID');
    expireDownloadGrants(id);
    deliveryEmail(row, issueDownloadGrant(id));
    return;
  }
  throw badRequest('ORDER_FIELDS_REQUIRED');
}

export function deleteOrder(id) {
  loadOrder(id);
  deleteStmt.run(id);
}

export function listMyDeliveredOrders(email) {
  return listMineStmt.all(String(email || '')).map(mineApi);
}

export function issueMyDownload(orderId, email) {
  const row = getStmt.get(orderId);
  if (!row || row.status !== 'entregue' || row.buyer_email.toLowerCase() !== String(email || '').toLowerCase()) {
    throw notFound('ORDER_NOT_FOUND');
  }
  const grant = issueDownloadGrant(orderId);
  return { url: grant.url, expiresAt: grant.expiresAt };
}
