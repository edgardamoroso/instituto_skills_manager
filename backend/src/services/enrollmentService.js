import crypto from 'node:crypto';
import { db, transaction } from '../db/index.js';
import { addMonths, isValidISODate, todayISO } from '../lib/dates.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { getPaymentRows, summarizePayments } from './paymentService.js';

const getEnrollmentStmt = db.prepare('SELECT * FROM enrollments WHERE id = ?');
const getUserStmt = db.prepare("SELECT id, name, email, phone FROM users WHERE id = ? AND role = 'student'");
const getCourseStmt = db.prepare('SELECT id, title, type, price_cents FROM courses WHERE id = ?');
const existingEnrollmentStmt = db.prepare('SELECT id FROM enrollments WHERE user_id = ? AND course_id = ?');
const listByCourseStmt = db.prepare(
  `SELECT e.*, u.name AS user_name, u.email AS user_email, u.phone AS user_phone
   FROM enrollments e JOIN users u ON u.id = e.user_id
   WHERE e.course_id = ? ORDER BY u.name ASC`,
);
const listByUserStmt = db.prepare(
  `SELECT e.*, c.title AS course_title, c.type AS course_type
   FROM enrollments e JOIN courses c ON c.id = e.course_id
   WHERE e.user_id = ? ORDER BY c.title ASC`,
);
const insertEnrollmentStmt = db.prepare(
  `INSERT INTO enrollments (id, user_id, course_id, status, status_reason, installments_count, installment_value_cents, first_due_date)
   VALUES (@id, @user_id, @course_id, @status, @status_reason, @installments_count, @installment_value_cents, @first_due_date)`,
);
const insertPaymentStmt = db.prepare(
  `INSERT INTO payments (id, enrollment_id, number, due_date, amount_cents)
   VALUES (@id, @enrollment_id, @number, @due_date, @amount_cents)`,
);
const deletePaymentsStmt = db.prepare('DELETE FROM payments WHERE enrollment_id = ?');
const updateStatusStmt = db.prepare('UPDATE enrollments SET status = ?, status_reason = ? WHERE id = ?');
const deleteEnrollmentStmt = db.prepare('DELETE FROM enrollments WHERE id = ?');

function enrollmentBase(row, today) {
  const summary = summarizePayments(getPaymentRows(row.id), today);
  return {
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    status: row.status,
    statusReason: row.status_reason,
    installmentsCount: row.installments_count,
    installmentValueCents: row.installment_value_cents,
    firstDueDate: row.first_due_date,
    createdAt: row.created_at,
    payment: summary,
    delinquent: summary.delinquent,
  };
}

function generatePayments(enrollmentId, count, valueCents, firstDueDate) {
  transaction(() => {
    for (let index = 0; index < count; index += 1) {
      insertPaymentStmt.run({
        id: crypto.randomUUID(),
        enrollment_id: enrollmentId,
        number: index + 1,
        due_date: addMonths(firstDueDate, index),
        amount_cents: valueCents,
      });
    }
  });
}

export function createEnrollment(input) {
  const user = getUserStmt.get(input.userId);
  if (!user) throw notFound('STUDENT_NOT_FOUND');
  const course = getCourseStmt.get(input.courseId);
  if (!course) throw notFound('COURSE_NOT_FOUND');
  if (existingEnrollmentStmt.get(input.userId, input.courseId)) throw conflict('ALREADY_ENROLLED');

  const count = Number.parseInt(input.installmentsCount, 10);
  const valueCents = Number.parseInt(input.installmentValueCents, 10);
  const firstDueDate = String(input.firstDueDate || '');
  const withPlan = count > 0;
  if (withPlan) {
    if (!Number.isInteger(count) || count < 1 || count > 60) throw badRequest('INSTALLMENTS_INVALID');
    if (!Number.isInteger(valueCents) || valueCents <= 0) throw badRequest('INSTALLMENT_VALUE_INVALID');
    if (!isValidISODate(firstDueDate)) throw badRequest('FIRST_DUE_DATE_INVALID');
  }

  const enrollment = {
    id: crypto.randomUUID(),
    user_id: input.userId,
    course_id: input.courseId,
    status: input.status === 'inativa' ? 'inativa' : 'ativa',
    status_reason: String(input.statusReason || ''),
    installments_count: withPlan ? count : 0,
    installment_value_cents: withPlan ? valueCents : 0,
    first_due_date: withPlan ? firstDueDate : null,
  };
  insertEnrollmentStmt.run(enrollment);
  if (withPlan) generatePayments(enrollment.id, count, valueCents, firstDueDate);
  return getEnrollmentDetail(enrollment.id);
}

