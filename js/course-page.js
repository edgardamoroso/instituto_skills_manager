import { api, ApiError } from './api.js';
import { currentUser } from './session.js';
import { formatBRL, courseTypeLabel, escapeHtml, safeUrl } from './format.js';

function resourceLabel(type) {
  return { video: 'vídeo', pdf: 'pdf', link: 'link externo', file: 'arquivo' }[type] || 'recurso';
}

function lessonMarkup(lesson, index) {
  const number = String(index + 1).padStart(2, '0');
  const href = escapeHtml(safeUrl(lesson.resource));
  const media = lesson.resourceType === 'video'
    ? `<div class="resource-frame"><iframe src="${href}" title="${escapeHtml(lesson.title)}" loading="lazy" allowfullscreen referrerpolicy="no-referrer"></iframe></div>`
    : `<a class="resource-link" href="${href}" target="_blank" rel="noopener noreferrer">Abrir ${resourceLabel(lesson.resourceType)} <span>↗</span></a>`;
  return `
    <article class="public-lesson">
      <div class="lesson-number">${number}</div>
      <div class="lesson-copy">
        <h3>${escapeHtml(lesson.title)}</h3>
        <p>${escapeHtml(lesson.description || 'Material disponível para estudo.')}</p>
        ${media}
      </div>
    </article>`;
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
    const data = await api.courseContent(courseId);
    const lessons = data.lessons || [];
    container.innerHTML = lessons.length
      ? lessons.map(lessonMarkup).join('')
      : '<p class="empty-state">Este curso ainda não possui aulas publicadas.</p>';
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
      <p class="course-description">${escapeHtml(course.description)}</p>
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
