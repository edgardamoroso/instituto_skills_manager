import { config } from './config.js';

let transportPromise = null;

// Outbox em memória: quando não há SMTP, cada e-mail "enviado" é registrado aqui
// (além do log) para inspeção em testes.
export const sentMessages = [];

export function clearOutbox() {
  sentMessages.length = 0;
}

async function getTransport() {
  if (!config.smtp.host) return null;
  if (!transportPromise) {
    transportPromise = import('nodemailer').then((mod) =>
      mod.default.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      }),
    );
  }
  return transportPromise;
}

// Envia e-mail. Sem SMTP configurado, registra no log e na outbox (dev/homologação/testes).
export async function sendMail({ to, subject, text, html }) {
  const transport = await getTransport();
  if (!transport) {
    sentMessages.push({ to, subject, text: text || html || '' });
    console.log('----------------------------------------------------------');
    console.log(`[e-mail simulado] para: ${to}`);
    console.log(`assunto: ${subject}`);
    console.log(text || html);
    console.log('----------------------------------------------------------');
    return;
  }
  try {
    await transport.sendMail({ from: config.smtp.from, to, subject, text, html });
  } catch (error) {
    console.error('Falha ao enviar e-mail:', error.message);
  }
}
