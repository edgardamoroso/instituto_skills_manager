import { Router } from 'express';
import {
  createOrder,
  listOrders,
  getOrder,
  attachPaymentLink,
  markPaid,
  cancelOrder,
  updateBuyerEmail,
  resendOrderEmail,
  deleteOrder,
  listMyDeliveredOrders,
  issueMyDownload,
} from '../services/ebookOrderService.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { oneOf } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();
const orderLimiter = rateLimit({ name: 'ebook-order-ip', limit: 10, windowMs: 60 * 60 * 1000 });

router.post('/', orderLimiter, wrap((request, response) => {
  const result = createOrder(request.body || {});
  audit('ebook_order.create', { request, target: result.id, detail: String(request.body?.ebookId || '') });
  response.status(201).json(result);
}));

router.get('/', requireAdmin, wrap((request, response) => {
  const status = request.query.status
    ? oneOf(request.query.status, ['aguardando_link', 'aguardando_pagamento', 'pago', 'entregue', 'cancelado'])
    : undefined;
  response.json(listOrders({ status }));
}));

router.get('/mine', requireAuth, wrap((request, response) => {
  response.json(listMyDeliveredOrders(request.user.email));
}));

router.post('/mine/:orderId/download', requireAuth, wrap((request, response) => {
  response.json(issueMyDownload(request.params.orderId, request.user.email));
}));

router.get('/:orderId', requireAdmin, wrap((request, response) => response.json(getOrder(request.params.orderId))));

router.post('/:orderId/payment-link', requireAdmin, wrap((request, response) => {
  const order = attachPaymentLink(request.params.orderId, {
    paymentLinkUrl: request.body?.paymentLinkUrl,
    asaasChargeId: request.body?.asaasChargeId,
  });
  audit('ebook_order.payment_link', { request, target: order.id });
  response.json(order);
}));

router.post('/:orderId/mark-paid', requireAdmin, wrap((request, response) => {
  const order = markPaid(request.params.orderId);
  audit('ebook_order.paid', { request, target: order.id });
  audit('ebook_order.delivered', { request, target: order.id });
  response.json(order);
}));

router.post('/:orderId/cancel', requireAdmin, wrap((request, response) => {
  const order = cancelOrder(request.params.orderId, request.body?.reason);
  audit('ebook_order.cancel', { request, target: order.id });
  response.json(order);
}));

router.post('/:orderId/resend', requireAdmin, wrap((request, response) => {
  const kind = oneOf(request.body?.kind, ['payment', 'delivery']);
  resendOrderEmail(request.params.orderId, kind);
  audit('ebook_order.resend', { request, target: request.params.orderId, detail: kind });
  response.status(204).end();
}));

router.patch('/:orderId', requireAdmin, wrap((request, response) => {
  const order = updateBuyerEmail(request.params.orderId, request.body?.buyerEmail);
  audit('ebook_order.update', { request, target: order.id });
  response.json(order);
}));

router.delete('/:orderId', requireAdmin, wrap((request, response) => {
  deleteOrder(request.params.orderId);
  audit('ebook_order.delete', { request, target: request.params.orderId });
  response.status(204).end();
}));

export default router;
