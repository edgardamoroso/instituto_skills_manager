import { Router } from 'express';
import {
  createStudent,
  deleteStudent,
  listStudents,
  resetStudentPassword,
  updateStudent,
} from '../services/studentService.js';
import { listEnrollmentsByUser } from '../services/enrollmentService.js';
import { requireAdmin } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();

router.use(requireAdmin);

router.get('/', wrap((_request, response) => response.json(listStudents())));

router.post('/', wrap((request, response) => {
  const student = createStudent(request.body);
  audit('student.create', { request, target: student.id, detail: student.email });
  response.status(201).json(student);
}));

router.get('/:studentId/enrollments', wrap((request, response) => {
  response.json(listEnrollmentsByUser(request.params.studentId));
}));

router.patch('/:studentId', wrap((request, response) => {
  const student = updateStudent(request.params.studentId, request.body);
  audit('student.update', { request, target: student.id });
  response.json(student);
}));

router.post('/:studentId/password-reset', wrap((request, response) => {
  const result = resetStudentPassword(request.params.studentId);
  audit('student.password_reset', { request, target: request.params.studentId });
  response.json(result);
}));

router.delete('/:studentId', wrap((request, response) => {
  deleteStudent(request.params.studentId);
  audit('student.delete', { request, target: request.params.studentId });
  response.status(204).end();
}));

export default router;
