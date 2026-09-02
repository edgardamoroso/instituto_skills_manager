# Especificação técnica

**Feature:** Loja de eBooks digitais + Autoria de cursos
**PRD:** [`prd.md`](./prd.md)
**Data:** 2026-09-02
**Stack alvo:** Node 24 + Express 5 + `node:sqlite`, frontend de módulos ES (padrão atual do repositório)

---

## Resumo

A evolução adiciona três áreas ao backend atual seguindo **exatamente o padrão já
estabelecido** no repositório (`backend/src/{routes,services,db,lib,middleware}`, ESM puro,
`DatabaseSync` com _prepared statements_, handlers via `wrap()`, erros `AppError` com código
string, `audit()` para ações sensíveis):

1. **eBooks** — novas tabelas `ebooks`, `ebook_orders`, `ebook_download_grants`; rotas
   públicas de catálogo, rota pública de criação de pedido (convidado), rota de download
   por _token_, e rotas admin de CRUD de eBooks e de gestão de pedidos. Os arquivos
   principais dos eBooks ficam em um diretório **fora** da árvore servida estaticamente e
   só são entregues por _stream_ autenticado por _token_ de uso limitado. O pagamento é
   **manual** (a equipe gera o link no painel do Asaas e cola no pedido) — não há chamada
   HTTP de saída para o Asaas nesta entrega.

2. **Autores** — o papel `autor` passa a existir em `users.role`; `users` ganha `bio` e
   `active`; `courses` ganha `author_id` (FK opcional). O admin cadastra autores (que
   definem a senha por link enviado por e-mail, reaproveitando `email_tokens`). Autores
   logam e gerenciam **apenas os próprios cursos/aulas**, com a verificação de propriedade
   feita no backend. As telas de curso existentes passam a exibir o autor.

3. **Testabilidade e testes** — `server.js` é dividido em `app.js` (constrói e exporta o
   app) + `server.js` (só `listen`); `mailer.js` ganha uma _outbox_ em memória quando não
   há SMTP; adiciona-se `npm test` com `node --test` + cobertura nativa do Node
   (`--experimental-test-coverage`, sem dependência nova) e uma suíte cobrindo o código
   novo **e** o backend legado até ≥80% global.

Nenhuma mudança de infraestrutura: mesma VM, mesmo Caddy, mesmo SQLite. Todas as mudanças
de schema são aditivas/retrocompatíveis, aplicadas por migração leve no _boot_ (padrão já
usado em `db/index.js`).

---

## Arquitetura do sistema

### Visão dos componentes

**Backend — novos**

| Componente | Responsabilidade |
| --- | --- |
| `db/schema.sql` (mod.) | + tabelas `ebooks`, `ebook_orders`, `ebook_download_grants`; `users` com `bio`/`active` e `role` incluindo `author`; `courses` com `author_id` |
| `db/index.js` (mod.) | Migrações no _boot_: rebuild de `users` (widen do CHECK + colunas), `ALTER TABLE courses ADD author_id`, criação das tabelas de eBook via `schema.sql` |
| `services/ebookService.js` | Regras de eBook: normalização/validação de entrada, modalidade, publicação, CRUD, resolução de caminhos de arquivo |
| `services/ebookOrderService.js` | Ciclo de vida do pedido (máquina de estados), criação por convidado, registro do link de pagamento, marcação de pago, entrega (emissão de _grant_ + e-mail), cancelamento, exclusão (LGPD), consulta "meus eBooks", emissão de _grant_ de download |
| `services/authorService.js` | CRUD de autores sobre `users` (role `author`), ativar/desativar, (re)envio do convite de senha |
| `routes/ebookRoutes.js` | `/api/ebooks` — catálogo público, detalhe, `manage` (admin), CRUD (admin, multipart), `download/:token` |
| `routes/ebookOrderRoutes.js` | `/api/ebook-orders` — criação pública, `mine` (aluno), listagem/detalhe/ações (admin) |
| `routes/authorRoutes.js` | `/api/authors` — CRUD (admin) |
| `lib/cpf.js` | `isValidCpf`, `onlyDigits` — validação de CPF (dígitos verificadores) |
| `lib/storage.js` | Resolução e escrita segura de arquivos protegidos de eBook em `backend/storage/ebooks/` |
| `app.js` | Constrói o `express()` com middlewares e rotas; exporta `app`. Extraído de `server.js` |

**Backend — modificados**

| Componente | Mudança |
| --- | --- |
| `server.js` | Passa a só importar `app` de `app.js` e chamar `listen` |
| `middleware/auth.js` | + `requireCourseEditor` (admin **ou** autor); `attachUser` passa a expor `role` já existente; `requireAdmin` inalterado |
| `services/courseService.js` | `courseToApi` inclui `author`; `createCourse` aceita/normaliza `authorId`; `updateCourse`/`deleteCourse`/`addLesson`/`deleteLesson` recebem `actor` e aplicam _ownership_; novo `listCoursesByAuthor` |
| `routes/courseRoutes.js` | CRUD passa a usar `requireCourseEditor` e a repassar `request.user`; nova rota `GET /api/courses/mine` |
| `services/authService.js` | + `issuePasswordSet(user)`, `completePasswordSet(token, password)` (purpose `set_password` em `email_tokens`); `login` recusa `active = 0` |
| `routes/authRoutes.js` | + `POST /api/auth/set-password` |
| `lib/mailer.js` | _outbox_ em memória (`sentMessages`, `clearOutbox`) quando não há transporte |
| `lib/config.js` | + `ebook.downloadTtlHours`, `ebook.maxDownloads`, `ebook.maxFileMb`, `ebook.storageDir` |
| `db/seed.js` | Mantém cursos/admin; `author_id` fica `NULL` nos cursos semeados |

**Frontend — novos** (`js/` + páginas `*.html`, servidos pela allowlist atual `/js/` e `^/[a-z0-9-]+\.html$`)

| Página (`data-page`) | Módulo | Papel |
| --- | --- | --- |
| `ebooks.html` (`ebooks`) | `js/ebooks-catalog.js` | Catálogo público |
| `ebook.html` (`ebook`) | `js/ebook-page.js` | Detalhe + amostra + formulário de compra + confirmação |
| `admin-ebooks.html` (`admin-ebooks`) | `js/admin-ebooks.js` | Lista/edição de eBooks (admin) |
| `gerenciar-ebook.html` (`ebook-admin`) | `js/admin-ebooks.js` | Editor de um eBook (upload de capa/arquivo/amostra) |
| `pedidos.html` (`orders`) | `js/admin-orders.js` | Fila de pedidos + ações (admin) |
| `autores.html` (`authors`) | `js/admin-authors.js` | CRUD de autores (admin) |
| `meus-cursos.html` (`my-courses`) | `js/admin-courses.js` (reuso) | Lista de cursos do autor logado |
| `definir-senha.html` (`set-password`) | `js/set-password.js` | Autor define a senha pelo token do e-mail |

**Frontend — modificados**

| Arquivo | Mudança |
| --- | --- |
| `js/main.js` | Registra os novos `data-page` no mapa de rotas |
| `js/api.js` | Métodos `ebooks*`, `ebookOrders*`, `authors*`, `coursesMine`, `setPassword` |
| `js/format.js` | + `ebookModeLabel`, `orderStatusLabel`, `cpfMask` |
| `js/session.js` | Nav mostra "Meus cursos" para `role === 'author'`; `guardCourseEditor` |
| `js/admin-courses.js` | Detecta `data-page`: `admin` → `/api/courses`; `my-courses` → `/api/courses/mine` |
| `*.html` (headers) | Novo link "eBooks" no menu público (edição do header em cada página, padrão atual) |
| `styles.css` | Ajustes pontuais: _badge_ de modalidade/estado, formulário de compra, tabela de pedidos |

### Fluxo de dados

