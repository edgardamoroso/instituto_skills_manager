import { api, ApiError } from './api.js';
import { escapeHtml, classPeriod, classStatusLabel, formatDate } from './format.js';

// Turmas de um curso síncrono (editor do curso). Admin e autor criam e editam;
// a lista de inscritos (dados de alunos) é só para o admin.

const classErrors = {
  CLASS_FIELDS_REQUIRED: 'Informe o nome da turma.',
  CLASS_DATES_INVALID: 'A data de término precisa ser depois do início.',
  CLASS_START_INVALID: 'Data de início inválida.',
  CLASS_END_INVALID: 'Data de término inválida.',
  CLASS_CAPACITY_INVALID: 'Vagas: informe um número a partir de 1 (ou deixe em branco para sem limite).',
  CLASS_CAPACITY_BELOW_ENROLLED: 'Já há mais inscritos do que esse número de vagas.',
  CLASS_HAS_STUDENTS: 'Esta turma tem alunos. Troque-os de turma (em Matrículas) antes de excluir.',
};

function formMarkup() {
  return `
    <div class="panel-header">
      <h2>Turmas</h2>
      <span id="class-count" class="badge"></span>
    </div>
    <p class="field-hint">O aluno se inscreve escolhendo uma turma <strong>em formação</strong> com vaga.
      O link ou local só aparece para os inscritos.</p>
    <form id="class-form" class="lesson-form" novalidate>
      <h3 id="class-form-title">Nova turma</h3>
      <label for="class-name">Nome da turma</label>
      <input id="class-name" name="name" maxlength="120" placeholder="Ex.: Turma Novembro/2026" required />
      <div class="lesson-fields">
        <div>
          <label for="class-start">Início</label>
          <input id="class-start" name="startDate" type="date" />
        </div>
        <div>
          <label for="class-end">Término</label>
          <input id="class-end" name="endDate" type="date" />
        </div>
      </div>
      <label for="class-schedule">Dias e horário</label>
      <input id="class-schedule" name="schedule" maxlength="200" placeholder="Ex.: Terças e quintas, 19h às 21h" />
      <div class="lesson-fields">
        <div>
          <label for="class-capacity">Vagas</label>
          <input id="class-capacity" name="capacity" type="number" min="1" placeholder="Sem limite" />
        </div>
        <div>
          <label for="class-status">Status</label>
          <select id="class-status" name="status">
            <option value="em_formacao">Em formação (inscrições abertas)</option>
            <option value="em_andamento">Em andamento (inscrições fechadas)</option>
            <option value="finalizada">Finalizada</option>
          </select>
        </div>
      </div>
      <label for="class-location">Link da reunião ou local</label>
      <input id="class-location" name="location" maxlength="500" placeholder="https://meet.google.com/... ou endereço" />
      <p id="class-feedback" class="form-feedback" role="status" aria-live="polite"></p>
      <div class="lesson-actions">
        <button class="btn btn-primary" type="submit" id="class-submit">Criar turma</button>
        <button class="btn btn-secondary" type="button" id="class-cancel" hidden>Cancelar edição</button>
      </div>
    </form>
    <div id="class-list" class="lesson-list"></div>`;
}

function seatsInfo(klass) {
  return klass.capacity == null ? `${klass.enrolled} inscritos · sem limite de vagas` : `${klass.enrolled}/${klass.capacity} vagas preenchidas`;
}

function rosterMarkup(data) {
  if (!data.students.length) return '<p class="empty-state">Nenhum aluno nesta turma.</p>';
  return `
    <table class="roster">
      <thead><tr><th>Aluno</th><th>E-mail</th><th>Telefone</th><th>Matrícula</th><th>Desde</th></tr></thead>
      <tbody>
        ${data.students.map((s) => `
          <tr>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.email)}</td>
            <td>${escapeHtml(s.phone || '—')}</td>
            <td><span class="pill-status status-${s.enrollmentStatus}">${s.enrollmentStatus === 'ativa' ? 'Ativa' : 'Inativa'}</span></td>
            <td>${escapeHtml(formatDate(s.enrolledAt))}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

