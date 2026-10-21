import { api, ApiError } from './api.js';
import { guardCourseEditor } from './session.js';
import { escapeHtml, courseStatusLabel } from './format.js';
import { mountClassManager } from './class-manager.js';

/* ------------------------------------------------------------------ */
/* gerenciar-curso.html — editor de aulas (criar, editar, reordenar)   */
/* ------------------------------------------------------------------ */

const resourceLabels = { video: 'Vídeo', pdf: 'PDF', link: 'Link externo', file: 'Arquivo' };

// Mesmo limite do backend (multer). Vídeo nunca é enviado: só por link.
const MAX_LESSON_FILE_MB = 10;
const LESSON_FILE_ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.zip';

const lessonErrors = {
  LESSON_FIELDS_REQUIRED: 'Informe o título e o link (ou arquivo) da aula.',
  INVALID_RESOURCE_URL: 'O link precisa começar com https://',
  LESSON_RESOURCE_MISMATCH: 'Para "Arquivo enviado", selecione um arquivo; para os outros tipos, informe um link.',
  FILE_TOO_LARGE: `Arquivo maior que ${MAX_LESSON_FILE_MB} MB. Para vídeos, use um link do Google Drive ou do YouTube.`,
  UPLOAD_TYPE_NOT_ALLOWED: 'Tipo de arquivo não permitido. Envie PDF, imagem, documento do Office, CSV, TXT ou ZIP.',
};

const urlHints = {
  video: 'Cole o link de compartilhamento do Google Drive ou do YouTube. No Drive, compartilhe como "Qualquer pessoa com o link" e desmarque a opção de download nas configurações de compartilhamento.',
  pdf: 'Link de um PDF publicado. Links do Google Drive abrem dentro do site.',
  link: 'Qualquer página externa (abre em nova aba).',
};

// Página só de turmas (curso síncrono): gerenciar-curso.html?id=...&secao=turmas
function classesMarkup(course, backHref) {
  return `
    <section class="course-heading">
      <a class="back-link" href="${backHref}">← Voltar</a>
      <span class="type-pill">Turmas</span>
      <span class="badge status-${course.status}">${courseStatusLabel(course.status)}</span>
      <h1>${escapeHtml(course.title)}</h1>
      <p class="course-description">
        Crie as turmas deste curso síncrono e acompanhe os inscritos.
        ${course.status === 'liberado' ? '' : '<strong>O curso ainda não está Liberado:</strong> as inscrições só abrem quando você mudar o status do curso para Liberado (em Cursos → Editar).'}
      </p>
      <a class="btn btn-secondary" href="gerenciar-curso.html?id=${encodeURIComponent(course.id)}">Ir para as aulas →</a>
    </section>
    <section class="panel section-stack" id="class-manager"></section>`;
}