**Compra (venda no site)**
`ebook.html` → `POST /api/ebook-orders` (convidado) → `ebook_orders(status='aguardando_link')`
→ admin em `pedidos.html` cola link/id do Asaas → `POST /:id/payment-link`
→ `status='aguardando_pagamento'` + e-mail ao comprador (via `mailer`)
→ comprador paga no Asaas (fora do sistema) → admin confere e `POST /:id/mark-paid`
→ `status='pago'` → serviço cria `ebook_download_grants` + e-mail de entrega
→ `status='entregue'` → comprador acessa `GET /api/ebooks/download/:token` (stream, contador++).

**Link externo**
`ebooks.html`/`ebook.html` renderiza `<a href={external_url} target="_blank" rel="noopener">`
com rótulo derivado do domínio. Sem backend além do `GET /api/ebooks*`.

**Autor**
Admin `POST /api/authors` → cria `users(role='author', active=1)` + `email_tokens(purpose='set_password')`
+ e-mail → autor abre `definir-senha.html?token=…` → `POST /api/auth/set-password` → sessão criada.
Autor em `meus-cursos.html` → `GET /api/courses/mine` → edita via `gerenciar-curso.html`
(`PATCH/POST /api/courses/:id…` com `requireCourseEditor`; serviço verifica `author_id === user.id`).

---

## Design de implementação

### Principais interfaces

```js
// services/ebookService.js
listPublishedEbooks(): EbookPublic[]
getPublishedEbook(id): EbookPublic                     // 404 EBOOK_NOT_FOUND / não publicado
listAllEbooks(): EbookAdmin[]                          // admin (inclui rascunhos)
createEbook(input, files): EbookAdmin                  // input: campos; files: {cover?, file?, sample?}
updateEbook(id, input, files): EbookAdmin              // troca de modalidade bloqueada se há pedidos
deleteEbook(id): void                                  // 409 EBOOK_HAS_ORDERS
resolveEbookFilePath(id): { absPath, downloadName }    // arquivo principal protegido
```

```js
// services/ebookOrderService.js
createOrder(input): { id, status }                     // público; só ebook mode 'venda_no_site'
listOrders({ status? }): EbookOrderAdmin[]              // admin
getOrder(id): EbookOrderAdmin                          // admin
attachPaymentLink(id, { paymentLinkUrl, asaasChargeId }): EbookOrderAdmin  // -> aguardando_pagamento + e-mail
markPaid(id): EbookOrderAdmin                          // -> pago -> entrega (grant + e-mail) -> entregue
cancelOrder(id): EbookOrderAdmin                       // -> cancelado (bloqueado se já entregue)
updateBuyerEmail(id, email): EbookOrderAdmin
resendOrderEmail(id, kind): void                       // kind: 'payment' | 'delivery'
deleteOrder(id): void                                  // LGPD (hard delete + grants em cascata)
listMyDeliveredOrders(userEmail): EbookOrderMine[]     // aluno logado
issueDownloadGrant(orderId): { url, expiresAt }        // novo token; usado na entrega e em "minha conta"
consumeDownload(token): { absPath, downloadName }      // 404/410/429 conforme validade e contador
```

```js
// services/authorService.js
listAuthors(): AuthorAdmin[]
createAuthor({ name, email, bio }): AuthorAdmin        // cria user role='author', envia convite
updateAuthor(id, { name?, bio?, active? }): AuthorAdmin
reinviteAuthor(id): void                               // reemite email_tokens set_password
deleteAuthor(id): void                                 // 409 AUTHOR_HAS_COURSES
```

```js
// services/courseService.js (novos/alterados)
listCoursesByAuthor(authorId): Course[]
createCourse(input, actor): Course                     // actor.role 'author' força author_id = actor.id
updateCourse(id, input, actor): Course                 // 403 COURSE_FORBIDDEN se autor != dono
deleteCourse(id, actor): void
addLesson(courseId, lesson, actor): Lesson
deleteLesson(courseId, lessonId, actor): void
```

```js
// middleware/auth.js
requireCourseEditor(request, response, next)  // 401 se sem sessão; 403 se role ∉ {admin, author}
```

### Modelos de dados

Contratos JSON do backend — prontos para exibição na UI. Campos ausentes são normalizados
para `null`. **Envelope de erro do projeto:** `{ "error": "CODE" }` (string plana), com
`{ "reason": "…" }` opcional — padrão de `lib/http.js`; **não** usar o objeto aninhado.

Valores monetários sempre em **centavos** (`*_cents`, inteiro), como nos cursos.

---

#### `EbookPublic` — eBook no catálogo/detalhe público

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | `string` | sim | UUID |
| `title` | `string` | sim | Título |
| `description` | `string` | sim | Descrição |
| `pages` | `number \| null` | não | Nº de páginas |
| `coverUrl` | `string \| null` | não | `/uploads/…` da capa |
| `mode` | `"venda_no_site" \| "link_externo"` | sim | Modalidade |
| `priceCents` | `number \| null` | não | Preço (obrigatório em `venda_no_site`; referência opcional em `link_externo`) |
| `sampleUrl` | `string \| null` | não | `/uploads/…` da amostra (só `venda_no_site`) |
| `externalUrl` | `string \| null` | não | URL da loja (só `link_externo`) |
| `storeName` | `string \| null` | não | Nome da loja para o rótulo do botão |

```json
{
  "id": "b2c0d1e2-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
  "title": "Gestão de Equipes na Prática",
  "description": "Um guia direto para líderes de primeira viagem.",
  "pages": 120,
  "coverUrl": "/uploads/9f1c2d3e4a5b.png",
  "mode": "venda_no_site",
  "priceCents": 4990,
  "sampleUrl": "/uploads/1a2b3c4d5e6f.pdf",
  "externalUrl": null,
  "storeName": null
}
```

> **Variante `link_externo`:** `priceCents` pode ser `null`; `sampleUrl` é sempre `null`;
> `externalUrl` e `storeName` preenchidos.

```json
{
  "id": "c3d4e5f6-7a8b-9c0d-1e2f-3a4b5c6d7e8f",
  "title": "Comunicação Assertiva",
  "description": "Disponível na Amazon em formato Kindle.",
  "pages": null,
  "coverUrl": "/uploads/aa11bb22cc33.png",
  "mode": "link_externo",
  "priceCents": null,
  "sampleUrl": null,
  "externalUrl": "https://www.amazon.com.br/dp/B0EXAMPLE",
  "storeName": "Amazon"
}
```

#### `EbookAdmin` — eBook na área administrativa

Inclui tudo de `EbookPublic` mais:

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `status` | `"rascunho" \| "publicado"` | sim | Publicação |
| `fileName` | `string \| null` | não | Nome original do arquivo principal (`venda_no_site`) |
| `hasFile` | `boolean` | sim | Se há arquivo principal armazenado |
| `hasSample` | `boolean` | sim | Se há amostra |
| `ordersCount` | `number` | sim | Pedidos associados (trava exclusão/troca de modalidade) |
| `createdAt` | `string` | sim | ISO datetime |

```json
{
  "id": "b2c0d1e2-3f4a-5b6c-7d8e-9f0a1b2c3d4e",
  "title": "Gestão de Equipes na Prática",
  "description": "Um guia direto para líderes de primeira viagem.",
  "pages": 120,
  "coverUrl": "/uploads/9f1c2d3e4a5b.png",
  "mode": "venda_no_site",
  "priceCents": 4990,
  "sampleUrl": "/uploads/1a2b3c4d5e6f.pdf",
  "externalUrl": null,
  "storeName": null,
  "status": "publicado",
  "fileName": "gestao-equipes.pdf",
  "hasFile": true,
  "hasSample": true,
  "ordersCount": 7,
  "createdAt": "2026-09-10 14:03:11"
}
```

