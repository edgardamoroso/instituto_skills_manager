import { str, optionalStr, email as validateEmail } from '../lib/validate.js';
import { sendMail } from '../lib/mailer.js';
import { config } from '../lib/config.js';

// Configuração pública do "Fale Conosco" (o que o frontend pode saber).
export function contactConfig() {
  return { whatsapp: config.contact.whatsapp };
}

// Recebe uma mensagem do formulário e encaminha por e-mail para o instituto.
// Não persiste nada: a mensagem vive no e-mail (com reply-to do remetente).
export async function submitContact(input = {}) {
  const name = str(input.name, { code: 'CONTACT_FIELDS_REQUIRED', min: 1, max: 120 });
  const from = validateEmail(input.email, { code: 'CONTACT_FIELDS_REQUIRED' });
  const message = str(input.message, { code: 'CONTACT_FIELDS_REQUIRED', min: 1, max: 5000 });
  const phone = optionalStr(input.phone, { max: 40 });
  const subject = optionalStr(input.subject, { max: 160 });

  const lines = [
    `Nome: ${name}`,
    `E-mail: ${from}`,
    phone ? `Telefone: ${phone}` : null,
    subject ? `Assunto: ${subject}` : null,
    '',
    message,
  ].filter((line) => line !== null);

  await sendMail({
    to: config.contact.email,
    replyTo: from,
    subject: subject ? `[Fale Conosco] ${subject}` : `[Fale Conosco] Mensagem de ${name}`,
    text: lines.join('\n'),
  });
}
