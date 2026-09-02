# Tarefa 2.0: Schema, migrações e utilitários de dados

## Visão geral

Toda a base de dados e utilitários que as tarefas de eBooks e autores consomem: novas
tabelas, ampliação de `users` e `courses`, migração idempotente no _boot_, novos helpers de
erro, validação de CPF e armazenamento protegido de arquivos, e ajustes de config/deploy.

<skills>
### Conformidade com skills
- `no-workarounds` — migração de schema **de verdade** (rebuild de `users` pelo procedimento oficial do SQLite), não remoção do CHECK; `lib/storage.js` previne _path traversal_ na origem.
- `tests` — cada migração e helper com teste; migração idempotente (rodar 2× = _no-op_).
- `javascript` / `code-standards` — módulos acíclicos, funções curtas, `const`.
- `folder-structure` — helpers em `src/lib/`, seguindo o layout do repo (desvio da skill documentado na TechSpec).
</skills>

<requirements>
- Mudanças de schema **aditivas e retrocompatíveis**; banco de produção existente deve migrar sem perda.
- `users.role` passa a aceitar `author`; `users` ganha `bio` (default `''`) e `active` (default `1`).
- `courses` ganha `author_id` (FK nullable → `users(id)` ON DELETE SET NULL).
- Arquivo principal de eBook **nunca** sob diretório servido estaticamente.
- RF22, RF22.1, RF22.2, RF23, RF28, RF33 (estrutura de dados).
</requirements>

## Subtarefas

- [ ] 2.1 `db/schema.sql`: `users` com `role` CHECK incluindo `author`, `bio TEXT NOT NULL DEFAULT ''`, `active INTEGER NOT NULL DEFAULT 1`; tabelas `ebooks`, `ebook_orders`, `ebook_download_grants` + índices (ver TechSpec → Esquema de banco de dados).
- [ ] 2.2 `db/index.js`: migração guardada — se o `sql` de `users` em `sqlite_master` não contém `'author'`, executar o rebuild (PRAGMA foreign_keys OFF → `transaction()` → cria `users_new`, copia com `bio=''`, `active=1`, `DROP`/`RENAME` → PRAGMA ON). `ALTER TABLE courses ADD COLUMN author_id …` guardado por `columnExists`.
- [ ] 2.3 `lib/errors.js`: `export const gone = (code) => new AppError(code, 410);` e `tooMany = (code) => new AppError(code, 429);`.
- [ ] 2.4 `lib/cpf.js`: `onlyDigits(s)`, `isValidCpf(s)` (11 dígitos, rejeita sequências repetidas, valida os dois dígitos verificadores).
- [ ] 2.5 `lib/storage.js`: `storageDir` (`backend/storage/ebooks/`), `ensureDir()` no _boot_, `saveProtected(tmpPath, ext) → relPath`, `resolveProtected(relPath) → absPath` com verificação de que o caminho resolvido está **dentro** de `storageDir`, `removeProtected(relPath)`.
- [ ] 2.6 `lib/config.js`: `ebook: { downloadTtlHours: 72, maxDownloads: 5, maxFileMb: 50, storageDir }` lendo `EBOOK_*` do ambiente com defaults.
- [ ] 2.7 `backend/.env.example`: `EBOOK_DOWNLOAD_TTL_HOURS`, `EBOOK_DOWNLOAD_MAX`, `EBOOK_MAX_FILE_MB` comentados.
- [ ] 2.8 `.gitignore`: `backend/storage/`. `deploy/skills-manager.service`: `ReadWritePaths` += `…/backend/storage`.

## Detalhes de implementação

Ver `techspec.md` → **Esquema de banco de dados** (todas as subseções), **`users` (delta) —
rebuild guardado**, **Considerações técnicas → Rebuild de `users`** e **Riscos conhecidos**
(backup do `.db` antes do deploy).

## Critérios de sucesso

- Banco novo (`schema.sql`) e banco antigo (via migração) convergem para o mesmo schema.
- Rodar o _boot_ 2× seguidas não altera nada na 2ª vez.
- `isValidCpf('390.533.447-05') === true`; `isValidCpf('111.111.111-11') === false`.
- `resolveProtected('../../etc/passwd')` lança / retorna erro, nunca um caminho fora de `storageDir`.

## Testes da tarefa

### Testes unitários
- [ ] `cpf`: aceita CPF válido com e sem máscara; rejeita DV errado; rejeita `000…`, `111…`; `onlyDigits` limpa.
- [ ] `storage`: `saveProtected` grava e retorna caminho relativo; `resolveProtected` aceita relativo válido; rejeita `../` e caminho absoluto; `removeProtected` apaga.
- [ ] `errors`: `gone`/`tooMany` produzem `status` 410/429 e `code` correto.
- [ ] `config`: defaults aplicados; `EBOOK_DOWNLOAD_MAX=3` sobrepõe.

### Testes de integração
- [ ] Migração idempotente: aplicar `db/index.js` sobre um DB com o schema **antigo** de `users` (fixture SQL) → tabela reconstruída, linhas preservadas, `role` antigo intacto, `bio=''`, `active=1`; segunda execução não muda `sqlite_master`.
- [ ] `ALTER courses`: `author_id` existe, aceita `NULL`, e a FK recusa um id inexistente quando preenchido.
- [ ] Tabelas de eBook criadas com os CHECKs esperados (inserção inválida de `mode` falha).

### Testes E2E (se aplicável)
- N/A.

## Arquivos relevantes

- `backend/src/db/schema.sql`, `backend/src/db/index.js` (mod.)
- `backend/src/lib/errors.js`, `backend/src/lib/config.js` (mod.)
- `backend/src/lib/cpf.js`, `backend/src/lib/storage.js` (novos)
- `backend/.env.example`, `.gitignore`, `deploy/skills-manager.service` (mod.)
- `backend/test/db/migrations.test.js`, `backend/test/lib/{cpf,storage,errors}.test.js` (novos)
