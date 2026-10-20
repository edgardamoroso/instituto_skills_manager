import test from 'node:test';
import assert from 'node:assert/strict';
import { fixMojibake } from '../../src/lib/mojibake.js';

test('fixMojibake desfaz nome lido como latin1 e não mexe em nomes corretos', () => {
  const original = 'Aula 06 – Vídeo e Ação.pdf';
  const embaralhado = Buffer.from(original, 'utf8').toString('latin1');
  assert.notEqual(embaralhado, original);

  // Given um nome embaralhado → volta ao original
  assert.equal(fixMojibake(embaralhado), original);
  // e é idempotente
  assert.equal(fixMojibake(fixMojibake(embaralhado)), original);

  // Given nomes já corretos (com ou sem acento) → ficam intactos
  assert.equal(fixMojibake(original), original);
  assert.equal(fixMojibake('Vídeo.pdf'), 'Vídeo.pdf');
  assert.equal(fixMojibake('apostila.pdf'), 'apostila.pdf');
  assert.equal(fixMojibake(''), '');
});
