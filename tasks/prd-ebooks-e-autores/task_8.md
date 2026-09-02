# Tarefa 8.0: eBooks — pedidos, pagamento manual e entrega

## Visão geral

Fluxo de compra ponta a ponta para eBooks `venda_no_site`: formulário público de pedido,
fila de pedidos no admin, registro manual do link de pagamento do Asaas, marcação de pago,
entrega automática (grant + e-mail), cancelamento, reenvios, correção de e-mail, exclusão
LGPD e a área "meus eBooks" do comprador logado.

<skills>
### Conformidade com skills
- `no-workarounds` — máquina de estados explícita com transições validadas; entrega numa única transação SQLite; e-mail após o commit.
- `tests` — unit da máquina de estados + integração de todo o ciclo, com a outbox.
- `javascript` / `code-standards` — serviço sem `req`/`res`, `actor`/input como objeto, funções ≤ 30 linhas.
- `folder-structure` — `services/ebookOrderService.js`, `routes/ebookOrderRoutes.js`.
</skills>

<requirements>
- RF6, RF7, RF8, RF9, RF10, RF11, RF12, RF13, RF14, RF15, RF17, RF19, RF20, RF24.
- Pedido só para eBook `venda_no_site` publicado (`400 ORDER_EBOOK_NOT_SELLABLE`).
- CPF validado (dígitos verificadores); data de nascimento `YYYY-MM-DD` não futura.
- `buyer_cpf`/`buyer_birthdate` só em contrato admin; nunca em log/URL/`audit_log`.
- Transições inválidas → `409 ORDER_STATE_INVALID`. `DELETE` = exclusão LGPD.
- Entrega cria `grant` (TTL/limite da config) e envia e-mail; "minha conta" gera link novo sob demanda.
</requirements>

## Subtarefas

- [ ] 8.1 `services/ebookOrderService.js`: `createOrder(input)`, `listOrders({status?})`, `getOrder(id)`, `attachPaymentLink(id, {paymentLinkUrl, asaasChargeId})`, `markPaid(id)` (transação: `paid_at` → `ebookService.issueDownloadGrant` → `delivered_at` → `status='entregue'`; e-mail após commit), `cancelOrder(id, reason)`, `updateBuyerEmail(id, email)`, `resendOrderEmail(id, kind)`, `deleteOrder(id)`, `listMyDeliveredOrders(email)`. `assertTransition(from, to)` centraliza a máquina de estados.
- [ ] 8.2 `routes/ebookOrderRoutes.js`: `POST /api/ebook-orders` (público, `rateLimit('ebook-order-ip', 10/h)`), `GET /api/ebook-orders` + `GET /:id` + `POST /:id/payment-link` + `POST /:id/mark-paid` + `POST /:id/cancel` + `POST /:id/resend` + `PATCH /:id` + `DELETE /:id` (`requireAdmin`), `GET /api/ebook-orders/mine` + `POST /api/ebook-orders/mine/:id/download` (`requireAuth`). `audit('ebook_order.*')` sem CPF.
- [ ] 8.3 E-mails PT-BR: "link de pagamento", "seu eBook está pronto" (com `DownloadLink.url`), reenvios — no padrão do `mailer`.
- [ ] 8.4 Registrar `ebookOrderRoutes` em `app.js`.
- [ ] 8.5 `js/api.js`: `createEbookOrder(body)`, `ebookOrders(status?)`, `ebookOrder(id)`, `orderPaymentLink(id, body)`, `orderMarkPaid(id)`, `orderCancel(id, body)`, `orderResend(id, kind)`, `updateOrderEmail(id, email)`, `deleteEbookOrder(id)`, `myEbookOrders()`, `myEbookDownload(id)`.
- [ ] 8.6 `ebook.html` / `js/ebook-page.js`: formulário de compra (nome, CPF com máscara via `format.cpfMask`, data de nascimento, e-mail, telefone, `paymentMethod`), validação client-side, tela de confirmação "enviaremos o link para {e-mail}".
- [ ] 8.7 `pedidos.html` (`data-page="orders"`) + `js/admin-orders.js`: lista filtrável por status, detalhe do pedido com dados do comprador, ações (colar link Asaas + id, marcar pago, cancelar, reenviar, corrigir e-mail, excluir).
- [ ] 8.8 `conta.html` / `js/account.js`: seção "Meus eBooks" — lista `EbookOrderMine`, botão "Baixar" chama `api.myEbookDownload(id)` e abre a URL.
- [ ] 8.9 `js/format.js`: `orderStatusLabel`, `cpfMask`. `js/main.js`: registrar `orders`.

## Detalhes de implementação

Ver `techspec.md` → **`EbookOrderAdmin` / `EbookOrderMine` / `DownloadLink` / `OrderStatus`**,
**Endpoints** (`/api/ebook-orders*`), **Fluxo de dados → Compra (venda no site)**,
**Considerações técnicas → CPF em texto** e **Monitoramento** (métricas por SQL).

## Critérios de sucesso

- Comprador convidado cria pedido; admin gera link → e-mail; admin marca pago → e-mail com download; comprador baixa.
- Transições fora de ordem barram com `409`; pedido entregue não cancela.
- CPF nunca aparece em `audit_log`, logs de erro ou respostas públicas.
- Comprador logado com o mesmo e-mail vê o eBook em "Minha conta" e gera novo link.
- `DELETE` some com o pedido e os grants.

## Testes da tarefa

### Testes unitários
- [ ] `assertTransition`: matriz completa (permitidas/negadas) conforme `OrderStatus`.
- [ ] `createOrder`: CPF inválido → `ORDER_CPF_INVALID`; nascimento futuro → `ORDER_BIRTHDATE_INVALID`; eBook `link_externo` → `ORDER_EBOOK_NOT_SELLABLE`; `amount_cents` = preço no momento.
- [ ] `toAdminApi` inclui CPF; `toMineApi` **não**.

### Testes de integração
- [ ] `POST /api/ebook-orders` sucesso 201; 11º pedido do mesmo IP em 1 h → 429; `audit_log` sem CPF.
- [ ] `payment-link` → status `aguardando_pagamento` + e-mail na outbox com a URL; `paymentLinkUrl` não-http → `PAYMENT_LINK_INVALID`.
- [ ] `mark-paid` a partir de `aguardando_pagamento` → `entregue`, `grant` criado, e-mail de entrega com `DownloadLink.url`; a mesma URL baixa o arquivo (cruza com 6.0).
- [ ] `mark-paid` fora de `aguardando_pagamento` → 409; `cancel` de `entregue` → 409.
- [ ] `resend delivery` → novo token; token anterior deixa de funcionar.
- [ ] `PATCH {buyerEmail}` normaliza e persiste; `DELETE` → 204, pedido e grants somem.
- [ ] `GET /api/ebook-orders/mine` só entregues do e-mail do usuário; `POST /mine/:id/download` de pedido de outro e-mail → 404; do próprio → `DownloadLink`.
- [ ] `student` não acessa `GET /api/ebook-orders` (403).

### Testes E2E (se aplicável)
- [ ] Manual (checklist no PR): compra completa em homologação (link no log sem SMTP).

## Arquivos relevantes

- `backend/src/services/ebookOrderService.js`, `backend/src/routes/ebookOrderRoutes.js` (novos)
- `backend/src/app.js` (mod.)
- `pedidos.html` (novo); `ebook.html`, `conta.html`, `js/ebook-page.js`, `js/account.js`, `js/admin-orders.js`, `js/api.js`, `js/format.js`, `js/main.js`, `styles.css` (mod.)
- `backend/test/orders/{lifecycle,create,mine}.test.js` (novos)
