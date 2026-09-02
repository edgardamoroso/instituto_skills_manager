import test from 'node:test';
import assert from 'node:assert/strict';
import { str, optionalStr, email, int, isoDate, oneOf, httpUrl } from '../../src/lib/validate.js';

test('str: respeita min/max e trim; código do erro', () => {
  assert.equal(str('  abc  ', { min: 1, max: 10 }), 'abc');
  assert.equal(str('abc', { trim: false, min: 3, max: 3 }), 'abc');
  assert.throws(() => str('', { min: 1, code: 'X' }), /X/);
  assert.throws(() => str('longo demais', { max: 3 }), /INVALID_FIELD/);
  assert.equal(str(null, { min: 0 }), '');
});

test('optionalStr: trunca no máximo e nunca lança', () => {
  assert.equal(optionalStr('abcdef', { max: 3 }), 'abc');
  assert.equal(optionalStr(null), '');
  assert.equal(optionalStr('  x  '), 'x');
});

test('email: normaliza e valida formato', () => {
  assert.equal(email('  Foo@Bar.COM '), 'foo@bar.com');
  assert.throws(() => email('semarroba'), /INVALID_EMAIL/);
  assert.throws(() => email(''), /INVALID_EMAIL/);
  assert.throws(() => email('a@b'), /INVALID_EMAIL/);
});

test('int: parseia, valida faixa e tipo', () => {
  assert.equal(int('42', { min: 0, max: 100 }), 42);
  assert.equal(int(7), 7);
  assert.throws(() => int('abc'), /INVALID_NUMBER/);
  assert.throws(() => int('5', { min: 10 }), /INVALID_NUMBER/);
  assert.throws(() => int('50', { max: 10 }), /INVALID_NUMBER/);
});

test('isoDate: aceita YYYY-MM-DD válido; recusa o resto', () => {
  assert.equal(isoDate('2026-03-15'), '2026-03-15');
  assert.throws(() => isoDate('15/03/2026'), /INVALID_DATE/);
  assert.throws(() => isoDate('2026-13-40'), /INVALID_DATE/);
  assert.throws(() => isoDate(''), /INVALID_DATE/);
});

test('oneOf: aceita valores permitidos e recusa fora da lista', () => {
  assert.equal(oneOf('a', ['a', 'b']), 'a');
  assert.throws(() => oneOf('c', ['a', 'b']), /INVALID_OPTION/);
  assert.throws(() => oneOf(undefined, ['a'], { code: 'NOPE' }), /NOPE/);
});

test('httpUrl: só http(s); rejeita esquema perigoso, relativo e vazio', () => {
  assert.equal(httpUrl('https://exemplo.com/x'), 'https://exemplo.com/x');
  assert.equal(httpUrl('http://a.b'), 'http://a.b/');
  assert.throws(() => httpUrl('javascript:alert(1)'), /INVALID_URL/);
  assert.throws(() => httpUrl('/caminho/relativo'), /INVALID_URL/);
  assert.throws(() => httpUrl(''), /INVALID_URL/);
  assert.throws(() => httpUrl('x'.repeat(3000)), /INVALID_URL/);
});
