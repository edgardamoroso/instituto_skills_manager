# Tarefa 1.0: Fundação de testes e refactor de bootstrap

## Visão geral

Habilitar testes automatizados no projeto (hoje inexistentes) sem adicionar dependências:
extrair a construção do app Express para um módulo importável, dar ao `mailer` uma _outbox_
em memória para asserção em teste, e configurar `npm test` com o _runner_ e a cobertura
nativos do Node 24. É a base de todas as demais tarefas.

<skills>
### Conformidade com skills
- `tests` — define _runner_, isolamento, Given/When/Then, um conceito por teste, meta de cobertura.
- `no-workarounds` — o `mailer` mantém o _catch_ de envio (comportamento desejado: e-mail não derruba fluxo), mas isso fica **contido e testado** via outbox, não ampliado.
- `javascript` — ESM acíclico, `const` por padrão, segredos em `.env`.
- `code-standards` — funções ≤ 30 linhas, nomes em inglês.
</skills>

<requirements>
- Não introduzir dependências novas (usar `node:test` + `--experimental-test-coverage`).
- `server.js` não pode mais executar `listen` no _import_ (bloqueia teste de integração).
- Comportamento de runtime idêntico ao atual em produção (`npm start`).
- Testes isoláveis: banco por arquivo de teste, sem estado compartilhado, sem serviço externo.
</requirements>

## Subtarefas

- [ ] 1.1 Criar `backend/src/app.js` exportando o `app` Express (todos os middlewares, rotas e `errorHandler` que hoje estão em `server.js`); `server.js` passa a `import { app }` e só chamar `app.listen(config.port, …)`.
- [ ] 1.2 `backend/src/lib/mailer.js`: quando não há transporte SMTP, além do `console.log`, empilhar `{ to, subject, text }` em um array exportado `sentMessages`; exportar `clearOutbox()`. Nenhuma mudança quando há SMTP.
- [ ] 1.3 `backend/package.json`: adicionar `"test": "node --test --experimental-test-coverage 'src/**/*.test.js' 'test/**/*.test.js'"`.
- [ ] 1.4 `backend/test/helpers/app.js`: helper que faz `await import('../../src/app.js')`, sobe `app.listen(0)`, devolve `{ baseUrl, close }`; helper `request(baseUrl, path, opts)` fino sobre `fetch` (cookies incl.).
- [ ] 1.5 `backend/test/helpers/db.js`: define `process.env.DB_FILE` para um arquivo temporário único e `process.env.NODE_ENV='test'`; expõe `cleanup()`.
- [ ] 1.6 Um teste "fumaça" (`test/smoke.test.js`): `GET /health` responde `{status:"ok"}`; app sobe com DB temporário e schema aplicado.
- [ ] 1.7 `.gitignore`: ignorar artefatos de cobertura, se houver.

## Detalhes de implementação

Ver `techspec.md` → **Resumo** (item 3), **Abordagem de testes** (Runner, Isolamento de
banco, E-mail) e **Sequenciamento → passo 1**. `db/index.js` já lê `process.env.DB_FILE` —
nenhuma mudança nele nesta tarefa.

## Critérios de sucesso

- `npm start` funciona igual (produção não muda).
- `npm test` roda a suíte e imprime relatório de cobertura.
- `node --test` executa cada arquivo em processo isolado; testes passam em qualquer ordem.
- `mailer.sentMessages` reflete os e-mails "enviados" quando não há SMTP; `clearOutbox()` zera.

## Testes da tarefa

### Testes unitários
- [ ] `mailer` sem SMTP: `sendMail` empilha em `sentMessages` e não lança.
- [ ] `mailer` `clearOutbox()` esvazia o array.
- [ ] `app.js` exporta uma função/instância Express montável sem efeitos colaterais de rede.

### Testes de integração
- [ ] `GET /health` → 200 `{status:"ok"}` via `app.listen(0)`.
- [ ] App inicia com `DB_FILE` temporário e cria o schema (consulta trivial em `courses` funciona).

### Testes E2E (se aplicável)
- N/A.

## Arquivos relevantes

- `backend/src/app.js` (novo), `backend/src/server.js` (mod.)
- `backend/src/lib/mailer.js` (mod.)
- `backend/package.json` (mod.)
- `backend/test/helpers/app.js`, `backend/test/helpers/db.js`, `backend/test/smoke.test.js` (novos)
- `.gitignore` (mod.)
