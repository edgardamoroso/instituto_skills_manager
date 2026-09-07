import '../helpers/harness.js';
import { startApp, createClient, removeDbFile } from '../helpers/harness.js';
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sentMessages, clearOutbox } from '../../src/lib/mailer.js';
import { resetAll } from '../../src/middleware/rateLimit.js';

let server;
let client;

before(async () => {
  server = await startApp();
  client = createClient(server.baseUrl);
});

after(async () => {
  await server.close();
  await removeDbFile();
});

beforeEach(() => {
  clearOutbox();
  resetAll();
});

const validPayload = {
  name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '61999998888',
  subject: 'Dúvida sobre curso',
  message: 'Gostaria de saber se há turmas em janeiro.',
};

test('POST /api/contact válido → 204 e e-mail encaminhado com reply-to do remetente', async () => {
  const res = await client.post('/api/contact', { body: validPayload });

  assert.equal(res.status, 204);
  assert.equal(sentMessages.length, 1);
  const mail = sentMessages[0];
  assert.equal(mail.replyTo, 'maria@example.com');
  assert.match(mail.subject, /Dúvida sobre curso/);
  assert.match(mail.text, /Gostaria de saber/);
  assert.match(mail.text, /maria@example\.com/);
});

test('campos obrigatórios ausentes → 400 e nada enviado', async () => {
  const res = await client.post('/api/contact', { body: { name: 'Só o nome' } });

  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'CONTACT_FIELDS_REQUIRED');
  assert.equal(sentMessages.length, 0);
});

test('e-mail inválido → 400', async () => {
  const res = await client.post('/api/contact', { body: { ...validPayload, email: 'nao-e-email' } });

  assert.equal(res.status, 400);
  assert.equal(sentMessages.length, 0);
});

test('assunto/telefone são opcionais', async () => {
  const res = await client.post('/api/contact', {
    body: { name: 'João', email: 'joao@example.com', message: 'Olá!' },
  });

  assert.equal(res.status, 204);
  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0].subject, /Mensagem de João/);
});

test('rate limit por IP após 5 envios → 429', async () => {
  for (let i = 0; i < 5; i += 1) {
    const ok = await client.post('/api/contact', { body: validPayload });
    assert.equal(ok.status, 204);
  }
  const blocked = await client.post('/api/contact', { body: validPayload });
  assert.equal(blocked.status, 429);
});

test('GET /api/contact/config expõe o número do WhatsApp configurado', async () => {
  const res = await client.get('/api/contact/config');

  assert.equal(res.status, 200);
  assert.ok(Object.prototype.hasOwnProperty.call(res.body, 'whatsapp'));
});
