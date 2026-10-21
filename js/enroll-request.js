import { api, ApiError } from './api.js';
import { currentUser } from './session.js';
import { escapeHtml, courseStatusLabel, classPeriod, classStatusLabel } from './format.js';

const requestErrors = {
  COURSE_NOT_OPEN: 'Este curso ainda não está aceitando matrículas.',
  CLASS_REQUIRED: 'Escolha uma turma para se inscrever.',
  CLASS_FULL: 'Esta turma acabou de lotar. Escolha outra turma.',
  CLASS_CLOSED: 'As inscrições desta turma foram encerradas. Escolha outra turma.',
  CLASS_INVALID: 'Turma inválida. Recarregue a página e escolha de novo.',
};

function classOptionLabel(klass) {
  const info = [classPeriod(klass), klass.schedule].filter(Boolean).join(' · ');
  const seats = klass.seatsLeft == null ? '' : ` — ${klass.seatsLeft} ${klass.seatsLeft === 1 ? 'vaga' : 'vagas'}`;
  return `${klass.name}${info ? ` (${info})` : ''}${seats}`;
}

export async function initEnrollRequestPage() {
  const root = document.getElementById('enroll-request');
  if (!root) return;

  const user = await currentUser();
  const params = new URLSearchParams(window.location.search);
  const requestedCourseId = params.get('courseId');
  const requestedClassId = params.get('classId');

  if (!user) {
    const next = `inscricao.html${window.location.search}`;
    root.innerHTML = `
      <div class="empty-state">
        <h3>Entre para solicitar matrícula</h3>
        <p>Você precisa de uma conta de aluno para pedir matrícula em um curso.</p>
        <div class="hero-actions">
          <a class="btn btn-primary" href="login.html?next=${encodeURIComponent(next)}">Entrar</a>
          <a class="btn btn-secondary" href="cadastro.html">Novo usuário</a>
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
  let certificates = [];
  try {
    [courses, mine] = await Promise.all([api.courses(), api.myEnrollments()]);
    certificates = await api.myCertificates().catch(() => []);
  } catch {
    root.innerHTML = '<p class="empty-state">Não foi possível carregar os cursos agora.</p>';
    return;
  }
  const enrolledIds = new Set(mine.map((item) => item.courseId));

  // Só cursos liberados aceitam matrícula; os demais aparecem desabilitados com o status.
  const courseOption = (course) => {
    const already = enrolledIds.has(course.id);
    const closed = course.status !== 'liberado';
    const suffix = already ? ' — já solicitado' : (closed ? ` — ${courseStatusLabel(course.status)}` : '');
    return `
      <option value="${course.id}" ${course.id === requestedCourseId ? 'selected' : ''} ${already || closed ? 'disabled' : ''}>
        ${escapeHtml(course.title)}${escapeHtml(suffix)}
      </option>`;
  };

  root.innerHTML = `
    <form id="enroll-request-form" class="panel enrollment-form">
      <label for="request-course">Curso de interesse</label>
      <select id="request-course" name="courseId" required>
        <option value="">Selecione um curso</option>
        ${courses.map(courseOption).join('')}
      </select>
      <div id="request-class-group" hidden>
        <label for="request-class">Turma</label>
        <select id="request-class" name="classId"></select>
        <p class="field-hint" id="request-class-hint"></p>
      </div>
      <button class="btn btn-primary" type="submit" id="request-submit">Solicitar matrícula</button>
      <p id="request-feedback" class="form-feedback" role="status"></p>
    </form>
    <section class="section-stack">
      <h2>Minhas matrículas</h2>
      <div id="my-enrollments" class="admin-list"></div>
    </section>`;

  const form = document.getElementById('enroll-request-form');
  const feedback = document.getElementById('request-feedback');
  const listNode = document.getElementById('my-enrollments');
  const courseSelect = document.getElementById('request-course');
  const classGroup = document.getElementById('request-class-group');
  const classSelect = document.getElementById('request-class');
  const classHint = document.getElementById('request-class-hint');
  const submit = document.getElementById('request-submit');

  // Curso síncrono: mostra as turmas em formação com vaga.
  async function syncClassField(preselect = null) {
    const course = courses.find((item) => item.id === courseSelect.value);
    const online = course?.type === 'online';
    classGroup.hidden = !online;
    submit.disabled = false;
    if (!online) return;
    classSelect.innerHTML = '<option value="">Carregando turmas…</option>';
    const classes = (await api.courseClasses(course.id).catch(() => [])).filter((klass) => klass.open);
    if (!classes.length) {
      classSelect.innerHTML = '<option value="">Nenhuma turma aberta</option>';
      classHint.textContent = 'Este curso não tem turma com inscrições abertas no momento. Aguarde a próxima turma.';
      submit.disabled = true;
      return;
    }
    classSelect.innerHTML = '<option value="">Escolha a turma</option>'
      + classes.map((klass) => `<option value="${klass.id}" ${klass.id === preselect ? 'selected' : ''}>${escapeHtml(classOptionLabel(klass))}</option>`).join('');
    classHint.textContent = 'O link ou local das aulas aparece na página do curso depois que sua matrícula for ativada.';
  }

  const certificateLink = (courseId) => {
    const cert = certificates.find((c) => c.courseId === courseId);
    return cert ? `<a class="action-btn lessons" href="certificado.html?code=${encodeURIComponent(cert.code)}">🎓 Certificado</a>` : '';
  };

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
            ${item.class ? `<p>Turma: <strong>${escapeHtml(item.class.name)}</strong> · ${escapeHtml(classStatusLabel(item.class.status))}${classPeriod(item.class) ? ` · ${escapeHtml(classPeriod(item.class))}` : ''}</p>` : ''}
            ${item.payment.total ? `<p>${item.payment.paidCount}/${item.payment.total} parcelas pagas${item.payment.overdueCents ? ' · há parcelas em atraso' : ''}</p>` : ''}
          </div>
          <div class="actions">
            <a class="action-btn edit" href="curso.html?id=${item.courseId}">Abrir curso</a>
            ${certificateLink(item.courseId)}
          </div>
        </article>`).join('')
      : '<p class="empty-state">Você ainda não tem matrículas.</p>';
  }

  renderMine(mine);
  courseSelect.addEventListener('change', () => syncClassField());
  await syncClassField(requestedClassId);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    feedback.textContent = '';
    const data = new FormData(form);
    const courseId = data.get('courseId');
    if (!courseId) return;
    const course = courses.find((item) => item.id === courseId);
    const classId = course?.type === 'online' ? data.get('classId') : null;
    if (course?.type === 'online' && !classId) {
      feedback.textContent = requestErrors.CLASS_REQUIRED;
      return;
    }
    try {
      await api.requestEnrollment(courseId, classId);
      feedback.textContent = 'Solicitação registrada. O administrador vai definir o plano de pagamento e ativar sua matrícula.';
      mine = await api.myEnrollments();
      enrolledIds.add(courseId);
      renderMine(mine);
    } catch (error) {
      feedback.textContent = (error instanceof ApiError && requestErrors[error.code]) || 'Não foi possível registrar a solicitação.';
      if (error instanceof ApiError && (error.code === 'CLASS_FULL' || error.code === 'CLASS_CLOSED')) await syncClassField();
    }
  });
}