export async function mountClassManager(container, course, user) {
  const isAdmin = user.role === 'admin';
  container.innerHTML = formMarkup();
  const form = container.querySelector('#class-form');
  const list = container.querySelector('#class-list');
  const count = container.querySelector('#class-count');
  const feedback = container.querySelector('#class-feedback');
  const submit = container.querySelector('#class-submit');
  const cancel = container.querySelector('#class-cancel');
  const title = container.querySelector('#class-form-title');

  let classes = [];
  let editing = null;
  const openRosters = new Set();

  function showFeedback(text, tone = 'error') {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  }

  function resetForm() {
    form.reset();
    editing = null;
    title.textContent = 'Nova turma';
    submit.textContent = 'Criar turma';
    cancel.hidden = true;
  }

  async function render() {
    count.textContent = `${classes.length} ${classes.length === 1 ? 'turma' : 'turmas'}`;
    if (!classes.length) {
      list.innerHTML = '<p class="empty-state">Nenhuma turma cadastrada. Crie a primeira para abrir as inscrições.</p>';
      return;
    }
    list.innerHTML = classes.map((klass) => `
      <article class="lesson-item class-item${editing?.id === klass.id ? ' is-editing' : ''}">
        <div class="lesson-number">${klass.status === 'em_formacao' ? '🟢' : (klass.status === 'em_andamento' ? '🔵' : '⚪')}</div>
        <div class="lesson-copy">
          <strong>${escapeHtml(klass.name)}</strong>
          <p>${[classPeriod(klass), klass.schedule].filter(Boolean).map(escapeHtml).join(' · ') || 'Datas a definir'}</p>
          <span class="badge class-status-${klass.status}">${escapeHtml(classStatusLabel(klass.status))}</span>
          <span class="badge">${escapeHtml(seatsInfo(klass))}</span>
          ${klass.location ? `<p class="field-hint">Link/local: ${escapeHtml(klass.location)}</p>` : '<p class="field-hint">Sem link/local informado.</p>'}
          <div class="roster-box" data-roster="${klass.id}" ${openRosters.has(klass.id) ? '' : 'hidden'}></div>
        </div>
        <div class="actions">
          ${isAdmin ? `<button class="action-btn lessons" data-students="${klass.id}">${openRosters.has(klass.id) ? 'Ocultar inscritos' : `Inscritos (${klass.enrolled})`}</button>` : ''}
          <button class="action-btn edit" data-edit="${klass.id}">Editar</button>
          <button class="action-btn delete" data-delete="${klass.id}" ${klass.enrolled ? 'disabled title="Turma com alunos"' : ''}>Excluir</button>
        </div>
      </article>`).join('');
    for (const id of openRosters) await loadRoster(id);
  }

  async function loadRoster(classId) {
    const box = list.querySelector(`[data-roster="${classId}"]`);
    if (!box) return;
    box.hidden = false;
    box.innerHTML = '<p class="field-hint">Carregando inscritos…</p>';
    try {
      box.innerHTML = rosterMarkup(await api.classStudents(course.id, classId));
    } catch {
      box.innerHTML = '<p class="empty-state">Não foi possível carregar os inscritos.</p>';
    }
  }

  async function reload() {
    classes = await api.courseClasses(course.id);
    await render();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (!String(data.name || '').trim()) return showFeedback(classErrors.CLASS_FIELDS_REQUIRED);
    submit.disabled = true;
    try {
      const wasEditing = Boolean(editing);
      if (wasEditing) await api.updateClass(course.id, editing.id, data);
      else await api.createClass(course.id, data);
      resetForm();
      await reload();
      showFeedback(wasEditing ? 'Turma atualizada.' : 'Turma criada.', 'ok');
    } catch (error) {
      showFeedback((error instanceof ApiError && classErrors[error.code]) || 'Não foi possível salvar a turma.');
    } finally {
      submit.disabled = false;
    }
    return undefined;
  });

  cancel.addEventListener('click', async () => {
    resetForm();
    showFeedback('', 'ok');
    await render();
  });

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const id = button.dataset.edit || button.dataset.delete || button.dataset.students;
    const klass = classes.find((item) => item.id === id);
    if (!klass) return;

    if (button.dataset.students) {
      if (openRosters.has(id)) openRosters.delete(id);
      else openRosters.add(id);
      await render();
    } else if (button.dataset.edit) {
      editing = klass;
      form.elements.name.value = klass.name;
      form.elements.startDate.value = klass.startDate || '';
      form.elements.endDate.value = klass.endDate || '';
      form.elements.schedule.value = klass.schedule || '';
      form.elements.capacity.value = klass.capacity ?? '';
      form.elements.status.value = klass.status;
      form.elements.location.value = klass.location || '';
      title.textContent = `Editar turma: ${klass.name}`;
      submit.textContent = 'Salvar alterações';
      cancel.hidden = false;
      showFeedback('', 'ok');
      await render();
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (button.dataset.delete) {
      if (!window.confirm(`Excluir a turma "${klass.name}"?`)) return;
      try {
        await api.deleteClass(course.id, klass.id);
        if (editing?.id === klass.id) resetForm();
        await reload();
      } catch (error) {
        showFeedback((error instanceof ApiError && classErrors[error.code]) || 'Não foi possível excluir a turma.');
      }
    }
  });

  await reload();
}
