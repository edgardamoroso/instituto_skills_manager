import { renderAuthNav } from './session.js';
import { initCatalog } from './catalog.js';
import { initCoursePage } from './course-page.js';
import { initAdminCourses, initCourseEditor } from './admin-courses.js';
import { initAdminStudents } from './admin-students.js';
import { initEnrollmentsPage } from './admin-enrollments.js';
import { initEnrollRequestPage } from './enroll-request.js';
import { initLoginPage, initSignupPage, initVerifyEmailPage } from './auth-pages.js';
import { initAccountPage } from './account.js';
import { initAdminAuthors } from './admin-authors.js';
import { initSetPasswordPage } from './set-password.js';
import { initEbookCatalog, initEbookPage } from './ebooks-catalog.js';
import { initAdminEbooks, initEbookEditor } from './admin-ebooks.js';
import { initAdminOrders } from './admin-orders.js';

const routes = {
  home: initCatalog,
  recorded: initCatalog,
  online: initCatalog,
  course: initCoursePage,
  admin: initAdminCourses,
  'my-courses': initAdminCourses,
  'course-admin': initCourseEditor,
  students: initAdminStudents,
  authors: initAdminAuthors,
  ebooks: initEbookCatalog,
  ebook: initEbookPage,
  'admin-ebooks': initAdminEbooks,
  'ebook-admin': initEbookEditor,
  orders: initAdminOrders,
  enrollments: initEnrollmentsPage,
  enrollment: initEnrollRequestPage,
  login: initLoginPage,
  signup: initSignupPage,
  'verify-email': initVerifyEmailPage,
  'set-password': initSetPasswordPage,
  account: initAccountPage,
};

async function boot() {
  const page = document.body.dataset.page;
  try {
    await renderAuthNav();
  } catch {
    /* nav de login é acessório; não bloqueia a página */
  }
  const handler = routes[page];
  if (handler) {
    try {
      await handler(page);
    } catch (error) {
      console.error('Falha ao iniciar a página', page, error);
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
