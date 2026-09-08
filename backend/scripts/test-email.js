// Teste rápido de SMTP (Brevo). Uso:
//   cd backend && node scripts/test-email.js seu-email@exemplo.com
// Lê backend/.env automaticamente. Ao contrário do app, este script FALHA
// visivelmente se o Brevo recusar a conexão ou o envio.
import nodemailer from 'nodemailer';
import { config } from '../src/lib/config.js';

const to = process.argv[2] || config.contact.email;

if (!config.smtp.host) {
  console.error('SMTP_HOST vazio no backend/.env — nada a testar.');
  process.exit(1);
}

console.log('Servidor :', `${config.smtp.host}:${config.smtp.port}`);
console.log('Login    :', config.smtp.user || '(vazio!)');
console.log('De       :', config.smtp.from);
console.log('Para     :', to, '\n');

const transport = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  secure: config.smtp.port === 465,
  auth: { user: config.smtp.user, pass: config.smtp.pass },
});

try {
  await transport.verify();
  console.log('✓ Conexão e login OK (transport.verify).');
} catch (error) {
  console.error('✗ Falha na conexão/login:', error.message);
  process.exit(1);
}

try {
  const info = await transport.sendMail({
    from: config.smtp.from,
    to,
    subject: 'Teste de SMTP — Instituto Skills Manager',
    text: 'Se você recebeu este e-mail, o Brevo está configurado corretamente.',
  });
  console.log('✓ Enviado. messageId:', info.messageId);
  console.log('  Resposta do servidor:', info.response);
  console.log('\nConfira a caixa de entrada (e o spam).');
} catch (error) {
  console.error('✗ Falha ao enviar:', error.message);
  console.error('  Causas comuns: remetente (SMTP_FROM) não verificado no Brevo,');
  console.error('  ou SMTP key errada.');
  process.exit(1);
}
