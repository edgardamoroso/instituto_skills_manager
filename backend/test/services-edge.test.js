import './helpers/harness.js';
import { removeDbFile } from './helpers/harness.js';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { db } from '../src/db/index.js';
import { createAuthor, updateAuthor, reinviteAuthor, getAuthor } from '../src/services/authorService.js';
import { createCourse, updateCourse, getCourseContent, deleteCourse } from '../src/services/courseService.js';
import { createEbook } from '../src/services/ebookService.js';
import { createOrder, updateBuyerEmail, resendOrderEmail, cancelOrder, getOrder } from '../src/services/ebookOrderService.js';
import { listEnrollmentsByCourse } from '../src/services/enrollmentService.js';
import { getStudent, updateStudent } from '../src/services/studentService.js';
import { clearOutbox, sentMessages } from '../src/lib/mailer.js';

after(async () => removeDbFile());

const CPF = '39053344705';

test('authorService: updateAuthor sem campos mantém tudo; NOT_FOUND', () => {
  const author = createAuthor({ name: 'Base', email: `e-${crypto.randomUUID()}@x.com`, bio: 'b' });
  const same = updateAuthor(author.id, {});
  assert.equal(same.name, 'Base');
  assert.equal(same.bio, 'b');
  assert.throws(() => updateAuthor('nada', {}), /AUTHOR_NOT_FOUND/);
  assert.throws(() => reinviteAuthor('nada'), /AUTHOR_NOT_FOUND/);
  assert.throws(() => getAuthor('nada'), /AUTHOR_NOT_FOUND/);
});

test('courseService: admin authorId vazio limpa autor; curso inexistente', () => {
  const author = createAuthor({ name: 'C', email: `e-${crypto.randomUUID()}@x.com` });
  const admin = { id: 'admin-id', role: 'admin' };
  const course = createCourse({ title: 'T', type: 'gravado', description: 'd', duration: '1h', priceCents: '100', authorId: author.id }, admin);
  assert.equal(course.author.id, author.id);

  const cleared = updateCourse(course.id, { title: 'T', type: 'gravado', description: 'd', duration: '1h', priceCents: '100', authorId: '' }, admin);
  assert.equal(cleared.author, null);

  assert.throws(() => updateCourse('nada', { title: 'T', type: 'gravado', description: 'd', duration: '1h', priceCents: '1' }, admin), /COURSE_NOT_FOUND/);
  assert.throws(() => deleteCourse('nada', admin), /COURSE_NOT_FOUND/);
});

test('courseService: getCourseContent — sem usuário 401, matrícula inativa com motivo', () => {
  const admin = { id: 'a', role: 'admin' };
  const course = createCourse({ title: 'Prot', type: 'gravado', description: 'd', duration: '1h', priceCents: '100' }, admin);
  assert.throws(() => getCourseContent(course.id, null), /AUTH_REQUIRED/);

  const studentId = crypto.randomUUID();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, 'S', ?, 'h', 'student', 1)").run(studentId, `s-${studentId}@x.com`);
  db.prepare("INSERT INTO enrollments (id, user_id, course_id, status, status_reason) VALUES (?, ?, ?, 'inativa', 'pagamento pendente')")
    .run(crypto.randomUUID(), studentId, course.id);
  try {
    getCourseContent(course.id, { id: studentId, role: 'student' });
    assert.fail('deveria lançar');
  } catch (error) {
    assert.equal(error.code, 'ENROLLMENT_INACTIVE');
    assert.equal(error.reason, 'pagamento pendente');
  }
});

test('ebookOrderService: updateBuyerEmail, cancel com motivo, resend inválido', () => {
  clearOutbox();
  const ebook = createEbook({ title: 'E', description: 'd', mode: 'venda_no_site', priceCents: '1000' });
  db.prepare("UPDATE ebooks SET status = 'publicado', file_path = 'x.pdf', file_name = 'x.pdf' WHERE id = ?").run(ebook.id);
  const { id } = createOrder({ ebookId: ebook.id, name: 'N', email: 'a@b.com', phone: '1', cpf: CPF, birthdate: '1990-01-01', paymentMethod: 'pix' });

  const updated = updateBuyerEmail(id, 'NOVO@Ex.com');
  assert.equal(updated.buyerEmail, 'novo@ex.com');

  // resend payment sem link ainda → ORDER_STATE_INVALID
  assert.throws(() => resendOrderEmail(id, 'payment'), /ORDER_STATE_INVALID/);
  // resend delivery antes de entregue → ORDER_STATE_INVALID
  assert.throws(() => resendOrderEmail(id, 'delivery'), /ORDER_STATE_INVALID/);
  // kind desconhecido
  assert.throws(() => resendOrderEmail(id, 'xpto'), /ORDER_FIELDS_REQUIRED/);

  const cancelled = cancelOrder(id, 'desistiu');
  assert.equal(cancelled.status, 'cancelado');
  assert.equal(getOrder(id).statusReason, 'desistiu');
  assert.throws(() => cancelOrder(id), /ORDER_STATE_INVALID/); // já cancelado
});

test('ebookOrderService: getOrder / updateBuyerEmail NOT_FOUND', () => {
  assert.throws(() => getOrder('nada'), /ORDER_NOT_FOUND/);
  assert.throws(() => updateBuyerEmail('nada', 'a@b.com'), /ORDER_NOT_FOUND/);
});

test('enrollmentService: listEnrollmentsByCourse de curso inexistente → 404', () => {
  assert.throws(() => listEnrollmentsByCourse('nao-existe'), /COURSE_NOT_FOUND/);
});

test('studentService: getStudent/updateStudent NOT_FOUND; update troca senha', () => {
  assert.throws(() => getStudent('nada'), /STUDENT_NOT_FOUND/);
  assert.throws(() => updateStudent('nada', { name: 'X', email: 'a@b.com' }), /STUDENT_NOT_FOUND/);

  const id = crypto.randomUUID();
  db.prepare("INSERT INTO users (id, name, email, password_hash, role, email_verified) VALUES (?, 'S', ?, 'h', 'student', 1)").run(id, `st-${id}@x.com`);
  const updated = updateStudent(id, { name: 'Novo', email: `st-${id}@x.com`, phone: '9', address: 'R', password: 'trocada-1234' });
  assert.equal(updated.name, 'Novo');
});
