import { api, ApiError } from './api.js';
import { guardAdmin } from './session.js';
import { formatBRL, formatDate, courseTypeLabel, paymentStatusLabel, escapeHtml } from './format.js';

function toCents(value) {
  if (value == null || value === '') return NaN;
  let text = String(value).trim().replace(/[R$\s]/gi, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN;
}

const createEnrollmentErrors = {
  ALREADY_ENROLLED: 'Este aluno já está matriculado neste curso.',
  INSTALLMENTS_INVALID: 'Informe um número de parcelas entre 1 e 60.',
  INSTALLMENT_VALUE_INVALID: 'Informe um valor de parcela válido.',
  FIRST_DUE_DATE_INVALID: 'Informe a data do primeiro vencimento.',
  STUDENT_NOT_FOUND: 'Aluno não encontrado.',
  COURSE_NOT_FOUND: 'Curso não encontrado.',
};

export async function initEnrollmentsPage() {
  const page = document.querySelector('[data-page="enrollments"]');
  if (!page) return;
  if (!(await guardAdmin())) return;

  const overviewCards = document.getElementById('overview-cards');
  const overviewTableBody = document.querySelector('#overview-table tbody');
  const studentSelect = document.getElementById('enroll-student');
  const courseSelect = document.getElementById('enroll-course');
  const newForm = document.getElementById('new-enrollment-form');
  const newFeedback = document.getElementById('new-enrollment-feedback');
  const courseFilter = document.getElementById('course-filter');
  const enrollmentTableBody = document.querySelector('#enrollment-table tbody');
  const detail = document.getElementById('enrollment-detail');

  let courses = [];
  let students = [];
  let currentRows = [];

  function renderOverview(overview) {
    const { counts, totals } = overview;
    overviewCards.innerHTML = [
      ['Cursos', counts.courses],
      ['Alunos', counts.students],
      ['Matrículas ativas', counts.enrollmentsActive],
      ['Matrículas inativas', counts.enrollmentsInactive],
      ['Total previsto', formatBRL(totals.plannedCents)],
      ['Total recebido', formatBRL(totals.paidCents)],
      ['Em atraso', formatBRL(totals.overdueCents)],
      ['A receber', formatBRL(totals.outstandingCents)],
    ].map(([label, value]) => `
      <div class="stat-card">
        <span class="stat-value">${escapeHtml(String(value))}</span>
        <span class="stat-label">${label}</span>
      </div>`).join('');

    overviewTableBody.innerHTML = overview.courses.map((course) => `
      <tr>
        <td>${escapeHtml(course.title)}</td>
        <td>${courseTypeLabel(course.type)}</td>
        <td>${course.enrollments}</td>
        <td>${course.activeEnrollments}</td>
        <td>${formatBRL(course.plannedCents)}</td>
        <td>${formatBRL(course.paidCents)}</td>
        <td>${course.overdueCents ? `<span class="pill-status parcela-atrasada">${formatBRL(course.overdueCents)}</span>` : formatBRL(0)}</td>
      </tr>`).join('');
  }

  function fillSelect(select, options, placeholder) {
    select.innerHTML = `<option value="">${placeholder}</option>` +
      options.map((option) => `<option value="${option.value}">${escapeHtml(option.label)}</option>`).join('');
  }

  function renderEnrollmentRows(rows) {
    currentRows = rows;
    if (!rows.length) {
      enrollmentTableBody.innerHTML = '<tr><td colspan="5" class="empty-cell">Nenhuma matrícula neste curso.</td></tr>';
      return;
    }
    enrollmentTableBody.innerHTML = rows.map((row) => {
      const paid = row.payment.paidCount;
      const total = row.payment.total;
      return `
      <tr data-enrollment="${row.id}">
        <td>
          <strong>${escapeHtml(row.student.name)}</strong>
          <div class="muted-line">${escapeHtml(row.student.email)}</div>
        </td>
        <td>
          <span class="pill-status status-${row.status}">${row.status === 'ativa' ? 'Ativa' : 'Inativa'}</span>
          ${row.delinquent ? '<span class="pill-status parcela-atrasada">Inadimplente</span>' : ''}
        </td>
        <td>${total ? `${paid}/${total}` : 'sem plano'}</td>
        <td>${row.payment.overdueCents ? formatBRL(row.payment.overdueCents) : '—'}</td>
        <td class="row-actions">
          <button class="action-btn edit" data-open="${row.id}">Detalhes</button>
          <button class="action-btn ${row.status === 'ativa' ? 'delete' : 'lessons'}" data-toggle="${row.id}">
            ${row.status === 'ativa' ? 'Desativar' : 'Ativar'}
          </button>
        </td>
      </tr>`;
    }).join('');
  }

  async function loadCourseEnrollments(courseId) {
    if (!courseId) {
      renderEnrollmentRows([]);
      return;
    }
    const rows = await api.enrollmentsByCourse(courseId);
    renderEnrollmentRows(rows);
  }

  function renderDetail(data) {
    detail.hidden = false;
    const planText = data.installmentsCount
      ? `${data.installmentsCount}x de ${formatBRL(data.installmentValueCents)} · 1º venc. ${formatDate(data.firstDueDate)}`
      : 'Sem plano de pagamento definido';

    detail.innerHTML = `
      <div class="panel-header">
        <div>
          <p class="eyebrow">Matrícula</p>
          <h2>${escapeHtml(data.student?.name || '')} · ${escapeHtml(data.course?.title || '')}</h2>
        </div>
        <button class="btn btn-secondary" data-detail-close>Fechar</button>
      </div>

      <p class="panel-note">
        <span class="pill-status status-${data.status}">${data.status === 'ativa' ? 'Ativa' : 'Inativa'}</span>
        ${data.statusReason ? `· ${escapeHtml(data.statusReason)}` : ''}
      </p>
      <p class="panel-note">${escapeHtml(planText)}</p>
      <p class="panel-note">
        Recebido ${formatBRL(data.payment.paidCents)} de ${formatBRL(data.payment.plannedCents)} ·
        Em atraso ${formatBRL(data.payment.overdueCents)}
      </p>

      <div class="detail-actions">
        <button class="btn ${data.status === 'ativa' ? 'btn-secondary' : 'btn-primary'}" data-detail-toggle>
          ${data.status === 'ativa' ? 'Desativar participação' : 'Ativar participação'}
        </button>
      </div>

      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>#</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead>
          <tbody>
            ${data.payments.map((payment) => `
              <tr>
                <td>${payment.number}</td>
                <td>${formatDate(payment.dueDate)}</td>
                <td>${formatBRL(payment.amountCents)}</td>
                <td><span class="pill-status parcela-${payment.status}">${paymentStatusLabel(payment.status)}</span></td>
                <td>
                  <button class="action-btn ${payment.status === 'paga' ? 'delete' : 'lessons'}"
                    data-payment="${payment.id}" data-paid="${payment.status === 'paga' ? 'true' : 'false'}">
                    ${payment.status === 'paga' ? 'Desfazer' : 'Marcar paga'}
                  </button>
                </td>
              </tr>`).join('') || '<tr><td colspan="5" class="empty-cell">Sem parcelas. Defina um plano abaixo.</td></tr>'}
          </tbody>
        </table>
      </div>

      <form class="lesson-form" data-plan-form>
        <h3>${data.installmentsCount ? 'Refazer plano de parcelas' : 'Definir plano de parcelas'}</h3>
        <div class="lesson-fields">
          <div>
            <label>Nº de parcelas
              <input type="number" name="installmentsCount" min="1" max="60" value="${data.installmentsCount || 1}" required />
            </label>
          </div>
          <div>
            <label>Valor da parcela
              <input type="text" name="installmentValue" value="${data.installmentValueCents ? formatBRL(data.installmentValueCents) : ''}" placeholder="R$ 0,00" required />
            </label>
          </div>
        </div>
        <label>1º vencimento
          <input type="date" name="firstDueDate" value="${data.firstDueDate || ''}" required />
        </label>
        <button class="btn btn-primary" type="submit">Salvar plano</button>
        <p class="form-feedback" data-plan-feedback role="status"></p>
      </form>`;

    detail.dataset.enrollmentId = data.id;
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function openDetail(enrollmentId) {
    const data = await api.enrollment(enrollmentId);
    renderDetail(data);
  }

  async function toggleStatus(enrollmentId, nextStatus) {
    let reason = '';
    if (nextStatus === 'inativa') {
      reason = window.prompt('Motivo da desativação (ex.: pagamentos em atraso):', 'Pagamentos em atraso') || '';
      if (reason === '') return; // cancelou
    }
    await api.setEnrollmentStatus(enrollmentId, { status: nextStatus, statusReason: reason });
    await refreshAll();
    if (detail.dataset.enrollmentId === enrollmentId) await openDetail(enrollmentId);
  }

  async function refreshAll() {
    const [overview] = await Promise.all([api.overview()]);
    renderOverview(overview);
    if (courseFilter.value) await loadCourseEnrollments(courseFilter.value);
  }

  /* eventos --------------------------------------------------------- */

  newForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    newFeedback.textContent = '';
    const data = new FormData(newForm);
    const cents = toCents(data.get('installmentValue'));
    if (Number.isNaN(cents)) {
      newFeedback.textContent = 'Informe um valor de parcela válido.';
      return;
    }
    try {
      await api.createEnrollment({
        userId: data.get('userId'),
        courseId: data.get('courseId'),
        installmentsCount: Number(data.get('installmentsCount')),
        installmentValueCents: cents,
        firstDueDate: data.get('firstDueDate'),
      });
      newForm.reset();
      document.getElementById('enroll-installments').value = '1';
      newFeedback.textContent = 'Matrícula criada com as parcelas geradas.';
      courseFilter.value = data.get('courseId');
      await refreshAll();
    } catch (error) {
      newFeedback.textContent = error instanceof ApiError
        ? (createEnrollmentErrors[error.code] || 'Não foi possível criar a matrícula.')
        : 'Não foi possível criar a matrícula.';
    }
  });

  courseFilter.addEventListener('change', () => loadCourseEnrollments(courseFilter.value));

  enrollmentTableBody.addEventListener('click', async (event) => {
    const open = event.target.closest('[data-open]');
    const toggle = event.target.closest('[data-toggle]');
    if (open) {
      await openDetail(open.dataset.open);
    } else if (toggle) {
      const row = currentRows.find((item) => item.id === toggle.dataset.toggle);
      if (row) await toggleStatus(row.id, row.status === 'ativa' ? 'inativa' : 'ativa');
    }
  });

  detail.addEventListener('click', async (event) => {
    if (event.target.closest('[data-detail-close]')) {
      detail.hidden = true;
      detail.dataset.enrollmentId = '';
      return;
    }
    const toggle = event.target.closest('[data-detail-toggle]');
    if (toggle) {
      const data = await api.enrollment(detail.dataset.enrollmentId);
      await toggleStatus(data.id, data.status === 'ativa' ? 'inativa' : 'ativa');
      return;
    }
    const payment = event.target.closest('[data-payment]');
    if (payment) {
      const paid = payment.dataset.paid !== 'true';
      await api.setPaymentPaid(detail.dataset.enrollmentId, payment.dataset.payment, paid);
      await openDetail(detail.dataset.enrollmentId);
      await refreshAll();
    }
  });

  detail.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-plan-form]');
    if (!form) return;
    event.preventDefault();
    const feedback = form.querySelector('[data-plan-feedback]');
    feedback.textContent = '';
    const data = new FormData(form);
    const cents = toCents(data.get('installmentValue'));
    if (Number.isNaN(cents)) {
      feedback.textContent = 'Informe um valor de parcela válido.';
      return;
    }
    try {
      await api.updatePlan(detail.dataset.enrollmentId, {
        installmentsCount: Number(data.get('installmentsCount')),
        installmentValueCents: cents,
        firstDueDate: data.get('firstDueDate'),
      });
      await openDetail(detail.dataset.enrollmentId);
      await refreshAll();
    } catch (error) {
      feedback.textContent = error instanceof ApiError
        ? (createEnrollmentErrors[error.code] || 'Não foi possível salvar o plano.')
        : 'Não foi possível salvar o plano.';
    }
  });

  /* carga inicial -------------------------------------------------- */

  ([courses, students] = await Promise.all([api.courses(), api.students()]));
  fillSelect(studentSelect, students.map((s) => ({ value: s.id, label: `${s.name} (${s.email})` })), 'Selecione um aluno');
  fillSelect(courseSelect, courses.map((c) => ({ value: c.id, label: c.title })), 'Selecione um curso');
  courseFilter.innerHTML = `<option value="">Selecione um curso</option>` +
    courses.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join('');

  await refreshAll();
  if (courses.length) {
    courseFilter.value = courses[0].id;
    await loadCourseEnrollments(courses[0].id);
  }
}
