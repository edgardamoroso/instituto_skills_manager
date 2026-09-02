import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents, formatBRL } from '../../src/lib/money.js';
import { todayISO, isValidISODate, addMonths } from '../../src/lib/dates.js';

test('toCents converte moeda pt-BR, número e vazio', () => {
  assert.equal(toCents('R$ 1.234,56'), 123456);
  assert.equal(toCents('1234.56'), 123456);
  assert.equal(toCents(12.5), 1250);
  assert.equal(toCents(''), 0);
  assert.equal(toCents(null), 0);
  assert.equal(toCents('abc'), 0);
});

test('formatBRL formata centavos em reais', () => {
  assert.match(formatBRL(123456), /1\.234,56/);
  assert.match(formatBRL(0), /0,00/);
});

test('todayISO devolve YYYY-MM-DD', () => {
  assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('isValidISODate valida o formato e a data real', () => {
  assert.equal(isValidISODate('2026-01-15'), true);
  assert.equal(isValidISODate('2026-1-5'), false);
  assert.equal(isValidISODate('não é data'), false);
  assert.equal(isValidISODate(''), false);
  assert.equal(isValidISODate(null), false);
});

test('addMonths soma meses ajustando o fim do mês', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-01-15', 2), '2026-03-15');
  assert.equal(addMonths('2026-11-30', 3), '2027-02-28');
});