function editorMarkup(course, backHref) {
  return `
    <section class="course-heading">
      <a class="back-link" href="${backHref}">← Voltar</a>
      <span class="type-pill">Editor de conteúdo</span>
      <span class="badge status-${course.status}">${courseStatusLabel(course.status)}</span>
      <h1>${escapeHtml(course.title)}</h1>
      <p class="course-description">
        Cadastre e organize as aulas. O aluno precisa abrir cada aula para liberar a seguinte,
        então a ordem da lista é a ordem do curso.
        <a href="curso.html?id=${encodeURIComponent(course.id)}" target="_blank" rel="noopener">Ver como o aluno vê ↗</a>
      </p>
      ${course.type === 'online' ? `<a class="btn btn-secondary" href="gerenciar-curso.html?id=${encodeURIComponent(course.id)}&secao=turmas">Gerenciar turmas →</a>` : ''}
    </section>
    <section class="panel">
      <form id="editor-lesson-form" class="lesson-form" novalidate>
        <h2 id="editor-form-title">Nova aula</h2>
        <label for="editor-title">Título da aula</label>
        <input id="editor-title" name="title" maxlength="160" required />
        <label for="editor-description">Descrição</label>
        <textarea id="editor-description" name="description" rows="2" maxlength="2000"></textarea>
        <label for="editor-resource-type">Tipo de conteúdo</label>
        <select id="editor-resource-type" name="resourceType">
          <option value="video">Vídeo (link do Google Drive ou YouTube)</option>
          <option value="pdf">PDF por link</option>
          <option value="link">Link externo</option>
          <option value="file">Arquivo enviado (PDF, documento… até ${MAX_LESSON_FILE_MB} MB)</option>
        </select>
        <div id="editor-url-group">
          <label for="editor-resource">Link</label>
          <input id="editor-resource" name="resource" type="url" placeholder="https://..." />
          <p class="field-hint" id="editor-url-hint"></p>
        </div>
        <div id="editor-file-group" hidden>
          <label for="editor-file">Arquivo</label>
          <p class="field-hint" id="editor-current-file" hidden></p>
          <div class="file-picker">
            <input id="editor-file" name="file" type="file" accept="${LESSON_FILE_ACCEPT}" />
            <button type="button" class="btn btn-secondary" id="editor-clear-file" hidden>Remover arquivo</button>
          </div>
        </div>
        <p id="editor-feedback" class="form-feedback" role="status" aria-live="polite"></p>
        <div class="lesson-actions">
          <button class="btn btn-primary" type="submit" id="editor-submit">Adicionar aula</button>
          <button class="btn btn-secondary" type="button" id="editor-cancel" hidden>Cancelar edição</button>
        </div>
      </form>
      <details class="batch-upload">
        <summary>Enviar vários arquivos de uma vez</summary>
        <p class="field-hint">
          Cada arquivo vira uma aula do tipo "Arquivo enviado", na ordem do nome do arquivo e com o
          nome do arquivo como título (sem a extensão). Até ${MAX_LESSON_FILE_MB} MB por arquivo.
        </p>
        <div class="file-picker">
          <input id="batch-files" type="file" multiple accept="${LESSON_FILE_ACCEPT}" />
          <button type="button" class="btn btn-primary" id="batch-submit" disabled>Enviar arquivos</button>
        </div>
        <p id="batch-feedback" class="form-feedback" role="status" aria-live="polite"></p>
      </details>
      <div id="editor-lesson-list" class="lesson-list"></div>
    </section>`;
}

