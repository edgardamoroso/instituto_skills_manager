# Tarefa 4.0: Autores — frontend

## Visão geral

Telas para o admin gerenciar autores e para o autor definir a senha pelo link do e-mail.
Segue o padrão de frontend do projeto (módulos ES em `js/`, despacho por
`body[data-page]` em `js/main.js`, `js/api.js` como wrapper de `fetch`, `styles.css`).

<skills>
### Conformidade com skills
- `javascript` / `code-standards` — módulos ES, `const`, nomes em inglês no código, funções curtas.
- `tests` — o backend cobre a lógica; o frontend é verificado por E2E manual (projeto sem Playwright).
- `react` — **N/A** (frontend é vanilla JS).
</skills>

<requirements>
- RF25, RF26, RF37, RF38, RF40 (aba "Autores" sem reorganizar as existentes).
- `definir-senha.html` acessível sem login; mostra erro claro para token inválido/expirado.
- Formulários com `label` associado, foco visível, mensagens de erro específicas.
</requirements>

## Subtarefas

- [ ] 4.1 `js/api.js`: `authors()`, `createAuthor(body)`, `updateAuthor(id, body)`, `reinviteAuthor(id)`, `deleteAuthor(id)`, `setPassword(token, password)`.
- [ ] 4.2 `autores.html` (`data-page="authors"`) + `js/admin-authors.js`: tabela de autores (`AuthorAdmin`), form de criação, edição inline de nome/bio, _toggle_ ativo, botões "Reenviar convite" e "Remover" (desabilitado com `coursesCount > 0`), estados de erro (`AUTHOR_EMAIL_IN_USE`, `AUTHOR_HAS_COURSES`).
- [ ] 4.3 `definir-senha.html` (`data-page="set-password"`) + `js/set-password.js`: lê `?token=`, campo senha + confirmação, chama `api.setPassword`, em caso de sucesso redireciona para `conta.html`; trata `PASSWORD_SET_INVALID`/`PASSWORD_TOO_SHORT`.
- [ ] 4.4 `js/main.js`: registrar `authors` e `set-password` no mapa de rotas.
- [ ] 4.5 `js/session.js`: `guardAdmin` já cobre `autores.html`; adicionar link "Autores" na navegação admin (junto de "Alunos"/"Matrículas").
- [ ] 4.6 `styles.css`: reuso dos componentes de tabela/formulário existentes; ajustes mínimos.

## Detalhes de implementação

Ver `techspec.md` → **Visão dos componentes → Frontend** (páginas/módulos), **`AuthorAdmin`**,
**Endpoints da API** (`/api/authors*`, `POST /api/auth/set-password`).

## Critérios de sucesso

- Admin cria, edita, desativa, reconvida e remove autor pela tela, com feedback de erro.
- Botão "Remover" some/desabilita quando o autor tem cursos.
- Autor abre o link do e-mail, define a senha e cai logado em `conta.html`.
- Não-admin não acessa `autores.html` (redireciona para login).

## Testes da tarefa

### Testes unitários
- [ ] `js/format.js` (se algo novo, ex.: rótulo de status de convite) — asserção pura.
- [ ] `js/api.js` — os novos métodos montam método/caminho/corpo corretos (teste com `fetch` stub).

### Testes de integração
- [ ] Coberto pelo backend em 3.0 (rotas `/api/authors*`, `set-password`).

### Testes E2E (se aplicável)
- [ ] Manual (checklist no PR): criar autor → receber link (log/SMTP) → definir senha → logar → ver "Meus cursos" (após 5.0).

## Arquivos relevantes

- `autores.html`, `definir-senha.html` (novos)
- `js/admin-authors.js`, `js/set-password.js` (novos)
- `js/api.js`, `js/main.js`, `js/session.js`, `styles.css` (mod.)
- `js/*.test.js` conforme convenção adotada em 1.0
