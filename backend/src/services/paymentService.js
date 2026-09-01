import { db } from '../db/index.js';
import { todayISO } from '../lib/dates.js';
import { notFound } from '../lib/errors.js';

const listByEnrollmentStmt = db.prepare(
  'SELECT * FROM payments WHERE enrollment_id = ? ORDER BY number ASC',
);
const getPaymentStmt = db.prepare('SELECT * FROM payments WHERE id = ?');
const setPaidStmt = db.prepare('UPDATE payments SET paid_at = ? WHERE id = ?');

export function paymentStatus(row, today = todayISO()) {
  if (row.paid_at) return 'paga';
  if (row.due_date < today) return 'atrasada';
  return 'pendente';
}

export function paymentToApi(row, today = todayISO()) {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    number: row.number,
    dueDate: row.due_date,
    amountCents: row.amount_cents,
    paidAt: row.paid_at,
    status: paymentStatus(row, today),
  };
}

// Resumo financeiro de uma matrícula a partir das parcelas.
export function summarizePayments(rows, today = todayISO()) {
  const summary = {
    total: rows.length,
    paidCount: 0,
    overdueCount: 0,
    pendingCount: 0,
    plannedCents: 0,
    paidCents: 0,
    overdueCents: 0,
    outstandingCents: 0,
  };
  for (const row of rows) {
    summary.plannedCents += row.amount_cents;
    const status = paymentStatus(row, today);
    if (status === 'paga') {
      summary.paidCount += 1;
      summary.paidCents += row.amount_cents;
    } else {
      summary.outstandingCents += row.amount_cents;
      if (status === 'atrasada') {
        summary.overdueCount += 1;
        summary.overdueCents += row.amount_cents;
      } else {
        summary.pendingCount += 1;
      }
    }
  }
  summary.delinquent = summary.overdueCount > 0;
  return summary;
}

export function listPaymentsByEnrollment(enrollmentId) {
  return listByEnrollmentStmt.all(enrollmentId).map((row) => paymentToApi(row));
}

export function getPaymentRows(enrollmentId) {
  return listByEnrollmentStmt.all(enrollmentId);
}

export function setPaymentPaid(paymentId, paid) {
  const row = getPaymentStmt.get(paymentId);
  if (!row) throw notFound('PAYMENT_NOT_FOUND');
  const paidAt = paid ? (row.paid_at || new Date().toISOString()) : null;
  setPaidStmt.run(paidAt, paymentId);
  return paymentToApi(getPaymentStmt.get(paymentId));
}
