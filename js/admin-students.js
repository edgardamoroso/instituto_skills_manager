import { api, ApiError } from './api.js';
import { guardAdmin } from './session.js';
import { escapeHtml } from './format.js';

export async function initAdminStudents() {
  const form = document.getElementById('student-form');
  if (!form) return;
  if (!(await guardAdmin())) return;

  const idInput = document.getElementById('student-id');
  const formTitle = document.getElementById('student-form-title');
  const list = document.getElementById('student-list');
  const count = document.getElementById('student-count');
  const feedback = document.getElementById('student-feedback');
  const passwordField = document.getElementById('student-password');

  let students = [];
  let editingId = null;

  function resetForm() {
    form.reset();
    idInput.value = '';
    editingId = null;
    formTitle.textContent = 'Cadastrar aluno';
    if (passwordField) passwordField.placeholder = 'Deixe em branco para gerar automaticamente';
  }

  function showFeedback(text, tone = 'ok') {
    if (!feedback) return;
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  }

  function render() {
    count.textContent = `${students.length} ${students.length === 1 ? 'aluno' : 'alunos'}`;
    list.innerHTML = students.length
      ? students.map((student) => `
        <article class="admin-item">
          <div>
            <strong>${escapeHtml(student.name)}</strong>
            <p>${escapeHtml(student.email)}${student.phone ? ` · ${escapeHtml(student.phone)}` : ''}</p>
            ${student.address ? `<p>${escapeHtml(student.address)}</p>` : ''}
            <span class="badge">${student.enrollmentsTotal} ${student.enrollmentsTotal === 1 ? 'matrícula' : 'matrículas'}</span>
            <span class="badge">${student.enrollmentsActive} ${student.enrollmentsActive === 1 ? 'ativa' : 'ativas'}</span>
          </div>
          <div class="actions">
            <button class="action-btn edit" data-action="edit" data-id="${student.id}">Editar</button>
            <button class="action-btn lessons" data-action="reset" data-id="${student.id}">Redefinir senha</button>
            <button class="action-btn delete" data-action="delete" data-id="${student.id}">Excluir</button>
          </div>
        </article>`).join('')
      : '<p class="empty-state">Nenhum aluno cadastrado.</p>';
  }

  async function reload() {
    students = await api.students();
    render();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      name: data.get('name'),
      email: data.get('email'),
      phone: data.get('phone'),
      address: data.get('address'),
    };
    const password = (data.get('password') || '').toString().trim();
    if (password) payload.password = password;

    try {
      if (editingId) {
        await api.updateStudent(editingId, payload);
        showFeedback('Aluno atualizado.');
      } else {
        const created = await api.createStudent(payload);
        showFeedback(`Aluno criado. Senha de acesso: ${created.temporaryPassword}`);
      }
      resetForm();
      await reload();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'EMAIL_IN_USE') {
        showFeedback('Já existe uma conta com esse e-mail.', 'error');
      } else if (error instanceof ApiError && error.code === 'STUDENT_FIELDS_REQUIRED') {
        showFeedback('Informe pelo menos nome e e-mail.', 'error');
      } else {
        showFeedback('Não foi possível salvar o aluno.', 'error');
      }
    }
  });

  document.getElementById('cancel-student-edit')?.addEventListener('click', resetForm);

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const student = students.find((item) => item.id === button.dataset.id);
    if (!student) return;

    if (button.dataset.action === 'edit') {
      editingId = student.id;
      idInput.value = student.id;
      document.getElementById('student-name').value = student.name;
      document.getElementById('student-address').value = student.address || '';
      document.getElementById('student-phone').value = student.phone || '';
      document.getElementById('student-email').value = student.email;
      if (passwordField) passwordField.placeholder = 'Deixe em branco para manter a senha atual';
      formTitle.textContent = 'Editar aluno';
      document.getElementById('student-name').focus();
    }

    if (button.dataset.action === 'reset') {
      if (!window.confirm(`Gerar uma nova senha para "${student.name}"?`)) return;
      const result = await api.resetStudentPassword(student.id);
      showFeedback(`Nova senha de ${student.name}: ${result.temporaryPassword}`);
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`Excluir o aluno "${student.name}"? Matrículas e pagamentos dele também serão removidos.`)) return;
      await api.deleteStudent(student.id);
      if (editingId === student.id) resetForm();
      await reload();
    }
  });

  resetForm();
  await reload();
}
