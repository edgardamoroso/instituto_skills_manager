# Tarefa 10.0: Backfill de testes do backend legado até ≥ 80% global

## Visão geral

Decisão do PO: além dos testes do código novo (tarefas 1–8), cobrir o backend **já
existente** com testes até a suíte bater ≥ 80% de cobertura global (linhas, branches,
funções, statements). Pode rodar em paralelo a partir de 1.0. Não altera comportamento —
só adiciona testes; qualquer bug encontrado vira correção pontual com o teste que o pega.

<skills>
### Conformidade com skills
- `tests` — Given/When/Then, um conceito por teste, asserts explícitos, unit + integração, cobertura como _gate_ (95% linhas com 60% branches falha).
- `no-workarounds` — se um teste revelar um defeito, corrigir a **causa** (com o teste que a fixa), não ajustar a expectativa.
</skills>

<requirements>
- Cobertura global ≥ 80% em statements, branches, functions, lines (relatório de `node --test --experimental-test-coverage`).
- Nenhuma mudança de comportamento de runtime sem teste que a justifique.
- Sem chamar serviços externos; e-mail via outbox.
</requirements>

## Subtarefas

- [ ] 10.1 `authService`: `register` (novo, e-mail em uso → aviso genérico, `pending`), `verifyEmail` (token válido/expirado), `login` (ok, credencial errada, e-mail não verificado, _timing_ com `DUMMY_HASH`), `changePassword` (atual errada, curta, igual, invalida outras sessões), `logout`, `me`.
- [ ] 10.2 `enrollmentService` + `paymentService`: `createEnrollment` (com/sem plano, aluno/curso inexistente, duplicada), `requestEnrollment` (idempotente), `regeneratePlan`, `setEnrollmentStatus`, `deleteEnrollment`; `summarizePayments` (status `paga`/`pendente`/`atrasada` por data), `setPaymentPaid`.
- [ ] 10.3 `studentService`: `listStudents` (contadores), `createStudent` (senha provida vs aleatória, e-mail em uso), `updateStudent` (troca de e-mail com conflito, troca de senha invalida sessões), `resetStudentPassword`, `deleteStudent`.
- [ ] 10.4 `overviewService`: agregados (contagens, inadimplência) com dados de fixture.
- [ ] 10.5 Middlewares: `rateLimit` (limite, janela, `Retry-After`, `consume`), `sameOrigin` (métodos seguros, origem ausente/ inválida/ divergente/ ok), `securityHeaders` (headers + HSTS só em produção), `forceHttps` (redirect 308 só atrás de proxy).
- [ ] 10.6 `lib`: `password` (hash/verify, formato), `http` (`wrap` sync/async, `errorHandler` 4xx vs 5xx, `Retry-After`, `reason`), `audit` (grava; não lança em erro), `money`, `validate`, `dates`.
- [ ] 10.7 Rodar o relatório, listar lacunas e completar até o _gate_; documentar no config qualquer exclusão (arquivos de bootstrap triviais).

## Detalhes de implementação

Ver `techspec.md` → **Abordagem de testes → Backfill do legado**. Usar os helpers de 1.0
(`test/helpers/app.js`, `test/helpers/db.js`, `mailer.sentMessages`).

## Critérios de sucesso

- `npm test` sai com cobertura global ≥ 80% nas quatro métricas.
- Todos os testes independentes e determinísticos.
- Defeitos porventura encontrados: corrigidos na causa, com teste de regressão.

## Testes da tarefa

### Testes unitários
- [ ] Conforme 10.1–10.6 (lista acima é o inventário).

### Testes de integração
- [ ] `authRoutes`, `studentRoutes`, `enrollmentRoutes`, `overviewRoutes` — caminhos felizes e de erro principais via `app.listen(0)`.

### Testes E2E (se aplicável)
- N/A.

## Arquivos relevantes

- `backend/test/**/*.test.js` (novos)
- `backend/package.json` (mod., se precisar de flags/thresholds de cobertura)
- Correções pontuais em `backend/src/**` só se um teste revelar defeito
