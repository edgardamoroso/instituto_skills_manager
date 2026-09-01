import { api, ApiError } from './api.js';
import { currentUser } from './session.js';
import { formatDate, escapeHtml } from './format.js';

export async function initEnrollRequestPage() {
  const root = document.getElementById('enroll-request');
  if (!root) return;

  const user = await currentUser();
  const requestedCourseId = new URLSearchParams(window.location.search).get('courseId');

  if (!user) {
    root.innerHTML = `
      <div class="empty-state">
        <h3>Entre para solicitar matrícula</h3>
        <p>Você precisa de uma conta de aluno para pedir matrícula em um curso.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="login.html?next=${encodeURIComponent(`inscricao.html${requestedCourseId ? `?courseId=${requestedCourseId}` : ''}`)}">Entrar</a>
          <a class="btn btn-secondary" href="cadastro.html">Criar conta</a>
        </div>
      </div>`;
    return;
  }

  if (user.role === 'admin') {
    root.innerHTML = `
      <div class="empty-state">
        <h3>Você está logado como administrador</h3>
        <p>Crie e gerencie matrículas pela página <a href="matriculas.html">Matrículas e Pagamentos</a>.</p>
      </div>`;
    return;
  }

  let courses = [];
  let mine = [];
  try {
    [courses, mine] = await Promise.all([api.courses(), api.myEnrollments()]);
  } catch {
    root.innerHTML = '<p class="empty-state">Não foi possível carregar os cursos agora.</p>';
    return;
  }
  const enrolledIds = new Set(mine.map((item) => item.courseId));

  root.innerHTML = `
    <form id="enroll-request-form" class="panel enrollment-form">
      <label for="request-course">Curso de interesse</label>
      <select id="request-course" name="courseId" required>
        <option value="">Selecione um curso</option>
        ${courses.map((course) => `
          <option value="${course.id}" ${course.id === requestedCourseId ? 'selected' : ''} ${enrolledIds.has(course.id) ? 'disabled' : ''}>
            ${escapeHtml(course.title)}${enrolledIds.has(course.id) ? ' — já solicitado' : ''}
          </option>`).join('')}
      </select>
      <button class="btn btn-primary" type="submit">Solicitar matrícula</button>
      <p id="request-feedback" class="form-feedback" role="status"></p>
    </form>
    <section class="section-stack">
      <h2>Minhas matrículas</h2>
      <div id="my-enrollments" class="admin-list"></div>
    </section>`;

  const form = document.getElementById('enroll-request-form');
  const feedback = document.getElementById('request-feedback');
  const listNode = document.getElementById('my-enrollments');

  function renderMine(items) {
    listNode.innerHTML = items.length
      ? items.map((item) => `
        <article class="admin-item">
          <div>
            <strong>${escapeHtml(item.course?.title || '')}</strong>
            <p>
              <span class="pill-status status-${item.status}">${item.status === 'ativa' ? 'Ativa' : 'Inativa'}</span>
              ${item.statusReason ? `· ${escapeHtml(item.statusReason)}` : ''}
            </p>
            ${item.payment.total ? `<p>${item.payment.paidCount}/${item.payment.total} parcelas pagas${item.payment.overdueCents ? ' · há parcelas em atraso' : ''}</p>` : ''}
          </div>
          <a class="action-btn edit" href="curso.html?id=${item.courseId}">Abrir curso</a>
        </article>`).join('')
      : '<p class="empty-state">Você ainda não tem matrículas.</p>';
  }

  renderMine(mine);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = '';
    const courseId = new FormData(form).get('courseId');
    if (!courseId) return;
    try {
      await api.requestEnrollment(courseId);
      feedback.textContent = 'Solicitação registrada. O administrador vai definir o plano de pagamento e ativar sua matrícula.';
      mine = await api.myEnrollments();
      renderMine(mine);
    } catch (error) {
      feedback.textContent = error instanceof ApiError
        ? 'Não foi possível registrar a solicitação.'
        : 'Não foi possível registrar a solicitação.';
    }
  });
}
