import test from 'node:test';
import assert from 'node:assert/strict';

// Este arquivo mexe em process.env antes de importar config; não usa o harness.
process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = '';

test('config de eBook aplica defaults', async () => {
  // Given nenhuma variável EBOOK_* definida
  delete process.env.EBOOK_DOWNLOAD_MAX;
  delete process.env.EBOOK_DOWNLOAD_TTL_HOURS;

  // When carregamos a config
  const { config } = await import('../../src/lib/config.js?case=defaults');

  // Then usa 72 h / 5 downloads / 50 MB e um storageDir absoluto
  assert.equal(config.ebook.downloadTtlHours, 72);
  assert.equal(config.ebook.maxDownloads, 5);
  assert.equal(config.ebook.maxFileMb, 50);
  assert.ok(config.ebook.storageDir.endsWith('storage/ebooks') || config.ebook.storageDir.endsWith('storage\\ebooks'));
});

test('EBOOK_DOWNLOAD_MAX sobrepõe o default', async () => {
  // Given a variável definida
  process.env.EBOOK_DOWNLOAD_MAX = '3';

  // When carregamos a config num módulo novo
  const { config } = await import('../../src/lib/config.js?case=override');

  // Then o valor do ambiente vence
  assert.equal(config.ebook.maxDownloads, 3);
});
