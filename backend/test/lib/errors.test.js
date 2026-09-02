import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, gone, tooMany, notFound, conflict } from '../../src/lib/errors.js';

test('gone produz AppError 410 com o código informado', () => {
  const error = gone('DOWNLOAD_TOKEN_EXPIRED');
  assert.ok(error instanceof AppError);
  assert.equal(error.status, 410);
  assert.equal(error.code, 'DOWNLOAD_TOKEN_EXPIRED');
});

test('tooMany produz AppError 429', () => {
  const error = tooMany('DOWNLOAD_LIMIT_REACHED');
  assert.equal(error.status, 429);
  assert.equal(error.code, 'DOWNLOAD_LIMIT_REACHED');
});

test('helpers pré-existentes seguem intactos', () => {
  assert.equal(notFound('X').status, 404);
  assert.equal(conflict('Y').status, 409);
});