#### `EbookOrderAdmin` — pedido na visão do administrador

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | `string` | sim | UUID |
| `ebook` | `{ id, title }` | sim | eBook comprado |
| `buyerName` | `string` | sim | Nome do comprador |
| `buyerEmail` | `string` | sim | E-mail |
| `buyerPhone` | `string` | sim | Telefone |
| `buyerCpf` | `string` | sim | CPF (11 dígitos) — **só neste contrato admin** |
| `buyerBirthdate` | `string` | sim | `YYYY-MM-DD` — **só neste contrato admin** |
| `paymentMethod` | `"pix" \| "credito" \| "debito"` | sim | Preferência informada |
| `amountCents` | `number` | sim | Preço no momento do pedido |
| `status` | `OrderStatus` | sim | Ver máquina de estados |
| `paymentLinkUrl` | `string \| null` | não | Link gerado no Asaas |
| `asaasChargeId` | `string \| null` | não | Id da cobrança no Asaas |
| `paidAt` / `deliveredAt` / `cancelledAt` | `string \| null` | não | ISO datetime |
| `createdAt` / `updatedAt` | `string` | sim | ISO datetime |

```json
{
  "id": "d4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f90",
  "ebook": { "id": "b2c0d1e2-3f4a-5b6c-7d8e-9f0a1b2c3d4e", "title": "Gestão de Equipes na Prática" },
  "buyerName": "Marina Alves",
  "buyerEmail": "marina.alves@example.com",
  "buyerPhone": "(61) 99999-1234",
  "buyerCpf": "39053344705",
  "buyerBirthdate": "1990-04-12",
  "paymentMethod": "pix",
  "amountCents": 4990,
  "status": "aguardando_pagamento",
  "paymentLinkUrl": "https://www.asaas.com/c/abc123",
  "asaasChargeId": "pay_000012345678",
  "paidAt": null,
  "deliveredAt": null,
  "cancelledAt": null,
  "createdAt": "2026-09-12 09:20:00",
  "updatedAt": "2026-09-12 10:05:44"
}
```

#### `EbookOrderMine` — pedido na área do comprador logado

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | `string` | sim | UUID |
| `ebook` | `{ id, title, coverUrl }` | sim | eBook |
| `status` | `"entregue"` | sim | Só pedidos entregues aparecem |
| `deliveredAt` | `string` | sim | ISO datetime |

```json
{
  "id": "d4e5f6a7-8b9c-0d1e-2f3a-4b5c6d7e8f90",
  "ebook": { "id": "b2c0d1e2-3f4a-5b6c-7d8e-9f0a1b2c3d4e", "title": "Gestão de Equipes na Prática", "coverUrl": "/uploads/9f1c2d3e4a5b.png" },
  "status": "entregue",
  "deliveredAt": "2026-09-13 16:40:00"
}
```

> **Sem PII sensível:** `buyerCpf`/`buyerBirthdate` **nunca** aparecem aqui nem em qualquer
> contrato público; só em `EbookOrderAdmin` (rotas `requireAdmin`).

#### `DownloadLink` — resposta ao pedir novo link de download

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `url` | `string` | sim | `https://…/api/ebooks/download/<token>` |
| `expiresAt` | `string` | sim | ISO datetime |

```json
{ "url": "https://skillsmanager.com.br/api/ebooks/download/7f3a…c9", "expiresAt": "2026-09-16 16:40:00" }
```

#### `AuthorAdmin` — autor na área administrativa

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | `string` | sim | UUID (mesmo `users.id`) |
| `name` | `string` | sim | Nome |
| `email` | `string` | sim | E-mail (único) |
| `bio` | `string` | sim | Bio (pode ser `""`) |
| `active` | `boolean` | sim | `false` bloqueia login |
| `pendingInvite` | `boolean` | sim | `true` enquanto não definiu a senha |
| `coursesCount` | `number` | sim | Cursos que assina |
| `createdAt` | `string` | sim | ISO datetime |

```json
{
  "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "name": "Dra. Helena Prado",
  "email": "helena.prado@example.com",
  "bio": "Doutora em Psicologia Organizacional, 15 anos de consultoria.",
  "active": true,
  "pendingInvite": false,
  "coursesCount": 2,
  "createdAt": "2026-09-05 11:00:00"
}
```

#### `CourseAuthor` — autor embutido nos payloads de curso

| Campo | Tipo | Obrigatório | Descrição |
| --- | --- | --- | --- |
| `id` | `string` | sim | UUID do autor |
| `name` | `string` | sim | Nome exibido |
| `bio` | `string` | sim | Bio (pode ser `""`) |

> **Delta nos contratos de curso existentes** (`GET /api/courses`, `GET /api/courses/:id`,
> `GET /api/courses/:id/content`): novo campo `author: CourseAuthor | null`. `null` quando
> `courses.author_id` é `NULL` — o frontend exibe "Autor não informado" ou omite o rótulo
> (RF36). Nenhum campo existente muda.

```json
{
  "id": "gestao-equipes-resultados",
  "title": "Gestão de Equipes para Resultados",
  "type": "gravado",
  "description": "…",
  "duration": "8 horas",
  "priceCents": 7900,
  "lessonCount": 6,
  "author": { "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d", "name": "Dra. Helena Prado", "bio": "…" }
}
```

#### `OrderStatus` — máquina de estados do pedido

| Estado | De onde vem | Transições permitidas |
| --- | --- | --- |
| `aguardando_link` | criação (convidado) | → `aguardando_pagamento` (via `payment-link`), → `cancelado` |
| `aguardando_pagamento` | `payment-link` | → `pago` (via `mark-paid`), → `cancelado` |
| `pago` | `mark-paid` | → `entregue` (automático, mesma transação) |
| `entregue` | entrega concluída | _terminal_ (só `DELETE` LGPD) |
| `cancelado` | qualquer estado pré-`entregue` | _terminal_ |

> Transição inválida → `409 ORDER_STATE_INVALID`. `mark-paid` e a entrega ocorrem na
> **mesma transação SQLite** (`transaction()` de `db/index.js`): grava `paid_at`, cria o
> `ebook_download_grants`, grava `delivered_at`, define `status='entregue'`. O e-mail é
> enviado após o `COMMIT` (o `mailer` nunca lança).

#### `ErrorCode` — códigos desta feature (HTTP conforme `AppError`)

| Código | HTTP | Significado |
| --- | --- | --- |
| `EBOOK_NOT_FOUND` | 404 | eBook inexistente ou não publicado (rota pública) |
| `EBOOK_FIELDS_REQUIRED` | 400 | Título/descrição ausentes |
| `EBOOK_PRICE_INVALID` | 400 | Preço ausente/negativo/fora do teto em `venda_no_site` |
| `EBOOK_FILE_REQUIRED` | 400 | Publicar `venda_no_site` sem arquivo principal |
| `EBOOK_EXTERNAL_URL_INVALID` | 400 | `link_externo` sem URL http(s) válida |
| `EBOOK_MODE_LOCKED` | 409 | Troca de modalidade com pedidos existentes |
| `EBOOK_HAS_ORDERS` | 409 | Exclusão de eBook com pedidos |
| `UPLOAD_TYPE_NOT_ALLOWED` / `FILE_TOO_LARGE` | 400 | Reaproveitados de `courseRoutes` |
| `ORDER_NOT_FOUND` | 404 | Pedido inexistente |
| `ORDER_FIELDS_REQUIRED` | 400 | Campos do comprador ausentes |
| `ORDER_CPF_INVALID` | 400 | CPF com dígitos verificadores inválidos |
| `ORDER_BIRTHDATE_INVALID` | 400 | Data de nascimento não é `YYYY-MM-DD` válida ou é futura |
| `ORDER_EBOOK_NOT_SELLABLE` | 400 | Pedido para eBook `link_externo` ou não publicado |
| `ORDER_STATE_INVALID` | 409 | Transição de estado não permitida |
| `PAYMENT_LINK_INVALID` | 400 | `paymentLinkUrl` não é http(s) |
| `DOWNLOAD_TOKEN_NOT_FOUND` | 404 | Token inexistente |
| `DOWNLOAD_TOKEN_EXPIRED` | 410 | Fora da validade |
| `DOWNLOAD_LIMIT_REACHED` | 429 | `download_count >= max_downloads` |
| `AUTHOR_NOT_FOUND` | 404 | Autor inexistente |
| `AUTHOR_EMAIL_IN_USE` | 409 | E-mail já usado por outro usuário |
| `AUTHOR_HAS_COURSES` | 409 | Exclusão de autor que assina cursos |
| `COURSE_FORBIDDEN` | 403 | Autor tentando editar curso de terceiro |
| `PASSWORD_SET_INVALID` | 400 | Token de definição de senha inválido/expirado |
| `ACCOUNT_DISABLED` | 401 | Login de usuário `active = 0` |

