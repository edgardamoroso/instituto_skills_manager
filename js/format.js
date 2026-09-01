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
