import { api, ApiError } from './api.js';
import { clearUserCache, currentUser } from './session.js';
import { escapeHtml } from './format.js';

function safeNext(raw) {
  if (!raw) return '';
  try {
    const decoded = decodeURIComponent(raw);
    if (/^[\w./?=&%-]+$/.test(decoded) && !decoded.startsWith('//')) return decoded;
  } catch {
    /* ignora */
  }
  return '';
}

async function redirectAfterAuth(user) {
  clearUserCache();
  const next = safeNext(new URLSearchParams(window.location.search).get('next'));
  if (next) {
    window.location.href = next;
    return;
  }
  window.location.href = user.role === 'admin' ? 'matriculas.html' : 'index.html';
}

const loginErrors = {
  INVALID_CREDENTIALS: 'E-mail ou senha incorretos.',
  AUTH_FIELDS_REQUIRED: 'Informe e-mail e senha.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
};

const registerErrors = {
  PASSWORD_TOO_SHORT: 'A senha precisa ter pelo menos 8 caracteres.',
  AUTH_FIELDS_REQUIRED: 'Preencha nome, e-mail e senha.',
  INVALID_EMAIL: 'Informe um e-mail válido.',
  RATE_LIMITED: 'Muitos cadastros a partir deste acesso. Tente mais tarde.',
};

export async function initLoginPage() {
  const form = document.getElementById('login-form');
  if (!form) return;
  const feedback = document.getElementById('login-feedback');

  const existing = await currentUser();
  if (existing) {
    await redirectAfterAuth(existing);
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.innerHTML = '';
    const data = new FormData(form);
    const email = data.get('email');
    try {
      const result = await api.login({ email, password: data.get('password') });
      await redirectAfterAuth(result.user);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        feedback.innerHTML = `Seu e-mail ainda não foi confirmado. `
          + `<a href="#" data-resend>Reenviar link de confirmação</a>.`;
        feedback.querySelector('[data-resend]')?.addEventListener('click', async (ev) => {
          ev.preventDefault();
          await api.resendVerification(email).catch(() => {});
          feedback.textContent = 'Se a conta existir e estiver pendente, enviamos um novo link.';
        });
        return;
      }
      feedback.textContent = error instanceof ApiError
        ? (loginErrors[error.code] || 'Não foi possível entrar. Tente novamente.')
        : 'Não foi possível entrar. Tente novamente.';
    }
  });
}

export async function initSignupPage() {
  const form = document.getElementById('signup-form');
  if (!form) return;
  const feedback = document.getElementById('signup-feedback');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = '';
    const data = new FormData(form);
    if ((data.get('password') || '').length < 8) {
      feedback.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
      return;
    }
    if (data.get('password') !== data.get('passwordConfirm')) {
      feedback.textContent = 'As senhas não coincidem.';
      return;
    }
    try {
      await api.register({
        name: data.get('name'),
        email: data.get('email'),
        phone: data.get('phone'),
        address: data.get('address'),
        password: data.get('password'),
      });
      form.reset();
      feedback.innerHTML = `Cadastro recebido. Enviamos um link de confirmação para `
        + `<strong>${escapeHtml(String(data.get('email')))}</strong>. `
        + `Abra o e-mail e clique no link para ativar sua conta.`;
    } catch (error) {
      feedback.textContent = error instanceof ApiError
        ? (registerErrors[error.code] || 'Não foi possível criar a conta.')
        : 'Não foi possível criar a conta.';
    }
  });
}

export async function initVerifyEmailPage() {
  const box = document.getElementById('verify-status');
  if (!box) return;
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) {
    box.innerHTML = '<p>Link inválido. Peça um novo pela tela de login.</p>';
    return;
  }
  try {
    const result = await api.verifyEmail(token);
    clearUserCache();
    box.innerHTML = `<p>E-mail confirmado! Você já está logado como <strong>${escapeHtml(result.user.name)}</strong>.</p>`
      + `<a class="btn btn-primary" href="${result.user.role === 'admin' ? 'matriculas.html' : 'index.html'}">Continuar</a>`;
  } catch (error) {
    const msg = error instanceof ApiError && error.code === 'VERIFICATION_INVALID'
      ? 'Este link é inválido ou expirou.'
      : 'Não foi possível confirmar o e-mail agora.';
    box.innerHTML = `<p>${msg}</p><a class="btn btn-secondary" href="login.html">Ir para o login</a>`;
  }
}