---

### Esquema de banco de dados

#### `ebooks`

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `title` | TEXT NOT NULL | 1–160 |
| `description` | TEXT NOT NULL DEFAULT '' | 0–4000 |
| `pages` | INTEGER | nullable |
| `cover_path` | TEXT NOT NULL DEFAULT '' | `/uploads/…` |
| `mode` | TEXT NOT NULL | `venda_no_site` \| `link_externo` (CHECK) |
| `status` | TEXT NOT NULL DEFAULT 'rascunho' | `rascunho` \| `publicado` (CHECK) |
| `price_cents` | INTEGER NOT NULL DEFAULT 0 | usado nas duas modalidades (referência) |
| `file_path` | TEXT NOT NULL DEFAULT '' | caminho **relativo** dentro de `storage/ebooks/` |
| `file_name` | TEXT NOT NULL DEFAULT '' | nome original p/ download |
| `sample_path` | TEXT NOT NULL DEFAULT '' | `/uploads/…` |
| `sample_name` | TEXT NOT NULL DEFAULT '' | |
| `external_url` | TEXT NOT NULL DEFAULT '' | http(s) |
| `store_name` | TEXT NOT NULL DEFAULT '' | |
| `created_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |

Índice: `idx_ebooks_status ON ebooks(status)`.

#### `ebook_orders`

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `id` | TEXT PK | UUID |
| `ebook_id` | TEXT NOT NULL REFERENCES ebooks(id) ON DELETE RESTRICT | |
| `buyer_name` | TEXT NOT NULL | |
| `buyer_email` | TEXT NOT NULL | minúsculas |
| `buyer_phone` | TEXT NOT NULL DEFAULT '' | |
| `buyer_cpf` | TEXT NOT NULL | 11 dígitos |
| `buyer_birthdate` | TEXT NOT NULL | `YYYY-MM-DD` |
| `payment_method` | TEXT NOT NULL | `pix`\|`credito`\|`debito` (CHECK) |
| `amount_cents` | INTEGER NOT NULL | snapshot |
| `status` | TEXT NOT NULL DEFAULT 'aguardando_link' | CHECK nos 5 estados |
| `payment_link_url` | TEXT NOT NULL DEFAULT '' | |
| `asaas_charge_id` | TEXT NOT NULL DEFAULT '' | |
| `paid_at` / `delivered_at` / `cancelled_at` | TEXT | nullable |
| `created_at` / `updated_at` | TEXT NOT NULL DEFAULT (datetime('now')) | `updated_at` tocado no serviço |

Índices: `idx_orders_status ON ebook_orders(status)`, `idx_orders_email ON ebook_orders(buyer_email)`.

#### `ebook_download_grants`

| Coluna | Tipo | Notas |
| --- | --- | --- |
| `token` | TEXT PK | 32 bytes hex (`crypto.randomBytes`) |
| `order_id` | TEXT NOT NULL REFERENCES ebook_orders(id) ON DELETE CASCADE | |
| `expires_at` | TEXT NOT NULL | ISO datetime |
| `max_downloads` | INTEGER NOT NULL DEFAULT 5 | de `config.ebook.maxDownloads` |
| `download_count` | INTEGER NOT NULL DEFAULT 0 | incremento atômico |
| `created_at` | TEXT NOT NULL DEFAULT (datetime('now')) | |

Índice: `idx_grants_order ON ebook_download_grants(order_id)`.

#### `courses` (delta)

`ALTER TABLE courses ADD COLUMN author_id TEXT REFERENCES users(id) ON DELETE SET NULL;`
Nullable, sem default. Índice `idx_courses_author ON courses(author_id)`.

#### `users` (delta) — rebuild guardado

`schema.sql` passa a definir:

```sql
role   TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student', 'author')),
bio    TEXT NOT NULL DEFAULT '',
active INTEGER NOT NULL DEFAULT 1,
```

Migração no _boot_ (`db/index.js`), idempotente:

```
sql = SELECT sql FROM sqlite_master WHERE type='table' AND name='users'
if sql não contém "'author'":
    PRAGMA foreign_keys = OFF
    transaction:
        CREATE TABLE users_new (... com role widened + bio + active ...)
        INSERT INTO users_new (id,name,email,password_hash,phone,address,role,email_verified,created_at,bio,active)
          SELECT ..., '', 1 FROM users
        DROP TABLE users
        ALTER TABLE users_new RENAME TO users
        recriar índices de users (nenhum hoje além do UNIQUE(email) embutido)
    PRAGMA foreign_keys = ON
