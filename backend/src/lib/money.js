// Converte "R$ 1.234,56", "1234.56", 1234.56 -> 123456 (centavos)
export function toCents(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Math.round(value * 100);
  let text = String(value).trim().replace(/[R$\s ]/gi, '');
  if (text.includes(',')) {
    text = text.replace(/\./g, '').replace(',', '.');
  }
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

export function formatBRL(cents) {
  return (Number(cents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}
