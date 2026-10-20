import { api, ApiError } from './api.js';
import { currentUser } from './session.js';
import { formatBRL, courseTypeLabel, escapeHtml, safeUrl, renderDescriptionHtml } from './format.js';

function resourceLabel(type) {
  return { video: 'vídeo', pdf: 'PDF', link: 'link externo', file: 'arquivo' }[type] || 'recurso';
}

function frame(src, title, extraClass = '') {
  return `<div class="resource-frame${extraClass}"><iframe src="${escapeHtml(safeUrl(src))}" title="${escapeHtml(title)}"
    loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe></div>`;
}

// Conteúdo de uma aula já aberta. Vídeo: só o player (sem link para baixar).
// PDF enviado: leitor do navegador dentro da página + botão de baixar.
function lessonMedia(lesson) {
  if (lesson.fileUrl && lesson.isPdf) {
    return `${frame(lesson.fileUrl, lesson.title, ' resource-frame-doc')}
      <a class="resource-link" href="${escapeHtml(lesson.fileUrl)}?download=1">Baixar PDF <span>↓</span></a>`;
  }
  if (lesson.fileUrl) {
    return `<a class="resource-link" href="${escapeHtml(lesson.fileUrl)}?download=1">Baixar ${escapeHtml(lesson.resourceName || 'arquivo')} <span>↓</span></a>`;
  }
  if (lesson.embedUrl) {
    return frame(lesson.embedUrl, lesson.title, lesson.resourceType === 'pdf' ? ' resource-frame-doc' : '');
  }
  if (lesson.resource) {
    return `<a class="resource-link" href="${escapeHtml(safeUrl(lesson.resource))}" target="_blank" rel="noopener noreferrer">Abrir ${resourceLabel(lesson.resourceType)} <span>↗</span></a>`;
  }
  return '';
}

function lessonMarkup(lesson, index, preview) {
  const number = String(index + 1).padStart(2, '0');
  let body;
  let status = '';
  if (lesson.locked) {
    body = '<p class="lesson-locked">🔒 Abra a aula anterior para liberar esta.</p>';
  } else if (lesson.opened || preview) {
    body = lessonMedia(lesson);
    if (!preview) status = '<span class="badge lesson-done">✓ Aberta</span>';
  } else {
    body = `<button class="btn btn-primary lesson-open" type="button" data-open="${lesson.id}">Abrir aula</button>`;
  }
  return `
    <article class="public-lesson${lesson.locked ? ' is-locked' : ''}" id="aula-${lesson.id}">
      <div class="lesson-number">${lesson.locked ? '🔒' : number}</div>
      <div class="lesson-copy">
        <h3>${escapeHtml(lesson.title)} ${status}</h3>
        <p>${escapeHtml(lesson.description || 'Material disponível para estudo.')}</p>
        ${body}
      </div>
    </article>`;
}

function renderLessonList(container, data) {
  const lessons = data.lessons || [];
  const note = data.preview
    ? '<p class="panel-note">Prévia de quem edita o curso: todas as aulas aparecem liberadas. O aluno libera uma de cada vez, abrindo a anterior.</p>'
    : '';
  container.innerHTML = lessons.length
    ? note + lessons.map((lesson, index) => lessonMarkup(lesson, index, data.preview)).join('')
    : '<p class="empty-state">Este curso ainda não possui aulas publicadas.</p>';
}

function contentNotice(title, text, actionHtml = '') {
  return `
    <div class="empty-state content-gate">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      ${actionHtml}
    </div>`;
}