```

`email_tokens.purpose` ganha o valor `set_password` (coluna já é TEXT livre, sem CHECK).

---

### Endpoints da API

#### Visão geral

| Método | Rota | Auth | Descrição |
| --- | --- | --- | --- |
| `GET` | `/api/ebooks` | pública | Catálogo (só publicados) |
| `GET` | `/api/ebooks/:id` | pública | Detalhe (só publicado) |
| `GET` | `/api/ebooks/manage` | admin | Lista com rascunhos |
| `POST` | `/api/ebooks` | admin | Cria eBook (multipart) |
| `PATCH` | `/api/ebooks/:id` | admin | Edita eBook (multipart) |
| `DELETE` | `/api/ebooks/:id` | admin | Remove eBook (sem pedidos) |
| `GET` | `/api/ebooks/download/:token` | token | _Stream_ do arquivo principal |
| `POST` | `/api/ebook-orders` | pública | Cria pedido (convidado) |
| `GET` | `/api/ebook-orders` | admin | Lista pedidos (`?status=`) |
| `GET` | `/api/ebook-orders/:id` | admin | Detalhe do pedido |
| `POST` | `/api/ebook-orders/:id/payment-link` | admin | Registra link Asaas + e-mail |
| `POST` | `/api/ebook-orders/:id/mark-paid` | admin | Marca pago → entrega |
| `POST` | `/api/ebook-orders/:id/cancel` | admin | Cancela |
| `POST` | `/api/ebook-orders/:id/resend` | admin | Reenvia e-mail (`{kind}`) |
| `PATCH` | `/api/ebook-orders/:id` | admin | Corrige `buyerEmail` |
| `DELETE` | `/api/ebook-orders/:id` | admin | Exclusão LGPD |
| `GET` | `/api/ebook-orders/mine` | aluno | Meus eBooks entregues |
| `POST` | `/api/ebook-orders/mine/:id/download` | aluno | Novo link de download |
| `GET` | `/api/authors` | admin | Lista autores |
| `POST` | `/api/authors` | admin | Cria autor + convite |
| `PATCH` | `/api/authors/:id` | admin | Edita/ativa/desativa |
| `POST` | `/api/authors/:id/reinvite` | admin | Reenvia convite de senha |
| `DELETE` | `/api/authors/:id` | admin | Remove autor (sem cursos) |
| `POST` | `/api/auth/set-password` | token | Autor define a senha |
| `GET` | `/api/courses/mine` | editor | Cursos do autor logado |
| `GET`/`POST`/`PATCH`/`DELETE` | `/api/courses…` | admin→editor | CRUD passa a aceitar `author` com _ownership_ |

Convenções herdadas: `sameOrigin` em toda mutação (o formulário e o painel enviam `Origin`
da própria origem — ok); `rateLimit('api-ip', 300/min)` global; erros no envelope
`{ "error": "CODE" }`.

---

#### `GET /api/ebooks`

Catálogo público. Sem parâmetros.

**Respostas**

| Status | Corpo | Quando |
| --- | --- | --- |
| `200` | `EbookPublic[]` | Sempre (lista vazia `[]` se nada publicado) |

```http
GET /api/ebooks
```
```json
[ { "id": "b2c0…", "title": "Gestão de Equipes na Prática", "mode": "venda_no_site", "priceCents": 4990, "coverUrl": "/uploads/9f1c…png", "sampleUrl": "/uploads/1a2b…pdf", "pages": 120, "description": "…", "externalUrl": null, "storeName": null } ]
```

---

#### `GET /api/ebooks/:id`

Detalhe público. `404 EBOOK_NOT_FOUND` se inexistente **ou** `status != 'publicado'`
(não vaza rascunho — RF1).

```http
GET /api/ebooks/b2c0d1e2-3f4a-5b6c-7d8e-9f0a1b2c3d4e
```
```json
{ "id": "b2c0…", "title": "Gestão de Equipes na Prática", "mode": "venda_no_site", "priceCents": 4990, "…": "…" }
```

---

#### `GET /api/ebooks/manage` — admin

Lista `EbookAdmin[]` incluindo rascunhos e `ordersCount`. `requireAdmin`.

---

#### `POST /api/ebooks` — admin, `multipart/form-data`

**Body (campos + arquivos)**

| Campo | Tipo | Regras |
| --- | --- | --- |
| `title` | text | 1–160, obrigatório |
| `description` | text | 0–4000 |
| `pages` | text | inteiro > 0 ou vazio |
| `mode` | text | `venda_no_site` \| `link_externo` |
| `priceCents` | text | inteiro ≥ 0; obrigatório > 0 se `mode=venda_no_site` e `status=publicado` |
| `status` | text | `rascunho` (default) \| `publicado` |
| `externalUrl` | text | http(s); obrigatório se `mode=link_externo` |
| `storeName` | text | 0–80 |
| `cover` | file | imagem (png/jpg/webp/gif), ≤ 10 MB → `/uploads/…` |
| `file` | file | pdf/epub, ≤ `EBOOK_MAX_FILE_MB` → `storage/ebooks/…` (só `venda_no_site`) |
| `sample` | file | pdf, ≤ 10 MB → `/uploads/…` (só `venda_no_site`) |

Reaproveita o `multer` de `courseRoutes` com _limits_ próprios e uma lista de MIME estendida
para `application/epub+zip`. `files: 3` nomeados (`upload.fields`).

**Respostas**

| Status | Corpo | Quando |
| --- | --- | --- |
| `201` | `EbookAdmin` | Criado |
| `400` | `{error}` | `EBOOK_FIELDS_REQUIRED`, `EBOOK_PRICE_INVALID`, `EBOOK_EXTERNAL_URL_INVALID`, `EBOOK_FILE_REQUIRED`, `UPLOAD_TYPE_NOT_ALLOWED`, `FILE_TOO_LARGE` |
| `401/403` | `{error}` | Sem sessão / não admin |

> Publicar (`status=publicado`) valida a completude conforme a modalidade (RF23). Criar
> como `rascunho` não exige arquivo/preço.

Auditoria: `ebook.create` (target = id, detail = título).

---

#### `PATCH /api/ebooks/:id` — admin, `multipart/form-data`

Mesmos campos, todos opcionais. Regras adicionais:

- `mode` diferente do atual **e** `ordersCount > 0` → `409 EBOOK_MODE_LOCKED`.
- Reenvio de `file`/`sample`/`cover` substitui o anterior (o arquivo antigo é removido do
  disco após o `UPDATE`).
- `404 ORDER…`? não — `404 EBOOK_NOT_FOUND`.

Auditoria: `ebook.update`.

---

#### `DELETE /api/ebooks/:id` — admin

`409 EBOOK_HAS_ORDERS` se houver `ebook_orders`. Senão remove a linha e os arquivos
(principal, capa, amostra). `204`. Auditoria: `ebook.delete`.

---

#### `GET /api/ebooks/download/:token`

Entrega o arquivo principal. **Não** exige sessão — o _token_ é a credencial.

**Fluxo:** valida `grant` (existe / não expirou / `download_count < max_downloads`),
faz `UPDATE … SET download_count = download_count + 1 WHERE token = ? AND download_count < max_downloads`;
se `changes === 0` → `429 DOWNLOAD_LIMIT_REACHED`; senão resolve o pedido → o eBook →
`resolveEbookFilePath` e faz `res.download(absPath, fileName)` com `X-Content-Type-Options: nosniff`
e `Cache-Control: private, no-store`.

**Respostas**

| Status | Corpo | Quando |
| --- | --- | --- |
| `200` | binário (`Content-Disposition: attachment`) | Token válido |
| `404` | `{error:"DOWNLOAD_TOKEN_NOT_FOUND"}` | Token inexistente |
| `410` | `{error:"DOWNLOAD_TOKEN_EXPIRED"}` | Expirado |
| `429` | `{error:"DOWNLOAD_LIMIT_REACHED"}` | Limite atingido |

> `AppError` ganha o helper `gone(code)` (HTTP 410) e `tooMany(code)` (429) em `lib/errors.js`.

---

#### `POST /api/ebook-orders` — público

Criação de pedido pelo comprador convidado. `rateLimit('ebook-order-ip', 10 / hora)`.

**Body (JSON)**

| Param | Tipo | Regras |
| --- | --- | --- |
| `ebookId` | string | eBook existente, `status=publicado`, `mode=venda_no_site` → senão `400 ORDER_EBOOK_NOT_SELLABLE` |
| `name` | string | 1–120 |
| `email` | string | formato de e-mail (`lib/validate.email`) |
| `phone` | string | 1–40 |
| `cpf` | string | `lib/cpf.isValidCpf` após remover máscara → `400 ORDER_CPF_INVALID` |
| `birthdate` | string | `YYYY-MM-DD`, não futura → `400 ORDER_BIRTHDATE_INVALID` |
| `paymentMethod` | string | `pix` \| `credito` \| `debito` |

`amount_cents` = `ebooks.price_cents` no momento (snapshot). Status inicial `aguardando_link`.

**Respostas**

| Status | Corpo | Quando |
| --- | --- | --- |
| `201` | `{ "id": "d4e5…", "status": "aguardando_link" }` | Criado |
| `400` | `{error}` | Validação (`ORDER_FIELDS_REQUIRED`, `ORDER_CPF_INVALID`, `ORDER_BIRTHDATE_INVALID`, `ORDER_EBOOK_NOT_SELLABLE`) |
| `429` | `{error:"RATE_LIMITED", reason}` | Excesso de pedidos do mesmo IP |

Auditoria: `ebook_order.create` — **detail sem CPF** (só `ebookId` + primeiro nome).

---

#### `GET /api/ebook-orders` — admin

`?status=` opcional (um dos 5). Retorna `EbookOrderAdmin[]` ordenado por `created_at DESC`.

---

#### `GET /api/ebook-orders/:id` — admin

`EbookOrderAdmin`. `404 ORDER_NOT_FOUND`.

---

#### `POST /api/ebook-orders/:id/payment-link` — admin

**Body:** `{ "paymentLinkUrl": "https://www.asaas.com/c/abc123", "asaasChargeId": "pay_0001" }`
(`asaasChargeId` opcional, texto livre ≤ 60). `paymentLinkUrl` deve ser http(s) →
`400 PAYMENT_LINK_INVALID`.

Só de `aguardando_link` (ou re-set em `aguardando_pagamento`) → senão `409 ORDER_STATE_INVALID`.
Grava, move para `aguardando_pagamento`, envia e-mail "seu link de pagamento" ao comprador.
Retorna `EbookOrderAdmin`. Auditoria: `ebook_order.payment_link`.

---

#### `POST /api/ebook-orders/:id/mark-paid` — admin

Sem body. Só de `aguardando_pagamento` → `409 ORDER_STATE_INVALID` caso contrário.
Numa transação: `paid_at`, cria `grant`, `delivered_at`, `status='entregue'`. Após commit,
e-mail de entrega com o link `DownloadLink.url`. Retorna `EbookOrderAdmin` (`status:"entregue"`).
Auditoria: `ebook_order.paid` + `ebook_order.delivered`.

---

#### `POST /api/ebook-orders/:id/cancel` — admin

**Body:** `{ "reason": "texto opcional" }`. Bloqueado se `status ∈ {entregue, cancelado}`
→ `409 ORDER_STATE_INVALID`. Grava `cancelled_at`, `status='cancelado'`. Auditoria:
`ebook_order.cancel`.

---

#### `POST /api/ebook-orders/:id/resend` — admin

**Body:** `{ "kind": "payment" | "delivery" }`. `payment` exige `payment_link_url` presente;
`delivery` exige `status='entregue'` (emite **novo** `grant`, invalida o anterior por
expiração imediata). `204`.

---

#### `PATCH /api/ebook-orders/:id` — admin

**Body:** `{ "buyerEmail": "novo@example.com" }` (único campo editável). Normaliza e valida.
Auditoria: `ebook_order.update`.

---

#### `DELETE /api/ebook-orders/:id` — admin (LGPD)

_Hard delete_ do pedido e `grants` (cascata). `204`. Auditoria: `ebook_order.delete`
(detail = id apenas). Documentado como o mecanismo de atendimento a pedido de exclusão do
titular.

---

#### `GET /api/ebook-orders/mine` — aluno logado

`requireAuth`. Retorna `EbookOrderMine[]`: pedidos com `status='entregue'` e
`lower(buyer_email) = lower(user.email)`. Lista vazia se nenhum. Não expõe CPF.

---

#### `POST /api/ebook-orders/mine/:id/download` — aluno logado

`requireAuth` + o pedido tem que ser do e-mail do usuário e estar `entregue` → senão
`404 ORDER_NOT_FOUND`. Emite `grant` novo e retorna `DownloadLink`.

---

#### `GET /api/authors` — admin

`AuthorAdmin[]` ordenado por `name`. Também consumido pelo editor de curso (dropdown de
autor). `pendingInvite` = existe `email_tokens(purpose='set_password')` não expirado **e**
o autor nunca logou (heurística: `password_hash` placeholder — ver Decisões).

---

#### `POST /api/authors` — admin

**Body:** `{ "name": "Dra. Helena Prado", "email": "helena@example.com", "bio": "…" }`

Cria `users` (`role='author'`, `email_verified=1`, `active=1`, `password_hash` = hash de
random 32B **descartado** — força o fluxo de convite). Emite `email_tokens(purpose='set_password',
expires_at=+72h)` e e-mail com `definir-senha.html?token=…`.

| Status | Corpo | Quando |
| --- | --- | --- |
| `201` | `AuthorAdmin` (`pendingInvite:true`) | Criado |
| `409` | `{error:"AUTHOR_EMAIL_IN_USE"}` | E-mail já usado |
| `400` | `{error:"AUTHOR_FIELDS_REQUIRED"}` | Nome/e-mail ausentes |

Auditoria: `author.create`.

---

#### `PATCH /api/authors/:id` — admin

**Body:** qualquer subconjunto de `{ name, bio, active }`. `active:false` também apaga as
sessões do autor (`DELETE FROM sessions WHERE user_id = ?`). Retorna `AuthorAdmin`.
Auditoria: `author.update` (detail inclui `active` quando muda).

---

#### `POST /api/authors/:id/reinvite` — admin

Reemite `email_tokens(set_password)` + e-mail. `204`. Auditoria: `author.reinvite`.

---

#### `DELETE /api/authors/:id` — admin

`409 AUTHOR_HAS_COURSES` se `COUNT(courses WHERE author_id = ?) > 0` (RF27: manter a
autoria). Senão remove o `users` (as sessões caem por FK cascade). `204`.

---

#### `POST /api/auth/set-password` — público (token)

**Body:** `{ "token": "…", "password": "…" }`. Valida o token `purpose='set_password'`
(existe, não expirou) → `400 PASSWORD_SET_INVALID`. Regras de senha iguais ao registro
(8–200). Grava hash, apaga os tokens `set_password` do usuário, cria sessão e devolve
`{ user }` + cookie de sessão (mesma mecânica de `verify-email`).

---

#### `GET /api/courses/mine` — `requireCourseEditor`

Autor → cursos com `author_id = user.id`. Admin → todos os cursos (conveniência para a
mesma tela). Formato: `Course[]` (com `author`).

---

#### `POST/PATCH/DELETE /api/courses[...]` — agora `requireCourseEditor`

- `POST /api/courses`: autor → `author_id` forçado ao próprio id; admin → `authorId` do
  body (opcional, deve existir e ter `role='author'` → senão `400 COURSE_AUTHOR_INVALID`).
- `PATCH /api/courses/:id`: autor só se `course.author_id === user.id` → senão
  `403 COURSE_FORBIDDEN`. Autor **não** pode alterar `author_id` (campo ignorado); admin pode.
- `DELETE /api/courses/:id`, `POST /:id/lessons`, `DELETE /:id/lessons/:lessonId`: mesma
  verificação de _ownership_ para autor.
- `GET /api/courses` e `GET /api/courses/:id` permanecem públicos, agora com `author`.

---

## Pontos de integração

### Asaas (pagamento) — **manual nesta entrega**

- **Sem chamadas HTTP de saída.** O admin cria o link de cobrança no painel do Asaas e cola
  `paymentLinkUrl` (+ `asaasChargeId` opcional) no pedido. Não há `gateway/asaas.js`.
- Requisito operacional: conta Asaas ativa; chave PIX cadastrada no Asaas para cobranças PIX.
- Evolução futura (fora desta entrega, ver PRD "Fora de escopo" / RF16): `gateway/asaas.js`
  criando a cobrança via API e `POST /api/webhooks/asaas` (montado **antes** de `sameOrigin`,
  autenticado por `asaas-access-token`) para confirmar pagamento automaticamente. O schema
  já guarda `asaas_charge_id` para casar o webhook.

### E-mail (SMTP) — infra existente

- Usa `lib/mailer.js` (nodemailer + _fallback_ de log) e o remetente `config.smtp.from`.
- Novos e-mails: **convite de autor**, **link de pagamento**, **entrega do eBook**,
  **reenvios**. Todos só texto, PT-BR, no padrão de `issueVerification`.
- **Pré-requisito de produção:** SMTP configurado no `.env` (pendência conhecida do deploy).
  Sem SMTP, os links caem no log (`journalctl -u skills-manager`) e nos testes na _outbox_.
- Modo de falha: `sendMail` engole exceções e loga (comportamento atual) — nunca derruba a
  transição de estado do pedido.

### Sistema de arquivos

- **Capas e amostras:** `backend/uploads/` (rota estática `/uploads` já endurecida:
  `attachment`, `nosniff`, CSP `default-src 'none'`). Capas renderizam em `<img>` mesmo com
  `Content-Disposition: attachment`.
- **Arquivos principais de eBook:** `backend/storage/ebooks/` — **fora** da allowlist de
  `server.js` e de `express.static`; só acessível via `GET /api/ebooks/download/:token`.
  `lib/storage.js` cria o diretório no _boot_ e valida que o caminho resolvido fica **dentro**
  de `storageDir` (previne _path traversal_). `.gitignore` += `backend/storage/`.
- `deploy/skills-manager.service`: `ReadWritePaths` += `/opt/skills-manager/backend/storage`.

---

## Abordagem de testes

**Runner:** `node --test` (nativo) + cobertura nativa
(`node --test --experimental-test-coverage --test-coverage-lines=80 --test-coverage-branches=80 --test-coverage-functions=80`).
Sem dependência nova. `package.json`:

```json
"scripts": {
  "start": "node src/server.js",
  "dev": "node --watch src/server.js",
  "test": "node --test --experimental-test-coverage 'src/**/*.test.js' 'test/**/*.test.js'"
}
```

**Isolamento de banco:** cada arquivo de teste roda em processo próprio (`node --test`).
No topo, `process.env.DB_FILE = <tmp único>` e `process.env.NODE_ENV = 'test'` **antes** do
primeiro `import` do app; `after()` apaga o arquivo. Helper `test/helpers/app.js` faz o
`await import('../../src/app.js')`, sobe `app.listen(0)`, devolve `baseUrl` + `close()`.

**E-mail:** `NODE_ENV='test'` / sem SMTP → `mailer.sentMessages` (array exportado);
`mailer.clearOutbox()` no `beforeEach`. Nenhum serviço externo é chamado em nenhum teste.

**Estrutura (Given/When/Then, um conceito por teste, asserts explícitos):**

### Testes unitários

| Alvo | Casos (resumo) |
| --- | --- |
| `lib/cpf.js` | aceita CPF válido; rejeita dígito verificador errado; rejeita `000…`/`111…`; remove máscara |
| `lib/money.js` | `toCents` de `"R$ 1.234,56"`, número, vazio; `formatBRL` |
| `lib/validate.js` | `str` min/max; `email` formato; `isoDate`; `httpUrl` rejeita `javascript:`; `oneOf` |
| `lib/storage.js` | resolve caminho dentro de `storageDir`; rejeita `../` (traversal); grava e apaga |
| `lib/dates.js` | `addMonths` fim de mês; `isValidISODate` |
| `ebookService` (unit) | `normalize` exige título; preço inválido; `venda_no_site` publicado sem arquivo → erro; `link_externo` sem URL → erro; troca de modalidade com pedidos → `EBOOK_MODE_LOCKED` |
| `ebookOrderService` (unit) | transições válidas/ inválidas da máquina de estados; snapshot de preço; CPF/nascimento inválidos; e-mail normalizado |
| `authorService` (unit) | cria com role author + `pendingInvite`; e-mail em uso → `AUTHOR_EMAIL_IN_USE`; `deleteAuthor` com cursos → `AUTHOR_HAS_COURSES` |
| `courseService` (unit) | `courseToApi` inclui `author`/`null`; autor força `author_id`; `COURSE_FORBIDDEN` para não-dono |
| `middleware/auth` | `requireCourseEditor` 401 sem sessão, 403 role student, ok admin/author |
| `db/index` migrações | rodar 2× é _no-op_; `users` antigo (sem `author`) é reconstruído preservando linhas; `courses.author_id` criado |

### Testes de integração (route + service + SQLite real em arquivo tmp)

| Fluxo | Casos |
| --- | --- |
| Catálogo | `GET /api/ebooks` só publicados; `GET /api/ebooks/:id` rascunho → 404; contrato `EbookPublic` por modalidade |
| eBook CRUD admin | criar rascunho sem arquivo (ok) → publicar sem arquivo → `EBOOK_FILE_REQUIRED`; upload de capa/arquivo/amostra; `PATCH` troca modalidade sem pedidos (ok) e com pedidos (409); `DELETE` com pedidos → `EBOOK_HAS_ORDERS`; guest/student → 401/403 |
| Pedido — criação | sucesso 201; CPF inválido → 400; eBook `link_externo` → `ORDER_EBOOK_NOT_SELLABLE`; _rate limit_ no 11º/h; auditoria sem CPF |
| Pedido — ciclo | `payment-link` (→ e-mail na outbox, status); `mark-paid` (→ grant criado, `delivered_at`, e-mail com URL); transições inválidas → 409; `cancel` após entregue → 409; `resend delivery` gera novo token e expira o antigo; `DELETE` remove pedido + grants |
| Download | token válido faz _stream_ e incrementa contador; expirado → 410; após `max_downloads` → 429; token inexistente → 404 |
| Minha conta | `GET /mine` lista só entregues do e-mail; `POST /mine/:id/download` de outro e-mail → 404; gera `DownloadLink` |
| Autores | `POST /api/authors` cria + convite na outbox; `set-password` com token válido loga; token expirado → 400; `PATCH active:false` derruba sessão e bloqueia login (`ACCOUNT_DISABLED`); `DELETE` com cursos → 409; `reinvite` |
| Curso + autor | admin cria curso com `authorId`; `GET /api/courses/:id` traz `author`; autor cria curso (author_id = ele); autor `PATCH` curso de terceiro → 403; autor `GET /api/courses/mine` só os seus; autor adiciona/remualhe aula do próprio curso; autor em `/api/students` → 403 |
| Regressão | fluxo de matrícula/pagamento/área do aluno inalterado; `GET /api/courses` continua com os campos antigos + `author` |

### Testes E2E

Fora de escopo (o projeto não tem Playwright hoje; a suíte de integração cobre
_route→service→DB_). Verificação manual das telas novas com o `deploy/DEPLOY.md`.

**Backfill do legado (decisão "suíte completa"):** além do acima, testes para
`authService` (register/verify/login/timing/change-password), `enrollmentService` +
`paymentService` (geração de parcelas, status derivado, regenerar plano), `studentService`
(CRUD + reset senha), `overviewService`, `middleware/{rateLimit,sameOrigin,securityHeaders}`,
`lib/{password,http,audit}` — até a cobertura global (linhas/branches/funções) ≥ 80%.

---

## Sequenciamento do desenvolvimento

### Ordem de construção

1. **Fundação de testes** — extrair `app.js`/`server.js`; `mailer` _outbox_; `npm test` +
   cobertura; `test/helpers`. _Por quê primeiro:_ toda a feature nasce testada e o backfill
   pode começar em paralelo.
2. **Migrações + schema** — `schema.sql` (users widened, `bio`, `active`; novas tabelas),
   `db/index.js` (rebuild guardado de `users`, `ALTER courses`), `lib/config.js`,
   `lib/errors.js` (`gone`/`tooMany`), `.gitignore`, `systemd`. Testes de migração.
3. **Autores** — `authorService`, `authorRoutes`, `authService.set-password`,
   `definir-senha.html` + `js/set-password.js`, `autores.html` + `js/admin-authors.js`.
   _Dependência:_ passo 2.
4. **Autor nos cursos** — `courseService`/`courseRoutes` (`requireCourseEditor`, _ownership_,
   `authorId`, `/mine`), `meus-cursos.html`, reuso de `js/admin-courses.js`, exibição do
   autor no catálogo/`curso.html`. _Dependência:_ passo 3.
5. **eBooks — catálogo e CRUD** — `lib/cpf.js`, `lib/storage.js`, `ebookService`,
   `ebookRoutes` (catálogo, manage, CRUD, download), `ebooks.html`/`ebook.html`,
   `admin-ebooks.html`/`gerenciar-ebook.html` + JS. _Dependência:_ passo 2.
6. **eBooks — pedidos e entrega** — `ebookOrderService`, `ebookOrderRoutes`, e-mails,
   `pedidos.html` + `js/admin-orders.js`, "meus eBooks" em `conta.html`. _Dependência:_
   passo 5.
7. **Navegação e acabamento** — link "eBooks" nos headers, `session.js` (nav de autor),
   `styles.css`, revisão de acessibilidade dos formulários.
8. **Backfill de testes do legado** até ≥ 80% global; ajustes de cobertura.

### Dependências técnicas

- Node 24 em produção (já instalado) — cobertura nativa e `node:sqlite` estáveis.
- SMTP em produção para os fluxos de e-mail funcionarem de ponta a ponta (não bloqueia
  desenvolvimento nem testes).
- Conta Asaas ativa (operacional, não de código).

---

## Monitoramento e observabilidade

- **Health:** `GET /health` inalterado.
- **Auditoria:** novas ações em `audit_log` (`ebook.*`, `ebook_order.*`, `author.*`,
  além dos `course.*`/`lesson.*` agora também disparados por autores — o `actor_user_id`
  identifica quem). Consulta via SQL no servidor.
- **Logs:** erros 5xx já logados por `errorHandler`. `mailer` loga falha de envio e, sem
  SMTP, o conteúdo do e-mail (inclui links de pagamento/download — aceitável no log
  privado do servidor; **não** logar CPF).
- **Métricas do PRD** (conversão, tempo pedido→link→pago, downloads) — extraíveis por SQL
  sobre `ebook_orders` (`created_at`, `paid_at`, `delivered_at`, `status`) e
  `ebook_download_grants.download_count`. Painel dedicado fica fora de escopo.

---

## Considerações técnicas

### Principais decisões

- **Seguir o padrão do repositório, não as skills `folder-structure`/`code-standards` ao
  pé da letra.** O backend atual usa `src/{routes,services,db,lib,middleware}` e JS puro
  (sem `data/`, `gateway/`, `types/`, sem TypeScript). Introduzir a estrutura das skills
  agora fragmentaria um código pequeno e coeso. Novos arquivos imitam os vizinhos. Desvios
  registrados abaixo.
- **Pagamento manual, sem SDK Asaas.** O PRD define o fluxo por link gerado na mão; um
  `gateway/` e webhook só entram quando a automação for priorizada. Menos superfície,
  menos segredo para guardar, entrega mais rápida.
- **Arquivo de eBook fora da árvore estática + token de uso limitado** em vez de confiar no
  nome aleatório do `multer` sob `/uploads`. Evita "segurança por obscuridade" (skill
  `no-workarounds`): o arquivo protegido nunca tem URL pública.
- **`buyer_cpf` em texto no SQLite.** O arquivo do banco já é restrito no servidor (systemd
  _hardening_, `chmod 600` no `.env`, sem acesso externo). CPF só sai em rotas
  `requireAdmin`, nunca em log/URL/auditoria. Cifragem em repouso e política de retenção
  ficam como evolução (anotado em Riscos).
- **Papel `autor` como `users.role`** (não uma tabela separada) — reaproveita sessão,
  `email_tokens`, `password` e o _guard_ de rota. Um curso tem no máximo um autor
  (`author_id` escalar).
- **Rebuild de `users` para ampliar o CHECK do `role`.** SQLite não faz `ALTER … DROP
  CONSTRAINT`; o procedimento oficial de 12 passos, guardado por inspeção do
  `sqlite_master`, é idempotente e preserva dados. Alternativa descartada: remover o CHECK
  e validar só na aplicação — perderia a proteção do banco que o schema atual já adota.
- **`app.js` separado de `server.js`.** Sem isso não há teste de integração honesto
  (hoje `server.js` chama `listen` no _import_). Refactor pequeno, alinhado à skill `tests`.
- **Cobertura nativa do Node** em vez de `c8`/`jest`/`vitest` — zero dependência,
  consistente com a filosofia "sem `better-sqlite3`, sem peso" do projeto.

### Riscos conhecidos

| Risco | Mitigação |
| --- | --- |
| Rebuild de `users` em produção com dados reais | Migração idempotente + teste dedicado com fixture do schema antigo; backup do `.db` no `DEPLOY.md` antes do _deploy_; rodar em `transaction()` |
| Coordenação manual pedido↔Asaas (admin cola id errado) | `asaasChargeId` é livre e opcional; a confirmação real é o clique em `mark-paid`; auditoria registra quem/quando |
| CPF em texto (LGPD) | acesso só admin, nunca em log/URL; `DELETE` para exclusão do titular; cifragem/retention como próximo passo |
| Link de download vazando (encaminhamento de e-mail) | `expires_at` curto (72 h) + `max_downloads` (5) + `resend` invalida o token anterior |
| `epub` como `application/epub+zip` nem sempre chega no MIME certo | validar por extensão **e** MIME (como já faz `courseRoutes`); aceitar `application/octet-stream` só com extensão `.epub` |
| Backfill de testes do legado estourar o cronograma | passo 8 é o último; se necessário, entregar a feature com cobertura ≥ 80% **do código novo** e abrir tarefa separada para o restante (variação combinada com o PO) |
| `multer` `upload.fields` + validação por campo | _fileFilter_ por `file.fieldname`; teto de tamanho por campo via checagem pós-upload quando o `multer` não permitir _limits_ por campo |

### Conformidade com skills

| Skill | Aderência | Desvios registrados |
| --- | --- | --- |
| `tests` | **Alta** — `node:test`, unit + integração, Given/When/Then, um conceito/teste, asserts explícitos, meta ≥ 80% global (unit + integração; sem E2E) | Sem Playwright (E2E manual) — o projeto não tem a infra e o PRD não exige |
| `no-workarounds` | **Alta** — arquivo protegido real (não obscuridade); migração de schema de verdade (não remover o CHECK); `epub` validado na origem | `mailer` continua engolindo exceção de envio (comportamento pré-existente e desejável: e-mail não pode derrubar transação) — contido e testado via outbox |
| `javascript` | **Alta** — `const` por padrão, métodos declarativos de array, módulos acíclicos (`services` não se importam entre si; `ebookOrderService` usa `ebookService` só numa direção), segredos via `.env` | — |
| `code-standards` | **Parcial** — nomes em inglês no código, funções ≤ 30 linhas, ≤ 2 níveis de aninhamento, ≤ 3 parâmetros (usar objeto de input) | "Um tipo por arquivo" **N/A**: projeto é JS puro sem `types/`; segue o estilo vigente (objetos planos + `*ToApi`) |
| `folder-structure` | **Parcial** — coloca cada arquivo pela responsabilidade primária | Usa `src/{routes,services,db,lib,middleware}` do projeto, não `src/{routes,services,data,gateway,types}` da skill; sem `gateway/` (pagamento manual) |

### Arquivos relevantes e dependentes

**Novos (backend):** `src/app.js`, `src/lib/cpf.js`, `src/lib/storage.js`,
`src/services/ebookService.js`, `src/services/ebookOrderService.js`,
`src/services/authorService.js`, `src/routes/ebookRoutes.js`,
`src/routes/ebookOrderRoutes.js`, `src/routes/authorRoutes.js`,
`test/helpers/app.js`, `test/**/*.test.js`.

**Modificados (backend):** `src/server.js`, `src/db/schema.sql`, `src/db/index.js`,
`src/db/seed.js`, `src/lib/config.js`, `src/lib/errors.js`, `src/lib/mailer.js`,
`src/middleware/auth.js`, `src/services/courseService.js`, `src/services/authService.js`,
`src/routes/courseRoutes.js`, `src/routes/authRoutes.js`, `package.json`,
`backend/.env.example`, `.gitignore`, `deploy/skills-manager.service`.

**Novos (frontend):** `ebooks.html`, `ebook.html`, `admin-ebooks.html`,
`gerenciar-ebook.html`, `pedidos.html`, `autores.html`, `meus-cursos.html`,
`definir-senha.html`; `js/ebooks-catalog.js`, `js/ebook-page.js`, `js/admin-ebooks.js`,
`js/admin-orders.js`, `js/admin-authors.js`, `js/set-password.js`.

**Modificados (frontend):** `js/main.js`, `js/api.js`, `js/format.js`, `js/session.js`,
`js/admin-courses.js`, `js/course-page.js` (exibir autor), `js/catalog.js` (exibir autor),
`styles.css`, e o header de navegação de cada `*.html` (link "eBooks").

**Dependências de contrato:** qualquer consumidor de `GET /api/courses*` passa a receber
`author` (aditivo, não quebra).
