import { api, ApiError } from './api.js';
import { requireLogin } from './session.js';
import { escapeHtml } from './format.js';

const errors = {
  CURRENT_PASSWORD_INVALID: 'A senha atual está incorreta.',
  PASSWORD_TOO_SHORT: 'A nova senha precisa ter pelo menos 8 caracteres.',
  PASSWORD_UNCHANGED: 'A nova senha precisa ser diferente da atual.',
};

export async function initAccountPage() {
  const form = document.getElementById('password-form');
  if (!form) return;
  const user = await requireLogin();
  if (!user) return;

  const identity = document.getElementById('account-identity');
  if (identity) {
    identity.innerHTML = `Você está logado como <strong>${escapeHtml(user.name)}</strong> `
      + `(${escapeHtml(user.email)}) — perfil ${user.role === 'admin' ? 'administrador' : 'aluno'}.`;
  }

  const feedback = document.getElementById('password-feedback');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = '';
    feedback.dataset.tone = 'ok';
    const data = new FormData(form);
    const next = String(data.get('newPassword') || '');
    if (next.length < 8) {
      feedback.dataset.tone = 'error';
      feedback.textContent = 'A nova senha precisa ter pelo menos 8 caracteres.';
      return;
    }
    if (next !== data.get('newPasswordConfirm')) {
      feedback.dataset.tone = 'error';
      feedback.textContent = 'A confirmação não confere.';
      return;
    }
    try {
      await api.changePassword(data.get('currentPassword'), next);
      form.reset();
      feedback.textContent = 'Senha alterada. As outras sessões foram encerradas.';
    } catch (error) {
      feedback.dataset.tone = 'error';
      feedback.textContent = error instanceof ApiError
        ? (errors[error.code] || 'Não foi possível trocar a senha.')
        : 'Não foi possível trocar a senha.';
    }
  });
}
