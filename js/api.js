export class ApiError extends Error {
  constructor(status, code, reason) {
    super(code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
    this.reason = reason || '';
  }
}

async function request(path, { method = 'GET', body, form } = {}) {
  const options = { method, credentials: 'include', headers: {} };
  if (form) {
    options.body = form;
  } else if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`/api${path}`, options);
  if (response.status === 204) return null;

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload?.error, payload?.reason);
  }
  return payload;
}

export const api = {
  // auth
  me: () => request('/auth/me'),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  register: (body) => request('/auth/register', { method: 'POST', body }),
  verifyEmail: (token) => request('/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: (email) => request('/auth/resend-verification', { method: 'POST', body: { email } }),
  setPassword: (token, password) => request('/auth/set-password', { method: 'POST', body: { token, password } }),
  changePassword: (currentPassword, newPassword) =>
    request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
  logout: () => request('/auth/logout', { method: 'POST' }),

  // cursos
  courses: () => request('/courses'),
  coursesMine: () => request('/courses/mine'),
  course: (id) => request(`/courses/${id}`),
  createCourse: (body) => request('/courses', { method: 'POST', body }),
  updateCourse: (id, body) => request(`/courses/${id}`, { method: 'PATCH', body }),
  deleteCourse: (id) => request(`/courses/${id}`, { method: 'DELETE' }),
  courseContent: (id) => request(`/courses/${id}/content`),
  addLesson: (id, form) => request(`/courses/${id}/lessons`, { method: 'POST', form }),
  deleteLesson: (id, lessonId) => request(`/courses/${id}/lessons/${lessonId}`, { method: 'DELETE' }),

  // eBooks
  ebooks: () => request('/ebooks'),
  ebook: (id) => request(`/ebooks/${id}`),
  ebooksManage: () => request('/ebooks/manage'),
  createEbook: (form) => request('/ebooks', { method: 'POST', form }),
  updateEbook: (id, form) => request(`/ebooks/${id}`, { method: 'PATCH', form }),
  deleteEbook: (id) => request(`/ebooks/${id}`, { method: 'DELETE' }),

  // pedidos de eBook
  createEbookOrder: (body) => request('/ebook-orders', { method: 'POST', body }),
  ebookOrders: (status) => request(`/ebook-orders${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  ebookOrder: (id) => request(`/ebook-orders/${id}`),
  orderPaymentLink: (id, body) => request(`/ebook-orders/${id}/payment-link`, { method: 'POST', body }),
  orderMarkPaid: (id) => request(`/ebook-orders/${id}/mark-paid`, { method: 'POST' }),
  orderCancel: (id, reason) => request(`/ebook-orders/${id}/cancel`, { method: 'POST', body: { reason } }),
  orderResend: (id, kind) => request(`/ebook-orders/${id}/resend`, { method: 'POST', body: { kind } }),
  updateOrderEmail: (id, buyerEmail) => request(`/ebook-orders/${id}`, { method: 'PATCH', body: { buyerEmail } }),
  deleteEbookOrder: (id) => request(`/ebook-orders/${id}`, { method: 'DELETE' }),
  myEbookOrders: () => request('/ebook-orders/mine'),
  myEbookDownload: (id) => request(`/ebook-orders/mine/${id}/download`, { method: 'POST' }),

  // autores
  authors: () => request('/authors'),
  createAuthor: (body) => request('/authors', { method: 'POST', body }),
  updateAuthor: (id, body) => request(`/authors/${id}`, { method: 'PATCH', body }),
  reinviteAuthor: (id) => request(`/authors/${id}/reinvite`, { method: 'POST' }),
  deleteAuthor: (id) => request(`/authors/${id}`, { method: 'DELETE' }),

  // alunos
  students: () => request('/students'),
  createStudent: (body) => request('/students', { method: 'POST', body }),
  updateStudent: (id, body) => request(`/students/${id}`, { method: 'PATCH', body }),
  resetStudentPassword: (id) => request(`/students/${id}/password-reset`, { method: 'POST' }),
  deleteStudent: (id) => request(`/students/${id}`, { method: 'DELETE' }),
  studentEnrollments: (id) => request(`/students/${id}/enrollments`),

  // matrículas
  enrollmentsByCourse: (courseId) => request(`/enrollments?courseId=${encodeURIComponent(courseId)}`),
  myEnrollments: () => request('/enrollments/mine'),
  requestEnrollment: (courseId) => request('/enrollments/request', { method: 'POST', body: { courseId } }),
  enrollment: (id) => request(`/enrollments/${id}`),
  createEnrollment: (body) => request('/enrollments', { method: 'POST', body }),
  setEnrollmentStatus: (id, body) => request(`/enrollments/${id}`, { method: 'PATCH', body }),
  updatePlan: (id, body) => request(`/enrollments/${id}/plan`, { method: 'PUT', body }),
  deleteEnrollment: (id) => request(`/enrollments/${id}`, { method: 'DELETE' }),
  setPaymentPaid: (enrollmentId, paymentId, paid) =>
    request(`/enrollments/${enrollmentId}/payments/${paymentId}`, { method: 'PATCH', body: { paid } }),

  // visão geral
  overview: () => request('/overview'),
};
