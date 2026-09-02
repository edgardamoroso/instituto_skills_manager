# Tarefa 7.0: eBooks — catálogo e administração (frontend)

## Visão geral

Telas públicas do catálogo e de detalhe do eBook (com amostra e o desvio para loja externa)
e as telas administrativas de cadastro/edição de eBooks. Sem o formulário de compra (8.0).

<skills>
### Conformidade com skills
- `javascript` / `code-standards` — módulos ES, `const`, `escapeHtml`/`safeUrl` já existentes para saída segura.
- `tests` — lógica coberta no backend (6.0); telas por E2E manual.
- `react` — **N/A**.
</skills>

<requirements>
- RF1, RF2, RF3, RF3.1, RF3.2, RF4, RF5.1, RF21, RF22, RF37, RF40, RF42.
- Card indica visualmente eBook de loja externa; botão "Comprar na Amazon" (rótulo por domínio) abre em nova aba com `rel="noopener"`.
- eBook de venda no site mostra preço e botões "Ver amostra" / "Comprar".
- Identidade visual atual (cards, Inter, `styles.css`); responsivo.
</requirements>

## Subtarefas

- [ ] 7.1 `js/api.js`: `ebooks()`, `ebook(id)`, `ebooksManage()`, `createEbook(form)`, `updateEbook(id, form)`, `deleteEbook(id)`.
- [ ] 7.2 `js/format.js`: `ebookModeLabel(mode)`, `storeLabel(url, storeName)` (deriva "Comprar na Amazon" quando o domínio é amazon).
- [ ] 7.3 `ebooks.html` (`data-page="ebooks"`) + `js/ebooks-catalog.js`: grade de `EbookPublic`, _badge_ de modalidade, link para `ebook.html?id=`.
- [ ] 7.4 `ebook.html` (`data-page="ebook"`) + `js/ebook-page.js`: detalhe; `venda_no_site` → preço + "Ver amostra" (link para `sampleUrl`) + "Comprar" (âncora para o form da 8.0, oculto/placeholder nesta tarefa); `link_externo` → botão externo. Sem `author` (é de curso).
- [ ] 7.5 `admin-ebooks.html` (`data-page="admin-ebooks"`) + `js/admin-ebooks.js`: lista `EbookAdmin` (status, `ordersCount`), ações novo/editar/remover (remover desabilitado com `ordersCount>0`).
- [ ] 7.6 `gerenciar-ebook.html` (`data-page="ebook-admin"`): editor de um eBook — campos + _selects_ de `mode`/`status` + uploads (capa, arquivo, amostra) com _hint_ de limites; alterna campos conforme `mode`; erros do backend (`EBOOK_*`).
- [ ] 7.7 `js/main.js`: registrar `ebooks`, `ebook`, `admin-ebooks`, `ebook-admin`.
- [ ] 7.8 `js/session.js`: `guardAdmin` cobre as telas admin; link "eBooks" (admin) junto das demais.

## Detalhes de implementação

Ver `techspec.md` → **Visão dos componentes → Frontend**, **`EbookPublic` / `EbookAdmin`**,
**Endpoints** (`/api/ebooks*`), **Fluxo de dados → Link externo**.

## Critérios de sucesso

- Catálogo lista os eBooks publicados nas duas modalidades, visualmente distintos.
- Amostra abre/baixa sem login; botão de loja externa abre em nova aba.
- Admin cadastra um eBook completo (upload de capa/arquivo/amostra) e publica pela tela.
- Não-admin não acessa as telas administrativas.

## Testes da tarefa

### Testes unitários
- [ ] `js/format.js`: `ebookModeLabel`; `storeLabel('https://www.amazon.com.br/…','')` → "Comprar na Amazon"; domínio desconhecido → "Comprar".
- [ ] `js/api.js`: métodos de eBook montam requisição correta (multipart para create/update).

### Testes de integração
- [ ] Coberto pelo backend em 6.0.

### Testes E2E (se aplicável)
- [ ] Manual (checklist no PR): publicar eBook `venda_no_site` e outro `link_externo`; conferir catálogo, amostra e botão externo.

## Arquivos relevantes

- `ebooks.html`, `ebook.html`, `admin-ebooks.html`, `gerenciar-ebook.html` (novos)
- `js/ebooks-catalog.js`, `js/ebook-page.js`, `js/admin-ebooks.js` (novos)
- `js/api.js`, `js/format.js`, `js/main.js`, `js/session.js`, `styles.css` (mod.)
