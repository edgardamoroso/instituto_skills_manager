import { api, ApiError } from './api.js';

const errorMessages = {
  CONTACT_FIELDS_REQUIRED: 'Preencha nome, e-mail e mensagem.',
  INVALID_EMAIL: 'Informe um e-mail válido.',
  RATE_LIMITED: 'Você enviou muitas mensagens. Aguarde alguns minutos e tente de novo.',
};

function setFeedback(node, text, tone) {
  node.textContent = text;
  if (tone) node.dataset.tone = tone;
  else delete node.dataset.tone;
}

// Monta o link wa.me com o texto do formulário (ou um texto padrão).
function whatsappLink(number, { name, subject, message }) {
  const parts = [];
  if (subject) parts.push(`Assunto: ${subject}`);
  if (message) parts.push(message);
  if (name) parts.push(`— ${name}`);
  const body = parts.join('\n') || 'Olá! Gostaria de mais informações.';
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}

export async function initContactPage() {
  const form = document.getElementById('contact-form');
  if (!form) return;
  const feedback = document.getElementById('contact-feedback');
  const waBlock = document.getElementById('contact-whatsapp');
  const waButton = document.getElementById('contact-whatsapp-link');

  const fields = () => {
    const data = new FormData(form);
    return {
      name: (data.get('name') || '').toString().trim(),
      email: (data.get('email') || '').toString().trim(),
      phone: (data.get('phone') || '').toString().trim(),
      subject: (data.get('subject') || '').toString().trim(),
      message: (data.get('message') || '').toString().trim(),
    };
  };

  let whatsappNumber = '';
  try {
    const cfg = await api.contactConfig();
    whatsappNumber = cfg?.whatsapp || '';
  } catch {
    /* sem config: segue só com o formulário */
  }

  if (whatsappNumber && waBlock && waButton) {
    const refresh = () => {
      waButton.href = whatsappLink(whatsappNumber, fields());
    };
    refresh();
    form.addEventListener('input', refresh);
    waBlock.hidden = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFeedback(feedback, '');
    const values = fields();
    if (!values.name || !values.email || !values.message) {
      setFeedback(feedback, errorMessages.CONTACT_FIELDS_REQUIRED, 'error');
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api.sendContact(values);
      form.reset();
      setFeedback(feedback, 'Mensagem enviada! Responderemos no e-mail informado.');
    } catch (error) {
      const code = error instanceof ApiError ? error.code : null;
      setFeedback(feedback, errorMessages[code] || 'Não foi possível enviar a mensagem. Tente novamente.', 'error');
    } finally {
      button.disabled = false;
    }
  });
}
