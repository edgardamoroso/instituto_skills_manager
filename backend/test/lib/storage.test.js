import '../helpers/harness.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { saveProtected, resolveProtected, removeProtected, ensureStorage } from '../../src/lib/storage.js';

test('saveProtected move o arquivo para o storage e devolve caminho relativo', () => {
  // Given um arquivo temporário
  const tmp = path.join(os.tmpdir(), `up-${crypto.randomUUID()}.pdf`);
  writeFileSync(tmp, 'conteudo');

  // When salvo no storage protegido
  const rel = saveProtected(tmp, '.pdf');

  // Then retorna caminho relativo e o arquivo existe no destino; o temporário sumiu
  assert.match(rel, /^[0-9a-f-]+\.pdf$/);
  assert.ok(existsSync(resolveProtected(rel)));
  assert.equal(existsSync(tmp), false);

  removeProtected(rel);
  assert.equal(existsSync(resolveProtected(rel)), false);
});

test('resolveProtected recusa path traversal', () => {
  // Given caminhos que tentam escapar do storageDir
  // When resolvidos
  // Then lançam EBOOK_FILE_PATH_INVALID
  assert.throws(() => resolveProtected('../secret.txt'), /EBOOK_FILE_PATH_INVALID/);
  assert.throws(() => resolveProtected('../../etc/passwd'), /EBOOK_FILE_PATH_INVALID/);
});

test('resolveProtected aceita nome de arquivo simples e normaliza barra inicial', () => {
  // Given um nome relativo válido (com barra inicial acidental)
  // When resolvido
  // Then produz um caminho dentro do storage
  ensureStorage();
  const abs = resolveProtected('/abc123.epub');
  assert.ok(abs.endsWith(`${path.sep}abc123.epub`));
});

test('removeProtected em caminho vazio é no-op', () => {
  assert.doesNotThrow(() => removeProtected(''));
});
