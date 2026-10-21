import { api, ApiError } from './api.js';
import { guardCourseEditor } from './session.js';
import { formatBRL, courseTypeLabel, courseStatusLabel, escapeHtml, descriptionExcerpt } from './format.js';

const HAS_HTML_TAG = /<[a-z][\s\S]*>/i;

// Alinhamento como CLASSE (ql-align-*), não estilo inline — o CSP do site
// bloqueia atributos style="" (style-src sem unsafe-inline), então
// text-align inline nunca seria aplicado. Classe não tem essa restrição.
let alignRegistered = false;
function makeDescriptionEditor(container) {
  if (!container || !window.Quill) return null;
  if (!alignRegistered) {
    window.Quill.register(window.Quill.import('attributors/class/align'), true);
    alignRegistered = true;
  }
  return new window.Quill(container, {
    theme: 'snow',
    placeholder: 'Descreva o curso: objetivos, para quem é indicado, o que o aluno vai aprender…',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        [{ align: [] }],
        ['clean'],
      ],
    },
  });
}

function setDescriptionEditor(quill, raw) {
  if (!quill) return;
  quill.setText('');
  const text = raw || '';
  if (!text) return;
  if (HAS_HTML_TAG.test(text)) {
    quill.clipboard.dangerouslyPasteHTML(text);
  } else {
    quill.setText(text);
  }
}

function getDescriptionFromEditor(quill) {
  if (!quill) return '';
  // getSemanticHTML() (e não .root.innerHTML) — o innerHTML do editor
  // inclui marcação interna do Quill (data-list, spans de UI da lista)
  // que não é HTML semântico e seria descartada pelo sanitizador.
  return quill.getText().trim() ? quill.getSemanticHTML() : '';
}

/* ------------------------------------------------------------------ */
/* admin.html — CRUD de curso + gestor de aulas embutido               */
/* ------------------------------------------------------------------ */

export async function initAdminCourses() {
  const form = document.getElementById('course-form');
  if (!form) return;
  const user = await guardCourseEditor();
  if (!user) return;

  const isAuthor = user.role === 'author';
  const loadCourses = () => api.coursesMine(); // admin: todos; autor: os seus

  const formTitle = document.getElementById('form-title');
  const courseIdInput = document.getElementById('course-id');
  const cancelButton = document.getElementById('cancel-edit');
  const list = document.getElementById('admin-course-list');
  const count = document.getElementById('course-count');
  const descriptionEditor = makeDescriptionEditor(document.getElementById('description-editor'));
  let authorSelect = document.getElementById('course-author');

  if (authorSelect && isAuthor) {
    // Autor não escolhe autor: o backend força o próprio id.
    authorSelect.previousElementSibling?.remove();
    authorSelect.remove();
    authorSelect = null;
  } else if (authorSelect) {
    try {
      for (const author of await api.authors()) {
        const option = document.createElement('option');
        option.value = author.id;
        option.textContent = author.name;
        authorSelect.append(option);
      }
    } catch {
      /* dropdown de autor é acessório */
    }
  }

  let courses = [];
  let editingId = null;

  function resetForm() {
    form.reset();
    courseIdInput.value = '';
    editingId = null;
    formTitle.textContent = 'Adicionar curso';
    setDescriptionEditor(descriptionEditor, '');
  }

  function render() {
    count.textContent = `${courses.length} ${courses.length === 1 ? 'curso' : 'cursos'}`;
    list.innerHTML = courses.length
      ? courses.map((course) => `
        <div class="admin-item">
          <div>
            <strong>${escapeHtml(course.title)}</strong>
            <p>${escapeHtml(descriptionExcerpt(course.description))}</p>
            <span class="badge">${courseTypeLabel(course.type)}</span>
            <span class="badge status-${course.status}">${courseStatusLabel(course.status)}</span>
            <span class="badge">${formatBRL(course.priceCents)}</span>
            ${course.author ? `<span class="badge">Autor: ${escapeHtml(course.author.name)}</span>` : ''}
            <span class="lesson-summary">${course.lessonCount} ${course.lessonCount === 1 ? 'aula cadastrada' : 'aulas cadastradas'}</span>
          </div>
          <div class="actions">
            <button class="action-btn edit" data-action="edit" data-id="${course.id}">Editar</button>
            <a class="action-btn lessons" href="gerenciar-curso.html?id=${course.id}">Aulas</a>
            ${course.type === 'online' ? `<a class="action-btn lessons" href="gerenciar-curso.html?id=${course.id}&secao=turmas">Turmas</a>` : ''}
            <button class="action-btn delete" data-action="delete" data-id="${course.id}">Excluir</button>
          </div>
        </div>`).join('')
      : '<p class="empty-state">Nenhum curso cadastrado.</p>';
  }

  async function reload() {
    courses = await loadCourses();
    render();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      title: data.get('title'),
      type: data.get('type'),
      description: getDescriptionFromEditor(descriptionEditor),
      duration: data.get('duration'),
      price: data.get('price'),
      status: data.get('status'),
    };
    if (authorSelect) payload.authorId = data.get('authorId') || '';
    try {
      if (editingId) {
        await api.updateCourse(editingId, payload);
      } else {
        await api.createCourse(payload);
      }
      resetForm();
      await reload();
    } catch (error) {
      alert(error instanceof ApiError && error.code === 'COURSE_FIELDS_REQUIRED'
        ? 'Preencha nome, descrição e duração do curso.'
        : 'Não foi possível salvar o curso.');
    }
  });

  cancelButton?.addEventListener('click', resetForm);

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const { action, id } = button.dataset;
    const course = courses.find((item) => item.id === id);
    if (!course) return;

    if (action === 'edit') {
      const full = await api.course(id);
      editingId = id;
      courseIdInput.value = id;
      document.getElementById('title').value = full.title;
      document.getElementById('type').value = full.type;
      document.getElementById('course-status').value = full.status || 'em_edicao';
      setDescriptionEditor(descriptionEditor, full.description);
      document.getElementById('duration').value = full.duration;
      document.getElementById('price').value = formatBRL(full.priceCents);
      if (authorSelect) authorSelect.value = full.author?.id || '';
      formTitle.textContent = 'Editar curso';
      document.getElementById('title').focus();
    }

    if (action === 'delete') {
      if (!window.confirm(`Excluir o curso "${course.title}"? As matrículas e pagamentos vinculados também serão removidos.`)) return;
      await api.deleteCourse(id);
      if (editingId === id) resetForm();
      await reload();
    }
  });

  await reload();
}
