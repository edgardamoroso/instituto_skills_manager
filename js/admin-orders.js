import { api, ApiError } from './api.js';
import { guardAdmin } from './session.js';
import { formatBRL, formatDate, escapeHtml, orderStatusLabel, paymentMethodLabel, cpfMask } from './format.js';

export async function initAdminOrders() {
  const list = document.getElementById('order-list');
  if (!list) return;
  if (!(await guardAdmin())) return;

  const filter = document.getElementById('order-filter');
  const feedback = document.getElementById('order-feedback');

  function show(text, tone = 'ok') {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  }

  function orderRow(order) {
    const canLink = order.status === 'aguardando_link' || order.status === 'aguardando_pagamento';
    const canPay = order.status === 'aguardando_pagamento';
    const canCancel = order.status !== 'entregue' && order.status !== 'cancelado';
    return `
      <article class="admin-item" data-order="${order.id}">
        <div>
          <strong>${escapeHtml(order.ebook.title)}</strong>
          <p>${escapeHtml(order.buyerName)} · ${escapeHtml(order.buyerEmail)} · ${escapeHtml(order.buyerPhone)}</p>
          <p>CPF ${cpfMask(order.buyerCpf)} · nasc. ${formatDate(order.buyerBirthdate)} · ${paymentMethodLabel(order.paymentMethod)} · ${formatBRL(order.amountCents)}</p>
          <span class="badge">${orderStatusLabel(order.status)}</span>
          <span class="lesson-summary">criado ${formatDate(order.createdAt)}</span>
          ${order.paymentLinkUrl ? `<p><a href="${escapeHtml(order.paymentLinkUrl)}" target="_blank" rel="noopener">link de pagamento</a></p>` : ''}
        </div>
        <div class="actions">
          ${canLink ? `<button class="action-btn edit" data-act="link">${order.paymentLinkUrl ? 'Atualizar link' : 'Registrar link'}</button>` : ''}
          ${canPay ? '<button class="action-btn lessons" data-act="paid">Marcar pago</button>' : ''}
          ${order.status === 'aguardando_pagamento' ? '<button class="action-btn" data-act="resend-payment">Reenviar link</button>' : ''}
          ${order.status === 'entregue' ? '<button class="action-btn" data-act="resend-delivery">Reenviar download</button>' : ''}
          <button class="action-btn" data-act="email">Corrigir e-mail</button>
          ${canCancel ? '<button class="action-btn delete" data-act="cancel">Cancelar</button>' : ''}
          <button class="action-btn delete" data-act="delete">Excluir (LGPD)</button>
        </div>
      </article>`;
  }

  async function reload() {
    const orders = await api.ebookOrders(filter.value || undefined);
    list.innerHTML = orders.length ? orders.map(orderRow).join('') : '<p class="empty-state">Nenhum pedido.</p>';
  }

  async function run(action, id) {
    try {
      if (action === 'link') {
        const url = window.prompt('Cole o link de pagamento gerado no Asaas:');
        if (!url) return;
        const chargeId = window.prompt('Id da cobrança no Asaas (opcional):') || '';
        await api.orderPaymentLink(id, { paymentLinkUrl: url, asaasChargeId: chargeId });
        show('Link registrado e e-mail enviado ao comprador.');
      } else if (action === 'paid') {
        if (!window.confirm('Confirmar pagamento e liberar o download?')) return;
        await api.orderMarkPaid(id);
        show('Pagamento confirmado. E-mail de entrega enviado.');
      } else if (action === 'resend-payment') {
        await api.orderResend(id, 'payment');
        show('E-mail de pagamento reenviado.');
      } else if (action === 'resend-delivery') {
        await api.orderResend(id, 'delivery');
        show('Novo link de download enviado.');
      } else if (action === 'email') {
        const email = window.prompt('Novo e-mail do comprador:');
        if (!email) return;
        await api.updateOrderEmail(id, email);
        show('E-mail atualizado.');
      } else if (action === 'cancel') {
        if (!window.confirm('Cancelar este pedido?')) return;
        await api.orderCancel(id, window.prompt('Motivo (opcional):') || '');
        show('Pedido cancelado.');
      } else if (action === 'delete') {
        if (!window.confirm('Excluir permanentemente este pedido e os dados do comprador?')) return;
        await api.deleteEbookOrder(id);
        show('Pedido excluído.');
      }
      await reload();
    } catch (error) {
      const map = { ORDER_STATE_INVALID: 'Ação não permitida para o estado atual do pedido.', PAYMENT_LINK_INVALID: 'Link de pagamento inválido (precisa ser http/https).' };
      show(error instanceof ApiError ? (map[error.code] || 'Não foi possível concluir a ação.') : 'Falha de conexão.', 'error');
    }
  }

  list.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-act]');
    if (!button) return;
    run(button.dataset.act, button.closest('[data-order]').dataset.order);
  });
  filter.addEventListener('change', reload);
  await reload();
}
