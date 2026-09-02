import { api, ApiError } from './api.js';
import { guardCourseEditor } from './session.js';
import { formatBRL, courseTypeLabel, escapeHtml } from './format.js';

const resourceLabels = { video: 'Vídeo', pdf: 'PDF', link: 'Link externo', file: 'Arquivo' };

/* ------------------------------------------------------------------ */
/* admin.html — CRUD de curso + gestor de aulas embutido               */
/* ------------------------------------------------------------------ */

export async function initAdminCourses() {
  const form = document.getElementById('course-form');
  if (!form) return;
  const user = await guardCourseEditor();
  if (!user) return;

  const isAuthor = user.role === 'author';
  const mineOnly = document.body.dataset.page === 'my-courses' || isAuthor;
  const loadCourses = () => (mineOnly ? api.coursesMine() : api.courses());

  const formTitle = document.getElementById('form-title');
  const courseIdInput = document.getElementById('course-id');
  const cancelButton = document.getElementById('cancel-edit');
  const list = document.getElementById('admin-course-list');
  const count = document.getElementById('course-count');
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

  const lessonManager = document.getElementById('lesson-manager');
  const lessonForm = document.getElementById('lesson-form');
  const lessonList = document.getElementById('lesson-list');
  const lessonCourseTitle = document.getElementById('lesson-course-title');

  let courses = [];
  let editingId = null;
  let managingCourseId = null;

  function resetForm() {
    form.reset();
    courseIdInput.value = '';
    editingId = null;
    formTitle.textContent = 'Adicionar curso';
  }

  function render() {
    count.textContent = `${courses.length} ${courses.length === 1 ? 'curso' : 'cursos'}`;
    list.innerHTML = courses.length
      ? courses.map((course) => `
        <div class="admin-item">
          <div>
            <strong>${escapeHtml(course.title)}</strong>
            <p>${escapeHtml(course.description)}</p>
            <span class="badge">${courseTypeLabel(course.type)}</span>
            <span class="badge">${formatBRL(course.priceCents)}</span>
            ${course.author ? `<span class="badge">Autor: ${escapeHtml(course.author.name)}</span>` : ''}
            <span class="lesson-summary">${course.lessonCount} ${course.lessonCount === 1 ? 'aula cadastrada' : 'aulas cadastradas'}</span>
          </div>
          <div class="actions">
            <button class="action-btn edit" data-action="edit" data-id="${course.id}">Editar</button>
            <button class="action-btn lessons" data-action="lessons" data-id="${course.id}">Aulas</button>
            <a class="action-btn lessons" href="gerenciar-curso.html?id=${course.id}">Abrir editor</a>
            <button class="action-btn delete" data-action="delete" data-id="${course.id}">Excluir</button>
          </div>
        </div>`).join('')
      : '<p class="empty-state">Nenhum curso cadastrado.</p>';
  }

  async function reload() {
    courses = await loadCourses();
    render();
    if (managingCourseId && !courses.some((course) => course.id === managingCourseId)) {
      lessonManager.hidden = true;
      managingCourseId = null;
    }
  }

  async function openLessonManager(courseId) {
    const course = await api.course(courseId);
    managingCourseId = courseId;
    lessonManager.hidden = false;
    lessonCourseTitle.textContent = course.title;
    renderLessons(course.lessons || []);
    lessonManager.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderLessons(lessons) {
    lessonList.innerHTML = lessons.length
      ? lessons.map((lesson, index) => `
        <article class="lesson-item">
          <div class="lesson-number">${String(index + 1).padStart(2, '0')}</div>
          <div class="lesson-copy">
            <strong>${escapeHtml(lesson.title)}</strong>
            <p>${escapeHtml(lesson.description || 'Sem descrição adicional.')}</p>
            <span class="badge">${resourceLabels[lesson.resourceType] || 'Recurso'}${lesson.resourceName ? ` · ${escapeHtml(lesson.resourceName)}` : ''}</span>
          </div>
          <div class="actions">
            <button class="action-btn delete" data-lesson-delete="${lesson.id}">Excluir</button>
          </div>
        </article>`).join('')
      : '<p class="empty-state">Nenhuma aula cadastrada. Comece adicionando o primeiro conteúdo.</p>';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      title: data.get('title'),
      type: data.get('type'),
      description: data.get('description'),
      duration: data.get('duration'),
      price: data.get('price'),
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
      document.getElementById('description').value = full.description;
      document.getElementById('duration').value = full.duration;
      document.getElementById('price').value = formatBRL(full.priceCents);
      if (authorSelect) authorSelect.value = full.author?.id || '';
      formTitle.textContent = 'Editar curso';
      document.getElementById('title').focus();
    }

    if (action === 'lessons') {
      await openLessonManager(id);
    }

    if (action === 'delete') {
      if (!window.confirm(`Excluir o curso "${course.title}"? As matrículas e pagamentos vinculados também serão removidos.`)) return;
      await api.deleteCourse(id);
      if (editingId === id) resetForm();
      await reload();
    }
  });

  if (lessonForm) {
    lessonForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!managingCourseId) return;
      const data = new FormData(lessonForm);
      const file = data.get('resourceFile');
      const payload = new FormData();
      payload.set('title', data.get('lessonTitle'));
      payload.set('description', data.get('lessonDescription') || '');
      payload.set('resourceType', data.get('resourceType'));
      if (file instanceof File && file.size) {
        if (file.size > 8 * 1024 * 1024) {
          alert('Escolha um arquivo de até 8 MB. Para vídeos, use um link externo.');
          return;
        }
        payload.set('file', file);
      } else {
        payload.set('resource', (data.get('resourceUrl') || '').toString().trim());
      }
      try {
        await api.addLesson(managingCourseId, payload);
        lessonForm.reset();
        const course = await api.course(managingCourseId);
        renderLessons(course.lessons || []);
        await reload();
      } catch {
        alert('Informe um título e um link (ou arquivo) para a aula.');
      }
    });

    document.getElementById('cancel-lesson-edit')?.addEventListener('click', () => lessonForm.reset());
    document.getElementById('close-lesson-manager')?.addEventListener('click', () => {
      lessonManager.hidden = true;
      managingCourseId = null;
    });

    lessonList.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-lesson-delete]');
      if (!button || !managingCourseId) return;
      await api.deleteLesson(managingCourseId, button.dataset.lessonDelete);
      const course = await api.course(managingCourseId);
      renderLessons(course.lessons || []);
      await reload();
    });
  }

  await reload();
}

