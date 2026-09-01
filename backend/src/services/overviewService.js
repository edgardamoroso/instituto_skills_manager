import { db } from '../db/index.js';
import { todayISO } from '../lib/dates.js';

const countCoursesStmt = db.prepare('SELECT count(*) AS total FROM courses');
const countStudentsStmt = db.prepare("SELECT count(*) AS total FROM users WHERE role = 'student'");
const enrollmentStatusStmt = db.prepare('SELECT status, count(*) AS total FROM enrollments GROUP BY status');
const paymentsStmt = db.prepare(
  `SELECT p.amount_cents, p.due_date, p.paid_at, e.course_id
   FROM payments p JOIN enrollments e ON e.id = p.enrollment_id`,
);
const courseRowsStmt = db.prepare('SELECT id, title, type FROM courses ORDER BY title ASC');
const enrollmentsByCourseStmt = db.prepare(
  `SELECT course_id,
          count(*) AS total,
          SUM(CASE WHEN status = 'ativa' THEN 1 ELSE 0 END) AS active
   FROM enrollments GROUP BY course_id`,
);

export function getOverview() {
  const today = todayISO();
  const statusCounts = { ativa: 0, inativa: 0 };
  for (const row of enrollmentStatusStmt.all()) statusCounts[row.status] = row.total;

  const totals = { plannedCents: 0, paidCents: 0, overdueCents: 0, outstandingCents: 0 };
  const perCourse = new Map();
  for (const payment of paymentsStmt.all()) {
    const bucket = perCourse.get(payment.course_id) || { plannedCents: 0, paidCents: 0, overdueCents: 0 };
    bucket.plannedCents += payment.amount_cents;
    totals.plannedCents += payment.amount_cents;
    if (payment.paid_at) {
      bucket.paidCents += payment.amount_cents;
      totals.paidCents += payment.amount_cents;
    } else {
      totals.outstandingCents += payment.amount_cents;
      if (payment.due_date < today) {
        bucket.overdueCents += payment.amount_cents;
        totals.overdueCents += payment.amount_cents;
      }
    }
    perCourse.set(payment.course_id, bucket);
  }

  const enrollmentAgg = new Map();
  for (const row of enrollmentsByCourseStmt.all()) {
    enrollmentAgg.set(row.course_id, { total: row.total, active: row.active });
  }

  const courses = courseRowsStmt.all().map((course) => {
    const money = perCourse.get(course.id) || { plannedCents: 0, paidCents: 0, overdueCents: 0 };
    const enrollmentInfo = enrollmentAgg.get(course.id) || { total: 0, active: 0 };
    return {
      id: course.id,
      title: course.title,
      type: course.type,
      enrollments: enrollmentInfo.total,
      activeEnrollments: enrollmentInfo.active,
      plannedCents: money.plannedCents,
      paidCents: money.paidCents,
      overdueCents: money.overdueCents,
    };
  });

  return {
    counts: {
      courses: countCoursesStmt.get().total,
      students: countStudentsStmt.get().total,
      enrollmentsActive: statusCounts.ativa || 0,
      enrollmentsInactive: statusCounts.inativa || 0,
    },
    totals,
    courses,
  };
}
