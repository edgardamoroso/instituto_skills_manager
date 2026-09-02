import '../helpers/harness.js';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendMail, sentMessages, clearOutbox } from '../../src/lib/mailer.js';

beforeEach(() => {
  clearOutbox();
});

test('sem SMTP, sendMail registra a mensagem na outbox e não lança', async () => {
  // Given nenhum SMTP configurado (harness força SMTP_HOST vazio)
  // When enviamos um e-mail
  await sendMail({ to: 'aluno@example.com', subject: 'Olá', text: 'corpo' });

  // Then a mensagem fica disponível para inspeção
  assert.equal(sentMessages.length, 1);
  assert.deepEqual(sentMessages[0], { to: 'aluno@example.com', subject: 'Olá', text: 'corpo' });
});

test('clearOutbox esvazia a outbox', async () => {
  // Given uma mensagem na outbox
  await sendMail({ to: 'a@b.com', subject: 's', text: 't' });
  assert.equal(sentMessages.length, 1);

  // When limpamos
  clearOutbox();

  // Then a outbox fica vazia
  assert.equal(sentMessages.length, 0);
});

test('usa html como corpo quando não há text', async () => {
  // Given um e-mail só com html
  // When enviado
  await sendMail({ to: 'a@b.com', subject: 's', html: '<p>oi</p>' });

  // Then o corpo registrado é o html
  assert.equal(sentMessages[0].text, '<p>oi</p>');
});
