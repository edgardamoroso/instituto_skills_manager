// Datas em ISO curto (YYYY-MM-DD), sem fuso.
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isValidISODate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// Soma `months` meses a uma data YYYY-MM-DD, ajustando o fim do mês.
export function addMonths(iso, months) {
  const [year, month, day] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(day, lastDay));
  return base.toISOString().slice(0, 10);
}