/* ------------------------------------------------------------------ */
/* gerenciar-curso.html — editor de aulas em página própria            */
/* ------------------------------------------------------------------ */

export async function initCourseEditor() {
  const root = document.getElementById('course-editor-page');
  if (!root) return;
  const user = await guardCourseEditor();
  if (!user) return;
  const backHref = user.role === 'author' ? 'meus-cursos.html' : 'admin.html';

  const courseId = new URLSearchParams(window.location.search).get('id');
  let course;
  try {
    course = await api.course(courseId);
  } catch {
    root.innerHTML = `<p class="empty-state">Curso não encontrado. <a href="${backHref}">Voltar</a></p>`;
    return;
  }

  root.innerHTML = `
    <section class="course-heading">
      <a class="back-link" href="${backHref}">← Voltar</a>
      <span class="type-pill">Editor de conteúdo</span>
      <h1>${escapeHtml(course.title)}</h1>
      <p class="course-description">Cadastre e organize as aulas deste curso.</p>
    </section>
    <section class="panel">
      <form id="editor-lesson-form" class="lesson-form">
        <label for="editor-title">Título da aula</label>
        <input id="editor-title" name="title" required />
        <label for="editor-description">Descrição</label>
        <textarea id="editor-description" name="description" rows="2"></textarea>
        <div class="lesson-fields">
          <div>
            <label for="editor-resource-type">Tipo</label>
            <select id="editor-resource-type" name="resourceType">
              <option value="video">Vídeo por link</option>
              <option value="pdf">PDF por link</option>
              <option value="link">Link externo</option>
              <option value="file">Arquivo local</option>
            </select>
          </div>
          <div>
            <label for="editor-resource">URL</label>
            <input id="editor-resource" name="resource" type="url" placeholder="https://..." />
          </div>
        </div>
        <label for="editor-file">Ou selecione um arquivo</label>
        <input id="editor-file" name="file" type="file" />
        <button class="btn btn-primary" type="submit">Adicionar aula</button>
      </form>
      <div id="editor-lesson-list" class="lesson-list"></div>
    </section>`;

  const form = document.getElementById('editor-lesson-form');
  const listNode = document.getElementById('editor-lesson-list');

  function renderLessons(lessons) {
    listNode.innerHTML = lessons.length
      ? lessons.map((lesson, index) => `
        <article class="lesson-item">
          <div class="lesson-number">${String(index + 1).padStart(2, '0')}</div>
          <div class="lesson-copy">
            <strong>${escapeHtml(lesson.title)}</strong>
            <p>${escapeHtml(lesson.description || 'Sem descrição adicional.')}</p>
            <span class="badge">${resourceLabels[lesson.resourceType] || 'Recurso'}${lesson.resourceName ? ` · ${escapeHtml(lesson.resourceName)}` : ''}</span>
          </div>
          <button class="action-btn delete" data-editor-delete="${lesson.id}">Excluir</button>
        </article>`).join('')
      : '<p class="empty-state">Nenhuma aula cadastrada.</p>';
  }

  async function refresh() {
    const fresh = await api.course(courseId);
    renderLessons(fresh.lessons || []);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const file = data.get('file');
    const payload = new FormData();
    payload.set('title', data.get('title'));
    payload.set('description', data.get('description') || '');
    payload.set('resourceType', data.get('resourceType'));
    if (file instanceof File && file.size) {
      if (file.size > 8 * 1024 * 1024) return alert('Escolha um arquivo de até 8 MB.');
      payload.set('file', file);
    } else {
      payload.set('resource', (data.get('resource') || '').toString().trim());
    }
    try {
      await api.addLesson(courseId, payload);
      form.reset();
      await refresh();
    } catch {
      alert('Informe título e recurso.');
    }
  });

  listNode.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-editor-delete]');
    if (!button) return;
    await api.deleteLesson(courseId, button.dataset.editorDelete);
    await refresh();
  });

  renderLessons(course.lessons || []);
}
