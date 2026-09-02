import { api, ApiError } from './api.js';
import { requireLogin } from './session.js';
import { escapeHtml, formatDate } from './format.js';

async function renderMyEbooks() {
  const box = document.getElementById('my-ebooks');
  const list = document.getElementById('my-ebooks-list');
  if (!box || !list) return;
  let orders = [];
  try {
    orders = await api.myEbookOrders();
  } catch {
    return;
  }
  if (!orders.length) return;
  box.hidden = false;
  list.innerHTML = orders.map((order) => `
    <article class="admin-item" data-order="${order.id}">
      <div>
        <strong>${escapeHtml(order.ebook.title)}</strong>
        <p>Entregue em ${formatDate(order.deliveredAt)}</p>
      </div>
      <div class="actions">
        <button class="action-btn edit" data-download="${order.id}">Gerar link de download</button>
      </div>
    </article>`).join('');

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-download]');
    if (!button) return;
    const feedback = document.getElementById('my-ebooks-feedback');
    try {
      const { url } = await api.myEbookDownload(button.dataset.download);
      window.open(url, '_blank', 'noopener');
      feedback.textContent = 'Link aberto em nova aba. Ele expira em algumas horas.';
      feedback.dataset.tone = 'ok';
    } catch {
      feedback.textContent = 'Não foi possível gerar o link agora.';
      feedback.dataset.tone = 'error';
    }
  });
}

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

  const roleLabels = { admin: 'administrador', author: 'autor', student: 'aluno' };
  const identity = document.getElementById('account-identity');
  if (identity) {
    identity.innerHTML = `Você está logado como <strong>${escapeHtml(user.name)}</strong> `
      + `(${escapeHtml(user.email)}) — perfil ${roleLabels[user.role] || 'aluno'}.`;
  }

  const feedback = document.getElementById('password-feedback');

  renderMyEbooks();

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
