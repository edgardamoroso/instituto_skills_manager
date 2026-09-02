import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../../src/db/index.js';

let server;

before(async () => {
  server = await startApp();
});

after(async () => {
  await server.close();
  await removeDbFile();
});

test('o 11º pedido do mesmo IP em 1 hora → 429', async () => {
  // Given um eBook vendável
  const ebookId = crypto.randomUUID();
  db.prepare(
    "INSERT INTO ebooks (id, title, mode, status, price_cents, file_path, file_name) VALUES (?, 'E', 'venda_no_site', 'publicado', 1000, 'a.pdf', 'a.pdf')",
  ).run(ebookId);
  const client = createClient(server.baseUrl);
  const payload = { ebookId, name: 'N', email: 'a@b.com', phone: '1', cpf: '39053344705', birthdate: '1990-01-01', paymentMethod: 'pix' };

  // When faz 10 pedidos (limite) e depois mais um
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await client.post('/api/ebook-orders', { body: payload })).status, 201);
  }
  const eleventh = await client.post('/api/ebook-orders', { body: payload });

  // Then o 11º é barrado
  assert.equal(eleventh.status, 429);
  assert.equal(eleventh.body.error, 'RATE_LIMITED');
});
