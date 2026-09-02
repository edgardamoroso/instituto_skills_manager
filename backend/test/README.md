# Testes

`npm test` — roda a suíte com o runner nativo do Node (`node --test`) e a cobertura
nativa (`--experimental-test-coverage`). Sem dependências de teste.

## Como funciona

- Cada arquivo `test/**/*.test.js` roda em um processo isolado.
- `test/helpers/harness.js` (primeiro import de todo arquivo de teste) define, por
  processo: `NODE_ENV=test`, um `DB_FILE` SQLite temporário, e `EBOOK_STORAGE_DIR` /
  `UPLOADS_DIR` temporários. Tudo é removido em `removeDbFile()` no `after`.
- `startApp()` sobe o app numa porta efêmera; `createClient(baseUrl)` é um cliente HTTP
  com "cookie jar" para exercitar sessões.
- E-mails: sem SMTP, `lib/mailer.js` empilha em `sentMessages` (asserção nos testes) —
  nenhum serviço externo é chamado em nenhum teste.
- `middleware/rateLimit.js` expõe `resetAll()` para isolar cenários de rate limit.

## Cobertura — gate de 80%

`npm test` falha se linhas, branches ou funções ficarem abaixo de 80% (global).

Exclusões (`--test-coverage-exclude`), por serem bootstrap trivial sem lógica de negócio:

- `src/server.js` — só faz `app.listen`.
- `src/db/seed.js` — semeia o banco no primeiro boot; exercido indiretamente por toda a
  suíte, mas é dado estático.

`src/db/index.js` **não** é excluído: as migrações têm testes dedicados em
`test/db/migrations.test.js`.
