import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidCpf, onlyDigits } from '../../src/lib/cpf.js';

test('aceita CPF válido com e sem máscara', () => {
  // Given um CPF válido conhecido
  // When validado nas duas formas
  // Then é aceito
  assert.equal(isValidCpf('390.533.447-05'), true);
  assert.equal(isValidCpf('39053344705'), true);
});

test('rejeita CPF com dígito verificador errado', () => {
  // Given um CPF com o último dígito trocado
  // When validado
  // Then é rejeitado
  assert.equal(isValidCpf('390.533.447-00'), false);
});

test('rejeita sequências de dígitos repetidos', () => {
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('00000000000'), false);
});

test('rejeita comprimento diferente de 11 dígitos', () => {
  assert.equal(isValidCpf('3905334470'), false);
  assert.equal(isValidCpf(''), false);
  assert.equal(isValidCpf(null), false);
});

test('onlyDigits remove tudo que não é dígito', () => {
  assert.equal(onlyDigits(' 390.533.447-05 '), '39053344705');
});
