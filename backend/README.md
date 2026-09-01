# Backend do Instituto Skills Manager

API REST para cursos, aulas e arquivos.

## Executar localmente

```bash
cd backend
npm install
npm start
```

Abra `http://localhost:3000/index.html`.

## Rotas

- `GET /api/courses`
- `GET /api/courses/:courseId`
- `POST /api/courses`
- `PATCH /api/courses/:courseId`
- `DELETE /api/courses/:courseId`
- `POST /api/courses/:courseId/lessons` com `multipart/form-data` e campo `file`
- `DELETE /api/courses/:courseId/lessons/:lessonId`
- `GET /api/students`
- `POST /api/students` com `name`, `address`, `phone`, `email` e `courseId` opcional
- `PATCH /api/students/:studentId`
- `POST /api/students/:studentId/enrollments` com `courseId`
- `DELETE /api/students/:studentId`
- `GET /health`

Os cursos são persistidos em `backend/data/courses.json`, alunos em `backend/data/students.json` e uploads em `backend/uploads/`. Para produção, troque o armazenamento JSON por PostgreSQL/S3 ou serviço equivalente e configure autenticação de administrador.