// Solicitação feita pelo próprio aluno: cria matrícula inativa, sem plano,
// para o administrador depois definir as parcelas e ativar.
export function requestEnrollment(userId, courseId) {
  if (!getCourseStmt.get(courseId)) throw notFound('COURSE_NOT_FOUND');
  const existing = existingEnrollmentStmt.get(userId, courseId);
  if (existing) return getEnrollmentDetail(existing.id);
  const enrollment = {
    id: crypto.randomUUID(),
    user_id: userId,
    course_id: courseId,
    status: 'inativa',
    status_reason: 'Aguardando definição do plano de pagamento',
    installments_count: 0,
    installment_value_cents: 0,
    first_due_date: null,
  };
  insertEnrollmentStmt.run(enrollment);
  return getEnrollmentDetail(enrollment.id);
}

export function listEnrollmentsByCourse(courseId) {
  if (!getCourseStmt.get(courseId)) throw notFound('COURSE_NOT_FOUND');
  const today = todayISO();
  return listByCourseStmt.all(courseId).map((row) => ({
    ...enrollmentBase(row, today),
    student: { id: row.user_id, name: row.user_name, email: row.user_email, phone: row.user_phone },
  }));
}

export function listEnrollmentsByUser(userId) {
  const today = todayISO();
  return listByUserStmt.all(userId).map((row) => ({
    ...enrollmentBase(row, today),
    course: { id: row.course_id, title: row.course_title, type: row.course_type },
  }));
}

export function getEnrollmentDetail(enrollmentId) {
  const row = getEnrollmentStmt.get(enrollmentId);
  if (!row) throw notFound('ENROLLMENT_NOT_FOUND');
  const user = db.prepare('SELECT id, name, email, phone FROM users WHERE id = ?').get(row.user_id);
  const course = getCourseStmt.get(row.course_id);
  const today = todayISO();
  return {
    ...enrollmentBase(row, today),
    student: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone } : null,
    course: course ? { id: course.id, title: course.title, type: course.type } : null,
    payments: getPaymentRows(enrollmentId)
      .map((payment) => ({
        id: payment.id,
        number: payment.number,
        dueDate: payment.due_date,
        amountCents: payment.amount_cents,
        paidAt: payment.paid_at,
        status: payment.paid_at ? 'paga' : payment.due_date < today ? 'atrasada' : 'pendente',
      })),
  };
}

export function setEnrollmentStatus(enrollmentId, status, reason) {
  if (!getEnrollmentStmt.get(enrollmentId)) throw notFound('ENROLLMENT_NOT_FOUND');
  if (!['ativa', 'inativa'].includes(status)) throw badRequest('STATUS_INVALID');
  updateStatusStmt.run(status, String(reason || '').slice(0, 300), enrollmentId);
  return getEnrollmentDetail(enrollmentId);
}

export function regeneratePlan(enrollmentId, input) {
  const row = getEnrollmentStmt.get(enrollmentId);
  if (!row) throw notFound('ENROLLMENT_NOT_FOUND');
  const count = Number.parseInt(input.installmentsCount, 10);
  const valueCents = Number.parseInt(input.installmentValueCents, 10);
  const firstDueDate = String(input.firstDueDate || '');
  if (!Number.isInteger(count) || count < 1 || count > 60) throw badRequest('INSTALLMENTS_INVALID');
  if (!Number.isInteger(valueCents) || valueCents <= 0) throw badRequest('INSTALLMENT_VALUE_INVALID');
  if (!isValidISODate(firstDueDate)) throw badRequest('FIRST_DUE_DATE_INVALID');

  transaction(() => {
    deletePaymentsStmt.run(enrollmentId);
    db.prepare(
      'UPDATE enrollments SET installments_count = ?, installment_value_cents = ?, first_due_date = ? WHERE id = ?',
    ).run(count, valueCents, firstDueDate, enrollmentId);
  });
  generatePayments(enrollmentId, count, valueCents, firstDueDate);
  return getEnrollmentDetail(enrollmentId);
}

export function deleteEnrollment(enrollmentId) {
  if (!getEnrollmentStmt.get(enrollmentId)) throw notFound('ENROLLMENT_NOT_FOUND');
  deleteEnrollmentStmt.run(enrollmentId);
}
