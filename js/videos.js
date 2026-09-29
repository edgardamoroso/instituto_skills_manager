import { api, ApiError } from './api.js';
import { guardAdmin } from './session.js';
import { escapeHtml, formatDate, safeUrl } from './format.js';

const PROVIDER_LABEL = { drive: 'Google Drive', youtube: 'YouTube' };

// O player vem de uma URL montada pelo backend (drive.google.com / youtube-nocookie.com);
// safeUrl é só uma segunda barreira contra qualquer coisa que não seja http(s).
function playerMarkup(video) {
  return `
    <div class="video-frame">
      <iframe src="${escapeHtml(safeUrl(video.embedUrl))}" title="${escapeHtml(video.title)}"
        loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>
    </div>`;
}

function videoCard(video) {
  return `
    <article class="card video-card">
      ${playerMarkup(video)}
      <div class="video-body">
        <p class="video-date">${escapeHtml(formatDate(video.createdAt))}</p>
        <h3>${escapeHtml(video.title)}</h3>
        ${video.description ? `<p>${escapeHtml(video.description)}</p>` : ''}
        ${video.course
          ? `<a class="card-link" href="curso.html?id=${encodeURIComponent(video.course.id)}">Conhecer o curso ${escapeHtml(video.course.title)} →</a>`
          : ''}
      </div>
    </article>`;
}

export async function initVideoFeed() {
  const grid = document.getElementById('video-list');
  if (!grid) return;
  try {
    const videos = await api.videos();
    grid.innerHTML = videos.length
      ? videos.map(videoCard).join('')
      : '<p class="empty-state">Em breve, novidades por aqui.</p>';
  } catch {
    grid.innerHTML = '<p class="empty-state">Não foi possível carregar as novidades agora.</p>';
  }
}

const ERROR_MESSAGES = {
  VIDEO_FIELDS_REQUIRED: 'Informe o título do vídeo.',
  VIDEO_LINK_INVALID: 'Link não reconhecido. Use o link de compartilhamento do arquivo no Google Drive (ou do vídeo no YouTube).',
  VIDEO_LINK_UNSUPPORTED: 'Só aceitamos links do Google Drive ou do YouTube.',
  VIDEO_COURSE_INVALID: 'O curso escolhido não existe mais. Recarregue a página.',
};

export async function initAdminVideos() {
  const form = document.getElementById('video-form');
  if (!form) return;
  if (!(await guardAdmin())) return;

  const formTitle = document.getElementById('video-form-title');
  const list = document.getElementById('video-list-admin');
  const count = document.getElementById('video-count');
  const feedback = document.getElementById('video-feedback');
  const courseSelect = document.getElementById('video-course');

  let videos = [];
  let editingId = null;

  function showFeedback(text, tone = 'ok') {
    feedback.textContent = text;
    feedback.dataset.tone = tone;
  }

  function resetForm() {
    form.reset();
    editingId = null;
    formTitle.textContent = 'Novo vídeo';
  }

  function render() {
    count.textContent = `${videos.length} ${videos.length === 1 ? 'vídeo' : 'vídeos'}`;
    list.innerHTML = videos.length
      ? videos.map((video) => `
        <article class="admin-item">
          <div>
            <strong>${escapeHtml(video.title)}</strong>
            ${video.description ? `<p>${escapeHtml(video.description)}</p>` : ''}
            <span class="badge">${video.status === 'publicado' ? 'Publicado' : 'Rascunho'}</span>
            <span class="badge">${PROVIDER_LABEL[video.provider] || video.provider}</span>
            ${video.course ? `<span class="badge">${escapeHtml(video.course.title)}</span>` : ''}
            <p><a href="${escapeHtml(safeUrl(video.watchUrl))}" target="_blank" rel="noopener">Abrir vídeo ↗</a></p>
          </div>
          <div class="actions">
            <button class="action-btn edit" data-action="edit" data-id="${video.id}">Editar</button>
            <button class="action-btn lessons" data-action="toggle" data-id="${video.id}">${video.status === 'publicado' ? 'Despublicar' : 'Publicar'}</button>
            <button class="action-btn delete" data-action="delete" data-id="${video.id}">Excluir</button>
          </div>
        </article>`).join('')
      : '<p class="empty-state">Nenhum vídeo cadastrado.</p>';
  }

  async function reload() {
    videos = await api.videosManage();
    render();
  }

  async function loadCourses() {
    const courses = await api.courses();
    courseSelect.innerHTML = '<option value="">Nenhum</option>'
      + courses.map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.title)}</option>`).join('');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = {
      title: data.get('title'),
      description: data.get('description') || '',
      link: data.get('link'),
      courseId: data.get('courseId') || '',
      status: data.get('status'),
    };
    try {
      if (editingId) {
        await api.updateVideo(editingId, payload);
        showFeedback('Vídeo atualizado.');
      } else {
        await api.createVideo(payload);
        showFeedback(payload.status === 'publicado' ? 'Vídeo publicado em Novidades.' : 'Vídeo salvo como rascunho.');
      }
      resetForm();
      await reload();
    } catch (error) {
      const message = error instanceof ApiError ? ERROR_MESSAGES[error.code] : null;
      showFeedback(message || 'Não foi possível salvar o vídeo.', 'error');
    }
  });

  document.getElementById('cancel-video-edit')?.addEventListener('click', resetForm);

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const video = videos.find((item) => item.id === button.dataset.id);
    if (!video) return;

    if (button.dataset.action === 'edit') {
      editingId = video.id;
      form.elements.title.value = video.title;
      form.elements.description.value = video.description || '';
      form.elements.link.value = video.watchUrl;
      form.elements.courseId.value = video.course?.id || '';
      form.elements.status.value = video.status;
      formTitle.textContent = 'Editar vídeo';
      form.elements.title.focus();
    }

    if (button.dataset.action === 'toggle') {
      await api.updateVideo(video.id, { status: video.status === 'publicado' ? 'rascunho' : 'publicado' });
      await reload();
    }

    if (button.dataset.action === 'delete') {
      if (!window.confirm(`Excluir o vídeo "${video.title}"? O arquivo no Google Drive não é apagado.`)) return;
      try {
        await api.deleteVideo(video.id);
        if (editingId === video.id) resetForm();
        await reload();
      } catch {
        showFeedback('Não foi possível excluir o vídeo.', 'error');
      }
    }
  });

  resetForm();
  await Promise.all([loadCourses(), reload()]);
}
