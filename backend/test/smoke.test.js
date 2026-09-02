import './helpers/harness.js';
import { startApp, removeDbFile } from './helpers/harness.js';
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

let server;

before(async () => {
  server = await startApp();
});

after(async () => {
  await server.close();
  await removeDbFile();
});

test('GET /health responde status ok', async () => {
  // Given um app recém-iniciado com banco temporário
  // When consultamos o health check
  const response = await fetch(`${server.baseUrl}/health`);

  // Then responde 200 com o corpo esperado
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('o schema foi aplicado no banco temporário (cursos semeados existem)', async () => {
  // Given o primeiro boot semeia 4 cursos
  // When listamos os cursos pela API pública
  const response = await fetch(`${server.baseUrl}/api/courses`);
  const body = await response.json();

  // Then a listagem funciona e traz os cursos semeados
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
  assert.equal(body.length, 4);
});