async function renderContent(courseId, container) {
  const user = await currentUser();
  if (!user) {
    container.innerHTML = contentNotice(
      'Conteúdo exclusivo para alunos',
      'Entre com sua conta para acessar as aulas deste curso.',
      `<a class="btn btn-primary" href="login.html?next=${encodeURIComponent(`curso.html?id=${courseId}`)}">Entrar</a>`,
    );
    return;
  }

  try {
    renderLessonList(container, await api.courseContent(courseId));

    // "Abrir aula": registra a abertura (libera a próxima) e mostra o conteúdo.
    container.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-open]');
      if (!button) return;
      button.disabled = true;
      try {
        await api.openLesson(courseId, button.dataset.open);
        renderLessonList(container, await api.courseContent(courseId));
        document.getElementById(`aula-${button.dataset.open}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch {
        button.disabled = false;
        button.textContent = 'Tentar de novo';
      }
    });
  } catch (error) {
    if (!(error instanceof ApiError)) {
      container.innerHTML = '<p class="empty-state">Não foi possível carregar o conteúdo agora.</p>';
      return;
    }
    if (error.code === 'ENROLLMENT_NOT_FOUND') {
      container.innerHTML = contentNotice(
        'Você ainda não está matriculado',
        'Solicite sua matrícula neste curso para liberar o acesso às aulas.',
        `<a class="btn btn-primary" href="inscricao.html?courseId=${courseId}">Solicitar matrícula</a>`,
      );
    } else if (error.code === 'ENROLLMENT_INACTIVE') {
      container.innerHTML = contentNotice(
        'Matrícula suspensa',
        error.reason
          ? `Sua matrícula está suspensa: ${error.reason}. Regularize os pagamentos para voltar a acessar o conteúdo.`
          : 'Sua matrícula está suspensa por pendências financeiras. Regularize os pagamentos para voltar a acessar o conteúdo.',
      );
    } else if (error.status === 401) {
      container.innerHTML = contentNotice('Sessão expirada', 'Entre novamente para acessar o conteúdo.',
        '<a class="btn btn-primary" href="login.html">Entrar</a>');
    } else {
      container.innerHTML = '<p class="empty-state">Não foi possível carregar o conteúdo agora.</p>';
    }
  }
}

export async function initCoursePage() {
  const root = document.getElementById('course-page');
  if (!root) return;
  const courseId = new URLSearchParams(window.location.search).get('id');

  let course;
  try {
    course = await api.course(courseId);
  } catch {
    root.innerHTML = `
      <section class="empty-state">
        <h1>Curso não encontrado</h1>
        <p>Volte ao catálogo para escolher outro curso.</p>
        <a class="btn btn-primary" href="index.html">Voltar ao início</a>
      </section>`;
    return;
  }

  const backHref = course.type === 'gravado' ? 'cursos-gravados.html' : 'cursos-online.html';
  root.innerHTML = `
    <section class="course-heading">
      <a class="back-link" href="${backHref}">← Voltar ao catálogo</a>
      <span class="type-pill">${course.type === 'gravado' ? 'Curso assíncrono' : 'Curso síncrono'}</span>
      <h1>${escapeHtml(course.title)}</h1>
      <div class="course-description-rich">${renderDescriptionHtml(course.description)}</div>
      ${course.author ? `<p class="course-author">Autor: <strong>${escapeHtml(course.author.name)}</strong>${course.author.bio ? ` — ${escapeHtml(course.author.bio)}` : ''}</p>` : ''}
      <div class="meta">
        <span>⏱ ${escapeHtml(course.duration)}</span>
        <span>💸 ${formatBRL(course.priceCents)}</span>
        <span>▣ ${(course.lessons || []).length} aulas</span>
      </div>
      <a class="btn btn-primary" href="inscricao.html?courseId=${encodeURIComponent(course.id)}">Solicitar matrícula</a>
    </section>
    <section class="course-content">
      <div class="section-header">
        <h2>Conteúdo do curso</h2>
        <p>Acompanhe as aulas e acesse os materiais disponíveis.</p>
      </div>
      <div id="course-content-body" class="public-lesson-list"></div>
    </section>`;

  document.title = `${course.title} | Instituto Skills Manager`;
  await renderContent(course.id, document.getElementById('course-content-body'));
}
