import { api, ApiError } from './api.js';
import { clearUserCache } from './session.js';

export async function initSetPasswordPage() {
  const form = document.getElementById('set-password-form');
  if (!form) return;

  const feedback = document.getElementById('set-password-feedback');
  const token = new URLSearchParams(window.location.search).get('token') || '';

  if (!token) {
    feedback.textContent = 'Link inválido. Peça um novo convite ao administrador.';
    feedback.dataset.tone = 'error';
    form.hidden = true;
    return;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const password = String(data.get('password') || '');
    const confirm = String(data.get('confirm') || '');
    if (password.length < 8) {
      feedback.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
      feedback.dataset.tone = 'error';
      return;
    }
    if (password !== confirm) {
      feedback.textContent = 'As senhas não conferem.';
      feedback.dataset.tone = 'error';
      return;
    }
    try {
      await api.setPassword(token, password);
      clearUserCache();
      window.location.href = 'conta.html';
    } catch (error) {
      feedback.dataset.tone = 'error';
      if (error instanceof ApiError && error.code === 'PASSWORD_SET_INVALID') {
        feedback.textContent = 'Este link expirou ou já foi usado. Peça um novo convite.';
      } else if (error instanceof ApiError && error.code === 'PASSWORD_TOO_SHORT') {
        feedback.textContent = 'A senha precisa ter entre 8 e 200 caracteres.';
      } else {
        feedback.textContent = 'Não foi possível definir a senha agora.';
      }
    }
  });
}