function lessonRow(lesson, index, total, editingId) {
  return `
    <article class="lesson-item${editingId === lesson.id ? ' is-editing' : ''}">
      <div class="lesson-number">${String(index + 1).padStart(2, '0')}</div>
      <div class="lesson-copy">
        <strong>${escapeHtml(lesson.title)}</strong>
        <p>${escapeHtml(lesson.description || 'Sem descrição adicional.')}</p>
        <span class="badge">${resourceLabels[lesson.resourceType] || 'Recurso'}${lesson.resourceName ? ` · ${escapeHtml(lesson.resourceName)}` : ''}</span>
      </div>
      <div class="actions">
        <button class="action-btn" data-move="up" data-id="${lesson.id}" ${index === 0 ? 'disabled' : ''} aria-label="Mover para cima" title="Mover para cima">↑</button>
        <button class="action-btn" data-move="down" data-id="${lesson.id}" ${index === total - 1 ? 'disabled' : ''} aria-label="Mover para baixo" title="Mover para baixo">↓</button>
        <button class="action-btn edit" data-edit="${lesson.id}">Editar</button>
        <button class="action-btn delete" data-delete="${lesson.id}">Excluir</button>
      </div>
    </article>`;
}

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

  if (new URLSearchParams(window.location.search).get('secao') === 'turmas' && course.type === 'online') {
    document.title = `Turmas — ${course.title} | Instituto Skills Manager`;
    root.innerHTML = classesMarkup(course, backHref);
    await mountClassManager(document.getElementById('class-manager'), course, user);
    return;
  }

  root.innerHTML = editorMarkup(course, backHref);

  const form = document.getElementById('editor-lesson-form');
  const listNode = document.getElementById('editor-lesson-list');
  const typeSelect = document.getElementById('editor-resource-type');
  const urlGroup = document.getElementById('editor-url-group');
  const urlInput = document.getElementById('editor-resource');
  const urlHint = document.getElementById('editor-url-hint');
  const fileGroup = document.getElementById('editor-file-group');
  const fileInput = document.getElementById('editor-file');
  const clearFileButton = document.getElementById('editor-clear-file');
  const currentFile = document.getElementById('editor-current-file');
  const feedback = document.getElementById('editor-feedback');
  const submitButton = document.getElementById('editor-submit');
  const cancelButton = document.getElementById('editor-cancel');
  const formTitle = document.getElementById('editor-form-title');

  let lessons = course.lessons || [];
  let editing = null; // aula em edição (objeto da API) ou null

  function showFeedback(text, tone = 'error') {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  }

  function clearFile() {
    fileInput.value = '';
    clearFileButton.hidden = true;
  }

  // Link e arquivo nunca convivem: o tipo escolhido decide qual campo aparece,
  // e sair de "Arquivo enviado" descarta o arquivo selecionado.
  function syncResourceFields() {
    const isFile = typeSelect.value === 'file';
    fileGroup.hidden = !isFile;
    urlGroup.hidden = isFile;
    urlHint.textContent = urlHints[typeSelect.value] || '';
    if (!isFile) clearFile();
    const keepsCurrentFile = Boolean(editing?.fileUrl) && isFile;
    currentFile.hidden = !keepsCurrentFile;
    if (keepsCurrentFile) {
      currentFile.textContent = `Arquivo atual: ${editing.resourceName || 'arquivo'}. Selecione outro só se quiser substituir.`;
    }
  }

  function resetForm() {
    form.reset();
    editing = null;
    formTitle.textContent = 'Nova aula';
    submitButton.textContent = 'Adicionar aula';
    cancelButton.hidden = true;
    showFeedback('', 'ok');
    clearFile();
    syncResourceFields();
  }

  function renderLessons() {
    listNode.innerHTML = lessons.length
      ? lessons.map((lesson, index) => lessonRow(lesson, index, lessons.length, editing?.id)).join('')
      : '<p class="empty-state">Nenhuma aula cadastrada.</p>';
  }

  function startEdit(lesson) {
    editing = lesson;
    form.elements.title.value = lesson.title;
    form.elements.description.value = lesson.description || '';
    typeSelect.value = lesson.resourceType;
    urlInput.value = lesson.fileUrl ? '' : (lesson.resource || '');
    clearFile();
    syncResourceFields();
    formTitle.textContent = `Editar aula: ${lesson.title}`;
    submitButton.textContent = 'Salvar alterações';
    cancelButton.hidden = false;
    showFeedback('', 'ok');
    renderLessons();
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    form.elements.title.focus();
  }

  async function refresh() {
    lessons = (await api.course(courseId)).lessons || [];
    renderLessons();
  }

  typeSelect.addEventListener('change', syncResourceFields);

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return clearFile();
    if (file.size > MAX_LESSON_FILE_MB * 1024 * 1024) {
      clearFile();
      return showFeedback(lessonErrors.FILE_TOO_LARGE);
    }
    clearFileButton.hidden = false;
    return showFeedback('', 'ok');
  });

  clearFileButton.addEventListener('click', clearFile);
  cancelButton.addEventListener('click', () => {
    resetForm();
    renderLessons();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = form.elements.title.value.trim();
    const resourceType = typeSelect.value;
    const file = fileInput.files?.[0];
    const url = urlInput.value.trim();
    // Na edição, campo de recurso vazio = manter o atual (se for do mesmo jeito: arquivo ou link).
    const keepsFile = Boolean(editing?.fileUrl);
    const keepsLink = Boolean(editing) && !editing.fileUrl;
    if (!title) return showFeedback('Informe o título da aula.');
    if (resourceType === 'file' && !file && !keepsFile) return showFeedback('Selecione o arquivo da aula.');
    if (resourceType !== 'file' && !url && !keepsLink) return showFeedback('Informe o link da aula.');

    const payload = new FormData();
    payload.set('title', title);
    payload.set('description', form.elements.description.value || '');
    payload.set('resourceType', resourceType);
    if (resourceType === 'file' && file) payload.set('file', file);
    if (resourceType !== 'file' && url) payload.set('resource', url);

    submitButton.disabled = true;
    try {
      const wasEditing = Boolean(editing);
      if (wasEditing) {
        await api.updateLesson(courseId, editing.id, payload);
      } else {
        await api.addLesson(courseId, payload);
      }
      resetForm();
      await refresh();
      showFeedback(wasEditing ? 'Aula atualizada.' : 'Aula adicionada.', 'ok');
    } catch (error) {
      showFeedback((error instanceof ApiError && lessonErrors[error.code]) || 'Não foi possível salvar a aula.');
    } finally {
      submitButton.disabled = false;
    }
    return undefined;
  });

  listNode.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const id = button.dataset.edit || button.dataset.delete || button.dataset.id;
    const lesson = lessons.find((item) => item.id === id);
    if (!lesson) return;

    if (button.dataset.edit) {
      startEdit(lesson);
    } else if (button.dataset.delete) {
      if (!window.confirm(`Excluir a aula "${lesson.title}"?`)) return;
      await api.deleteLesson(courseId, lesson.id);
      if (editing?.id === lesson.id) resetForm();
      await refresh();
    } else if (button.dataset.move) {
      lessons = await api.moveLesson(courseId, lesson.id, button.dataset.move);
      renderLessons();
    }
  });

  // Envio em lote: um arquivo = uma aula, em ordem natural do nome ("Aula 2" antes de "Aula 10").
  const batchInput = document.getElementById('batch-files');
  const batchSubmit = document.getElementById('batch-submit');
  const batchFeedback = document.getElementById('batch-feedback');
  const byName = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

  function showBatch(text, tone = 'ok') {
    batchFeedback.textContent = text;
    batchFeedback.dataset.tone = tone;
  }

  batchInput.addEventListener('change', () => {
    const count = batchInput.files?.length || 0;
    batchSubmit.disabled = count === 0;
    showBatch(count ? `${count} ${count === 1 ? 'arquivo selecionado' : 'arquivos selecionados'}.` : '');
  });

  batchSubmit.addEventListener('click', async () => {
    const files = [...(batchInput.files || [])].sort((a, b) => byName.compare(a.name, b.name));
    if (!files.length) return;
    batchSubmit.disabled = true;
    batchInput.disabled = true;
    const failed = [];
    let sent = 0;
    for (const file of files) {
      showBatch(`Enviando ${sent + failed.length + 1} de ${files.length}: ${file.name}…`);
      if (file.size > MAX_LESSON_FILE_MB * 1024 * 1024) {
        failed.push(`${file.name} (maior que ${MAX_LESSON_FILE_MB} MB)`);
        continue;
      }
      const payload = new FormData();
      payload.set('title', file.name.replace(/\.[^.]+$/, '').trim().slice(0, 160) || file.name);
      payload.set('description', '');
      payload.set('resourceType', 'file');
      payload.set('file', file);
      try {
        await api.addLesson(courseId, payload);
        sent += 1;
      } catch (error) {
        const reason = (error instanceof ApiError && lessonErrors[error.code]) || 'erro ao enviar';
        failed.push(`${file.name} (${reason})`);
      }
    }
    batchInput.value = '';
    batchInput.disabled = false;
    await refresh();
    showBatch(
      failed.length
        ? `${sent} ${sent === 1 ? 'aula criada' : 'aulas criadas'}. Não enviados: ${failed.join('; ')}.`
        : `${sent} ${sent === 1 ? 'aula criada' : 'aulas criadas'}. Use ↑ ↓ para ajustar a ordem e "Editar" para mudar títulos.`,
      failed.length ? 'error' : 'ok',
    );
  });

  resetForm();
  renderLessons();
}
