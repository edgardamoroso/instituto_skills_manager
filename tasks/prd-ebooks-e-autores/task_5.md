# Tarefa 5.0: Autor nos cursos (ownership, `/mine`, exibição pública)

## Visão geral

Ligar autores aos cursos: `courses.author_id`, novo _guard_ `requireCourseEditor`,
verificação de propriedade no `courseService` para toda escrita feita por autor, endpoint
`GET /api/courses/mine`, tela "Meus cursos" (reuso da tela de cursos existente) e exibição
do autor no catálogo público e na página do curso.

<skills>
### Conformidade com skills
- `no-workarounds` — autorização checada no **backend** por propriedade real do recurso; o frontend só esconde.
- `tests` — unit de `courseService` (ownership, `courseToApi`) + integração das rotas com sessão de autor e de admin.
- `javascript` / `code-standards` — `actor` passado como parte do input; funções ≤ 30 linhas; guardas em vez de aninhar.
- `folder-structure` — mudanças em `services/`, `routes/`, `middleware/`.
</skills>

<requirements>
- RF29, RF30, RF31, RF32, RF33, RF34, RF35, RF36.
- Autor cria curso ⇒ `author_id` = ele; edita/exclui/gerencia aulas **só** dos próprios (`403 COURSE_FORBIDDEN`).
- Autor **não** acessa alunos, matrículas, pagamentos, eBooks, pedidos, outros autores.
- `GET /api/courses` e `GET /api/courses/:id` passam a incluir `author` (aditivo).
- Cursos existentes sem autor não quebram nenhuma página ("Autor não informado").
</requirements>

## Subtarefas

- [ ] 5.1 `middleware/auth.js`: `requireCourseEditor` (401 sem sessão; 403 se `role ∉ {admin, author}`).
- [ ] 5.2 `services/courseService.js`: `courseToApi` inclui `author: {id,name,bio}|null` (via `LEFT JOIN users`); `createCourse(input, actor)` (autor força `author_id`; admin usa `input.authorId` opcional, validando `role='author'` → `COURSE_AUTHOR_INVALID`); `updateCourse/deleteCourse/addLesson/deleteLesson` recebem `actor` e aplicam `assertCourseOwnership(course, actor)`; `listCoursesByAuthor(authorId)`.
- [ ] 5.3 `routes/courseRoutes.js`: trocar `requireAdmin` por `requireCourseEditor` no CRUD e nas aulas; repassar `request.user`; nova rota `GET /api/courses/mine` (`requireCourseEditor` → autor: seus cursos; admin: todos). `audit` mantém a ação (`course.*`, `lesson.*`), agora com `actor_user_id` do autor.
- [ ] 5.4 `meus-cursos.html` (`data-page="my-courses"`) reusa `js/admin-courses.js`: o módulo detecta a página e usa `api.coursesMine()` em vez de `api.courses()`; o editor (`gerenciar-curso.html`) já serve os dois papéis (backend faz o _gate_).
- [ ] 5.5 `js/api.js`: `coursesMine()`; `createCourse` aceita `authorId` opcional.
- [ ] 5.6 `js/session.js`: nav mostra "Meus cursos" quando `role === 'author'`; `guardCourseEditor` (admin ou autor) para `meus-cursos.html` e `gerenciar-curso.html`.
- [ ] 5.7 Editor de curso do admin (`admin.html`/`gerenciar-curso.html`): campo _select_ "Autor" populado por `api.authors()` (só admin vê/edita).
- [ ] 5.8 `js/catalog.js` e `js/course-page.js`: exibir "Autor: Nome" (e bio quando houver); ocultar rótulo se `author == null`.

## Detalhes de implementação

Ver `techspec.md` → **`CourseAuthor` + delta nos contratos de curso**, **Endpoints →
`GET /api/courses/mine`** e **`POST/PATCH/DELETE /api/courses[...]`**, **`middleware/auth.js`**,
**Fluxo de dados → Autor**.

## Critérios de sucesso

- Autor logado vê e edita só os seus cursos; tentativa em curso alheio → `403`.
- Admin atribui/troca autor de qualquer curso, inclusive os semeados.
- Página pública do curso mostra o autor; curso sem autor exibe "Autor não informado".
- Fluxos de matrícula/pagamento/área do aluno inalterados.

## Testes da tarefa

### Testes unitários
- [ ] `courseToApi` inclui `author` quando `author_id` setado; `null` quando não.
- [ ] `createCourse` com `actor.role='author'` grava `author_id = actor.id` e ignora `input.authorId`.
- [ ] `assertCourseOwnership`: autor dono → ok; autor não-dono → `COURSE_FORBIDDEN`; admin → sempre ok.
- [ ] `requireCourseEditor`: 401 sem sessão; 403 `student`; segue para admin e author.

### Testes de integração
- [ ] Admin `POST /api/courses {authorId}` → `GET /api/courses/:id` traz `author`.
- [ ] Autor `POST /api/courses` → curso criado com ele como autor; aparece em `GET /api/courses/mine`; não aparece o de outro autor.
- [ ] Autor `PATCH`/`DELETE`/`POST :id/lessons` em curso de terceiro → 403; nos próprios → ok.
- [ ] Autor `GET /api/students` / `/api/enrollments` / `/api/authors` → 403.
- [ ] `GET /api/courses` (público) continua com os campos antigos + `author`; curso semeado → `author: null`.
- [ ] `audit_log` registra `course.update` com `actor_user_id` do autor.

### Testes E2E (se aplicável)
- [ ] Manual: autor cria curso + aula pela tela "Meus cursos"; catálogo mostra o autor.

## Arquivos relevantes

- `backend/src/middleware/auth.js`, `backend/src/services/courseService.js`, `backend/src/routes/courseRoutes.js` (mod.)
- `meus-cursos.html` (novo); `js/admin-courses.js`, `js/api.js`, `js/session.js`, `js/catalog.js`, `js/course-page.js`, `admin.html`/`gerenciar-curso.html` (mod.)
- `backend/test/courses/author-ownership.test.js`, `backend/test/courses/mine.test.js` (novos)
