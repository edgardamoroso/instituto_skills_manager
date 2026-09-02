import { api } from './api.js';
import { formatBRL, courseTypeLabel, escapeHtml } from './format.js';

function courseCard(course) {
  return `
    <a class="card course-card" href="curso.html?id=${encodeURIComponent(course.id)}">
      <div class="card-head">
        <h3>${escapeHtml(course.title)}</h3>
        <span class="type-pill">${courseTypeLabel(course.type)}</span>
      </div>
      <p>${escapeHtml(course.description)}</p>
      <div class="meta">
        <span>⏱ ${escapeHtml(course.duration)}</span>
        <span>💸 ${formatBRL(course.priceCents)}</span>
        ${course.author ? `<span>✍ ${escapeHtml(course.author.name)}</span>` : ''}
      </div>
      <span class="card-link">Ver conteúdo do curso →</span>
    </a>`;
}

function fill(container, list, emptyText) {
  if (!container) return;
  container.innerHTML = list.length ? list.map(courseCard).join('') : `<p class="empty-state">${emptyText}</p>`;
}

export async function initCatalog(page) {
  const home = document.getElementById('home-courses');
  const recorded = document.getElementById('recorded-list');
  const online = document.getElementById('online-list');
  if (!home && !recorded && !online) return;

  let courses = [];
  try {
    courses = await api.courses();
  } catch {
    fill(home || recorded || online, [], 'Não foi possível carregar os cursos agora.');
    return;
  }

  fill(home, courses.slice(0, 4), 'Nenhum curso disponível ainda.');
  fill(recorded, courses.filter((course) => course.type === 'gravado'), 'Nenhum curso assíncrono cadastrado ainda.');
  fill(online, courses.filter((course) => course.type === 'online'), 'Nenhum curso síncrono cadastrado ainda.');
}
