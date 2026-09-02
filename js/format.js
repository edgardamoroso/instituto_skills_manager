export function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).slice(0, 10).split('-');
  if (!day) return iso;
  return `${day}/${month}/${year}`;
}

export function courseTypeLabel(type) {
  return type === 'gravado' ? 'Assíncrono' : 'Síncrono';
}

export function ebookModeLabel(mode) {
  return mode === 'link_externo' ? 'Loja externa' : 'Venda no site';
}

export function orderStatusLabel(status) {
  return {
    aguardando_link: 'Aguardando link',
    aguardando_pagamento: 'Aguardando pagamento',
    pago: 'Pago',
    entregue: 'Entregue',
    cancelado: 'Cancelado',
  }[status] || status;
}

export function paymentMethodLabel(method) {
  return { pix: 'PIX', credito: 'Cartão de crédito', debito: 'Cartão de débito' }[method] || method;
}

// Rótulo do botão de loja externa a partir do domínio da URL.
export function storeButtonLabel(url, storeName) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (host.includes('amazon')) return 'Comprar na Amazon';
    if (storeName) return `Comprar em ${storeName}`;
    return `Comprar em ${host}`;
  } catch {
    return storeName ? `Comprar em ${storeName}` : 'Comprar';
  }
}

// Máscara progressiva de CPF (000.000.000-00).
export function cpfMask(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
}

export function paymentStatusLabel(status) {
  return { paga: 'Paga', pendente: 'Pendente', atrasada: 'Atrasada' }[status] || status;
}

// Só permite http(s) e caminhos internos (/uploads/...). Bloqueia javascript:, data:, etc.
export function safeUrl(value) {
  const text = String(value ?? '').trim();
  if (text.startsWith('/')) return text;
  try {
    const url = new URL(text, window.location.origin);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    /* inválida */
  }
  return '#';
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}
