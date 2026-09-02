# Tarefa 6.0: eBooks — catálogo, CRUD e download protegido (backend)

## Visão geral

Backend dos eBooks sem a parte de pedidos: catálogo público, detalhe, listagem
administrativa com rascunhos, CRUD com upload de capa/arquivo/amostra, e a entrega do
arquivo principal por _token_ de uso limitado a partir de um diretório fora da árvore
estática. Inclui a emissão/consumo de `ebook_download_grants` (consumido depois pela 8.0).

<skills>
### Conformidade com skills
- `no-workarounds` — arquivo protegido real (fora de `/uploads`), token de uso limitado; `epub` validado por extensão **e** MIME.
- `tests` — unit de `ebookService` (regras de modalidade/publicação) + integração de rotas (CRUD, guardas, download, contador).
- `javascript` / `code-standards` — input como objeto, funções ≤ 30 linhas, `map/filter`.
- `folder-structure` — `services/ebookService.js`, `routes/ebookRoutes.js`.
</skills>

<requirements>
- RF1, RF2, RF3, RF3.1, RF3.2, RF4, RF5, RF5.1, RF17, RF18, RF21, RF22, RF22.1, RF22.2, RF23, RF23.1, RF24.
- Rascunho nunca vaza em rota pública.
- Publicar `venda_no_site` exige arquivo + preço; `link_externo` exige URL http(s).
- Trocar `mode` com pedidos existentes → `409 EBOOK_MODE_LOCKED`; excluir com pedidos → `409 EBOOK_HAS_ORDERS`.
- Arquivo principal só sai por `GET /api/ebooks/download/:token` (expira em `EBOOK_DOWNLOAD_TTL_HOURS`, limite `EBOOK_DOWNLOAD_MAX`).
</requirements>

## Subtarefas

- [ ] 6.1 `services/ebookService.js`: `listPublishedEbooks`, `getPublishedEbook(id)`, `listAllEbooks`, `createEbook(input, files)`, `updateEbook(id, input, files)`, `deleteEbook(id)`, `resolveEbookFilePath(id)`, `issueDownloadGrant(orderId)`, `consumeDownload(token)`. Normalização por modalidade; `ordersCount` via `COUNT(ebook_orders)`.
- [ ] 6.2 `routes/ebookRoutes.js`: `GET /api/ebooks`, `GET /api/ebooks/:id`, `GET /api/ebooks/manage` (`requireAdmin`), `POST /api/ebooks` + `PATCH /api/ebooks/:id` (`requireAdmin`, `multer.fields([cover,file,sample])` com _limits_ e `fileFilter` por `fieldname`; `application/epub+zip` e `application/octet-stream`+`.epub` aceitos para `file`), `DELETE /api/ebooks/:id` (`requireAdmin`), `GET /api/ebooks/download/:token` (sem sessão).
- [ ] 6.3 Download: `UPDATE … SET download_count = download_count + 1 WHERE token=? AND download_count < max_downloads`; `changes===0` → `tooMany('DOWNLOAD_LIMIT_REACHED')`; expirado → `gone('DOWNLOAD_TOKEN_EXPIRED')`; ausente → `notFound('DOWNLOAD_TOKEN_NOT_FOUND')`; sucesso → `res.download(absPath, fileName)` + `nosniff` + `Cache-Control: private, no-store`.
- [ ] 6.4 Substituição de arquivo em `updateEbook` remove o anterior do disco após o `UPDATE` (capa/amostra em `/uploads`, principal via `lib/storage`).
- [ ] 6.5 `audit('ebook.create'|'ebook.update'|'ebook.delete')`.
- [ ] 6.6 Registrar `ebookRoutes` em `app.js`.

## Detalhes de implementação

Ver `techspec.md` → **`EbookPublic` / `EbookAdmin`**, **Endpoints da API** (`/api/ebooks*`,
`GET /api/ebooks/download/:token`), **Esquema de banco → `ebooks` / `ebook_download_grants`**,
**Pontos de integração → Sistema de arquivos**. Ajuste vs TechSpec: `issueDownloadGrant`/
`consumeDownload` vivem em `ebookService` (não `ebookOrderService`) — a 8.0 chama
`ebookService.issueDownloadGrant` na entrega.

## Critérios de sucesso

- `GET /api/ebooks` só publicados; `GET /api/ebooks/:id` de rascunho → 404.
- Criar rascunho sem arquivo é permitido; publicar sem arquivo → `EBOOK_FILE_REQUIRED`.
- Download respeita expiração e limite; arquivo principal não tem URL pública.
- `student`/anônimo não acessam `manage` nem o CRUD.

## Testes da tarefa

### Testes unitários
- [ ] `ebookService`: título ausente → `EBOOK_FIELDS_REQUIRED`; preço 0 ao publicar `venda_no_site` → `EBOOK_PRICE_INVALID`; `link_externo` sem URL → `EBOOK_EXTERNAL_URL_INVALID`; publicar `venda_no_site` sem arquivo → `EBOOK_FILE_REQUIRED`.
- [ ] `ebookService.updateEbook`: `mode` diferente com `ordersCount>0` → `EBOOK_MODE_LOCKED`.
- [ ] `consumeDownload`: token expirado → `DOWNLOAD_TOKEN_EXPIRED`; contador no limite → `DOWNLOAD_LIMIT_REACHED`; ok → incrementa e retorna caminho.
- [ ] `toApi`: `EbookPublic` de `link_externo` tem `sampleUrl:null` e `externalUrl`/`storeName`.

### Testes de integração
- [ ] `GET /api/ebooks` retorna só publicados; `[]` quando nada publicado.
- [ ] `POST /api/ebooks` (admin) cria rascunho sem arquivo; `PATCH status=publicado` sem arquivo → 400; com upload → 200 e `hasFile:true`.
- [ ] `PATCH` trocando `mode` sem pedidos → ok; (após 8.0) com pedido → 409.
- [ ] `DELETE` de eBook com pedido → 409; sem pedido → 204 e arquivos apagados.
- [ ] `GET /api/ebooks/download/:token`: grant válido (criado no _setup_) → 200 + `Content-Disposition: attachment`, contador vai a 1; repetir até o limite → 429; token forjado → 404; grant expirado → 410.
- [ ] `GET /api/ebooks/manage` como `student` → 403; anônimo → 401.

### Testes E2E (se aplicável)
- N/A (tela em 7.0).

## Arquivos relevantes

- `backend/src/services/ebookService.js`, `backend/src/routes/ebookRoutes.js` (novos)
- `backend/src/app.js` (mod.)
- `backend/test/ebooks/{service,crud,download}.test.js` (novos)
