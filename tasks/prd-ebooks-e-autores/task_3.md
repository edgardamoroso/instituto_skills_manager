# Tarefa 3.0: Autores — backend

## Visão geral

CRUD de autores sobre a tabela `users` (papel `author`), com onboarding por link de
definição de senha enviado por e-mail (reaproveitando `email_tokens`). Bloqueio de login
para autores desativados.

<skills>
### Conformidade com skills
- `tests` — unit do serviço + integração das rotas; e-mail verificado na outbox.
- `no-workarounds` — `pendingInvite` derivado de estado real (token válido + senha ainda não definida), não flag manual frágil.
- `javascript` / `code-standards` — serviço sem `req`/`res`, funções ≤ 30 linhas, input como objeto.
- `folder-structure` — `services/authorService.js`, `routes/authorRoutes.js`.
</skills>

<requirements>
- RF25, RF26, RF27, RF28 (papel `author`).
- Autor criado com `email_verified=1`, `active=1`, senha inacessível até o convite ser concluído.
- `email_tokens.purpose='set_password'`, expiração 72 h.
- `PATCH active:false` invalida sessões do autor; `login` de `active=0` → `401 ACCOUNT_DISABLED`.
- `DELETE` recusa autor que assina cursos (`409 AUTHOR_HAS_COURSES`).
</requirements>

## Subtarefas

- [ ] 3.1 `services/authorService.js`: `listAuthors`, `createAuthor({name,email,bio})`, `updateAuthor(id,{name?,bio?,active?})`, `reinviteAuthor(id)`, `deleteAuthor(id)` (ver TechSpec → Principais interfaces + endpoints `/api/authors`).
- [ ] 3.2 `services/authService.js`: `issuePasswordSet(user)` (apaga tokens `set_password` do user, cria token +72 h, envia e-mail com `definir-senha.html?token=…`); `completePasswordSet(token, password)` (valida token, regra de senha 8–200, grava hash, apaga tokens, cria sessão, retorna `{user, session}`); `login` passa a checar `row.active`.
- [ ] 3.3 `routes/authorRoutes.js`: `GET/POST/PATCH/DELETE /api/authors`, `POST /api/authors/:id/reinvite` — todas `requireAdmin`; `audit('author.*')`.
- [ ] 3.4 `routes/authRoutes.js`: `POST /api/auth/set-password` (público, sem `requireAuth`), `setSessionCookie` no sucesso; `rateLimit('set-password-ip', 10 / 15 min)`.
- [ ] 3.5 Registrar `authorRoutes` em `app.js` (`app.use('/api/authors', …)`).
- [ ] 3.6 E-mails PT-BR (convite / reenvio) no padrão de `issueVerification`.

## Detalhes de implementação

Ver `techspec.md` → **Endpoints da API** (`GET/POST/PATCH/DELETE /api/authors`,
`/reinvite`, `POST /api/auth/set-password`), **`AuthorAdmin`**, **`ErrorCode`** (linhas
`AUTHOR_*`, `PASSWORD_SET_INVALID`, `ACCOUNT_DISABLED`), **Fluxo de dados → Autor**.

## Critérios de sucesso

- Criar autor gera `users(role='author')` + token + e-mail na outbox; resposta `pendingInvite:true`.
- `set-password` com token válido → sessão ativa; token expirado/inexistente → `400 PASSWORD_SET_INVALID`.
- Desativar autor derruba a sessão dele e impede novo login.
- Excluir autor com curso → `409`; sem curso → `204`.

## Testes da tarefa

### Testes unitários
- [ ] `authorService.createAuthor`: papel `author`, `active=1`, `pendingInvite=true`; e-mail em uso → `AUTHOR_EMAIL_IN_USE`; nome/e-mail ausente → `AUTHOR_FIELDS_REQUIRED`.
- [ ] `authorService.updateAuthor`: altera `bio`; `active:false` retorna `active:false`.
- [ ] `authorService.deleteAuthor`: com curso → `AUTHOR_HAS_COURSES`.
- [ ] `authService.completePasswordSet`: token expirado → `PASSWORD_SET_INVALID`; senha < 8 → `PASSWORD_TOO_SHORT`.

### Testes de integração
- [ ] `POST /api/authors` (admin) → 201 + token/e-mail; `student`/anônimo → 403/401.
- [ ] Fluxo completo: criar autor → `POST /api/auth/set-password` com o token da outbox → 200 `{user}` + cookie; `GET /api/auth/me` autentica.
- [ ] `PATCH /api/authors/:id {active:false}` → sessão anterior do autor deixa de autenticar; `POST /api/auth/login` → `401 ACCOUNT_DISABLED`.
- [ ] `POST /api/authors/:id/reinvite` → novo token na outbox, token antigo inválido.
- [ ] `DELETE /api/authors/:id` com curso associado → 409; depois de remover o vínculo → 204.
- [ ] Regressão: `register`/`verify-email`/`login` de aluno inalterados.

### Testes E2E (se aplicável)
- N/A (tela em 4.0).

## Arquivos relevantes

- `backend/src/services/authorService.js`, `backend/src/routes/authorRoutes.js` (novos)
- `backend/src/services/authService.js`, `backend/src/routes/authRoutes.js`, `backend/src/app.js` (mod.)
- `backend/test/authors/*.test.js`, `backend/test/auth/set-password.test.js` (novos)
