import { api, ApiError } from './api.js';
import { guardAdmin } from './session.js';
import { escapeHtml } from './format.js';

export async function initAdminAuthors() {
  const form = document.getElementById('author-form');
  if (!form) return;
  if (!(await guardAdmin())) return;

  const idInput = document.getElementById('author-id');
  const formTitle = document.getElementById('author-form-title');
  const list = document.getElementById('author-list');
  const count = document.getElementById('author-count');
  const feedback = document.getElementById('author-feedback');

  let authors = [];
  let editingId = null;

  function resetForm() {
    form.reset();
    idInput.value = '';
    editingId = null;
    formTitle.textContent = 'Cadastrar autor';
    document.getElementById('author-email').disabled = false;
  }

  function showFeedback(text, tone = 'ok') {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  }

  function render() {
    count.textContent = `${authors.length} ${authors.length === 1 ? 'autor' : 'autores'}`;
    list.innerHTML = authors.length
      ? authors.map((author) => `
        <article class="admin-item">
          <div>
            <strong>${escapeHtml(author.name)}</strong>
            <p>${escapeHtml(author.email)}</p>
            ${author.bio ? `<p>${escapeHtml(author.bio)}</p>` : ''}
            <span class="badge">${author.coursesCount} ${author.coursesCount === 1 ? 'curso' : 'cursos'}</span>
            <span class="badge">${author.active ? 'Ativo' : 'Inativo'}</span>
            ${author.pendingInvite ? '<span class="badge">Convite pendente</span>' : ''}
          </div>
          <div class="actions">
            <button class="action-btn edit" data-action="edit" data-id="${author.id}">Editar</button>
            <button class="action-btn lessons" data-action="reinvite" data-id="${author.id}">Reenviar convite</button>
            <button class="action-btn edit" data-action="toggle" data-id="${author.id}">${author.active ? 'Desativar' : 'Ativar'}</button>
            <button class="action-btn delete" data-action="delete" data-id="${author.id}" ${author.coursesCount ? 'disabled title="Autor com cursos"' : ''}>Excluir</button>
          </div>
        </article>`).join('')
      : '<p class="empty-state">Nenhum autor cadastrado.</p>';
  }

  async function reload() {
    authors = await api.authors();
    render();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = { name: data.get('name'), bio: data.get('bio') || '' };
    try {
      if (editingId) {
        await api.updateAuthor(editingId, payload);
        showFeedback('Autor atualizado.');
      } else {
        payload.email = data.get('email');
        await api.createAuthor(payload);
        showFeedback('Autor criado. Enviamos um e-mail com o link para ele definir a senha.');
      }
      resetForm();
      await reload();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'AUTHOR_EMAIL_IN_USE') {
        showFeedback('Já existe uma conta com esse e-mail.', 'error');
      } else if (error instanceof ApiError && error.code === 'AUTHOR_FIELDS_REQUIRED') {
        showFeedback('Informe nome e e-mail válidos.', 'error');
      } else {
        showFeedback('Não foi possível salvar o autor.', 'error');
      }
    }
  });

  document.getElementById('cancel-author-edit')?.addEventListener('click', resetForm);

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const author = authors.find((item) => item.id === button.dataset.id);
    if (!author) return;

    if (button.dataset.action === 'edit') {
      editingId = author.id;
      idInput.value = author.id;
      document.getElementById('author-name').value = author.name;
      document.getElementById('author-email').value = author.email;
      document.getElementById('author-email').disabled = true;
      document.getElementById('author-bio').value = author.bio || '';
      formTitle.textContent = 'Editar autor';
      document.getElementById('author-name').focus();
    }

    if (button.dataset.action === 'reinvite') {
      await api.reinviteAuthor(author.id);
      showFeedback(`Convite reenviado para ${author.email}.`);
    }

    if (button.dataset.action === 'toggle') {
      await api.updateAuthor(author.id, { active: !author.active });
      await reload();
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`Excluir o autor "${author.name}"?`)) return;
      try {
        await api.deleteAuthor(author.id);
        if (editingId === author.id) resetForm();
        await reload();
      } catch (error) {
        showFeedback(error instanceof ApiError && error.code === 'AUTHOR_HAS_COURSES'
          ? 'Este autor assina cursos. Reatribua os cursos antes de excluir.'
          : 'Não foi possível excluir o autor.', 'error');
      }
    }
  });

  resetForm();
  await reload();
}
