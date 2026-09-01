import { Router } from 'express';
import {
  createEnrollment,
  deleteEnrollment,
  getEnrollmentDetail,
  listEnrollmentsByCourse,
  listEnrollmentsByUser,
  regeneratePlan,
  requestEnrollment,
  setEnrollmentStatus,
} from '../services/enrollmentService.js';
import { listPaymentsByEnrollment, setPaymentPaid } from '../services/paymentService.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { str } from '../lib/validate.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();
const requestLimiter = rateLimit({ name: 'enroll-request-ip', limit: 20, windowMs: 60 * 60 * 1000 });

// Aluno: apenas as próprias matrículas.
router.get('/mine', requireAuth, wrap((request, response) => {
  response.json(listEnrollmentsByUser(request.user.id));
}));

router.post('/request', requireAuth, requestLimiter, wrap((request, response) => {
  const courseId = str(request.body?.courseId, { code: 'COURSE_ID_REQUIRED', min: 1, max: 100 });
  const result = requestEnrollment(request.user.id, courseId);
  audit('enrollment.request', { request, target: courseId });
  response.status(201).json(result);
}));

router.get('/', requireAdmin, wrap((request, response) => {
  const courseId = str(request.query.courseId, { code: 'COURSE_ID_REQUIRED', min: 1, max: 100 });
  response.json(listEnrollmentsByCourse(courseId));
}));

router.post('/', requireAdmin, wrap((request, response) => {
  const enrollment = createEnrollment(request.body || {});
  audit('enrollment.create', { request, target: enrollment.id, detail: { course: enrollment.courseId, user: enrollment.userId } });
  response.status(201).json(enrollment);
}));

router.get('/:enrollmentId', requireAdmin, wrap((request, response) => {
  response.json(getEnrollmentDetail(request.params.enrollmentId));
}));

router.patch('/:enrollmentId', requireAdmin, wrap((request, response) => {
  const enrollment = setEnrollmentStatus(
    request.params.enrollmentId,
    request.body?.status,
    request.body?.statusReason,
  );
  audit('enrollment.set_status', { request, target: enrollment.id, detail: `${enrollment.status} — ${enrollment.statusReason}` });
  response.json(enrollment);
}));

router.put('/:enrollmentId/plan', requireAdmin, wrap((request, response) => {
  const enrollment = regeneratePlan(request.params.enrollmentId, request.body || {});
  audit('enrollment.set_plan', { request, target: enrollment.id });
  response.json(enrollment);
}));

router.delete('/:enrollmentId', requireAdmin, wrap((request, response) => {
  deleteEnrollment(request.params.enrollmentId);
  audit('enrollment.delete', { request, target: request.params.enrollmentId });
  response.status(204).end();
}));

router.get('/:enrollmentId/payments', requireAdmin, wrap((request, response) => {
  response.json(listPaymentsByEnrollment(request.params.enrollmentId));
}));

router.patch('/:enrollmentId/payments/:paymentId', requireAdmin, wrap((request, response) => {
  const paid = request.body?.paid !== false;
  const payment = setPaymentPaid(request.params.paymentId, paid);
  audit('payment.set_paid', { request, target: request.params.paymentId, detail: paid ? 'paga' : 'em aberto' });
  response.json(payment);
}));

export default router;
