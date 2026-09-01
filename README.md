# Instituto Skills Manager

Site de cursos com painel administrativo, área do aluno, matrículas e controle de
pagamentos em parcelas. Frontend estático (HTML + JS modular) servido pela API
Node/Express, com banco **SQLite** (arquivo único).

## Rodar em desenvolvimento

Pré-requisito: Node.js 22+ (testado com Node 24). Nenhum banco para instalar.

```bash
cd backend
npm install
npm start
```

O site fica em **http://localhost:3000**.

Na primeira execução o banco `backend/data/skills-manager.db` é criado e populado com
4 cursos e um usuário administrador (`admin@skills.local` / `admin123` — a senha só
aparece no console fora de produção). Para recomeçar do zero, pare o servidor e apague
`backend/data/skills-manager.db*`.

`npm run dev` roda com `--watch` (reinicia ao salvar).

## Estrutura

```
*.html                 páginas do site
js/                     módulos ES do frontend (js/main.js despacha por data-page)
styles.css              estilos
assets/                 logotipos (SVG) e fonte Inter self-hosted (assets/fonts/)
deploy/                 exemplos de Caddyfile, nginx e unit systemd
backend/
  .env.example          modelo de configuração
  src/server.js         API + servidor estático + middlewares de segurança
  src/db/               schema.sql, abertura/migração do banco, seed
  src/lib/              config, validação, e-mail, auditoria, senha, erros
  src/middleware/       auth, cabeçalhos de segurança, rate limit, same-origin
  src/services/         regras de negócio
  src/routes/           rotas HTTP
  data/skills-manager.db  banco SQLite (ignorado no git)
  uploads/              arquivos de aula enviados (ignorado no git)
```

## Fluxo de uso

1. **Admin** entra em `/login.html` → **Matrículas e Pagamentos**.
2. **Cursos** (`/admin.html`): cadastra cursos, preços e aulas.
3. **Alunos** (`/alunos.html`): cadastra alunos (senha gerada na hora ou definida;
   "Redefinir senha" gera uma nova e encerra as sessões do aluno).
4. **Matrículas** (`/matriculas.html`): visão geral da base; nova matrícula (aluno +
   curso + nº de parcelas + valor + 1º vencimento → parcelas mensais geradas);
   matrículas por curso com status, progresso, marca "Inadimplente" e botão
   **Ativar/Desativar** (com motivo); detalhes com parcelas paga/não paga.
5. **Aluno** cria conta em `/cadastro.html`, **confirma o e-mail** pelo link recebido,
   entra e usa `/inscricao.html` para **solicitar matrícula** (fica pendente até o
   admin definir o plano e ativar). Em `/curso.html` só vê as aulas se a matrícula
   estiver **ativa**.
6. **Trocar senha**: qualquer usuário logado clica no próprio nome na barra de
   navegação → **Minha conta** (`/conta.html`) → informa a senha atual e a nova.
   Trocar a senha encerra as outras sessões. Faça isso no primeiro acesso do admin.

---

## Deploy em produção (internet)

O app foi endurecido para rodar exposto, **sempre atrás de um proxy reverso com TLS**
(nunca diretamente na porta 80/443).

### 1. Configuração

```bash
cp backend/.env.example backend/.env
# edite backend/.env:
#   NODE_ENV=production
#   PUBLIC_URL=https://cursos.seudominio.com.br   (precisa ser https)
#   TRUST_PROXY=1
#   ADMIN_EMAIL / ADMIN_PASSWORD  (senha forte — o boot recusa "admin123")
#   SMTP_*  (para os e-mails de confirmação de cadastro)
```

Com `NODE_ENV=production`, o servidor **recusa iniciar** se a senha admin for o padrão,
se `PUBLIC_URL` não for https ou se `TRUST_PROXY` não estiver definido.

Sem SMTP configurado, o link de confirmação de e-mail é apenas escrito no log — configure
o SMTP para o cadastro público funcionar de verdade.

### 2. Instalação

```bash
cd backend
npm ci --omit=dev
NODE_ENV=production node src/server.js   # ou via systemd (deploy/skills-manager.service)
chmod 600 data/skills-manager.db*        # restringe o banco ao usuário do serviço
```

### 3. Proxy reverso + TLS

Use **Caddy** (`deploy/Caddyfile`, TLS automático) **ou** **nginx** + certbot
(`deploy/nginx.conf.example`). O proxy encerra o HTTPS e encaminha para
`127.0.0.1:3000` com o header `X-Forwarded-Proto: https`.

### 4. Backup

Faça backup periódico de `backend/data/skills-manager.db` (com o serviço parado, ou via
`sqlite3 ... ".backup"`). Os uploads ficam em `backend/uploads/`.

## Proteções incluídas

- **HTTPS**: redirect http→https e `Strict-Transport-Security` em produção; `trust proxy`.
- **Cabeçalhos**: CSP restrita (sem origens externas), `X-Frame-Options: DENY`,
  `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP/CORP; sem `x-powered-by`.
- **Sessão**: cookie `httpOnly` + `SameSite=Strict` + `Secure` (prefixo `__Host-`) em
  produção; token opaco de 256 bits; expiração e limpeza automática; troca de senha
  encerra as sessões do usuário.
- **CSRF**: `SameSite=Strict` + verificação de `Origin`/`Referer` nas mutações + mesma origem
  (sem CORS).
- **Força bruta / abuso**: rate limiting por IP e por e-mail em login, cadastro e reenvio.
- **Cadastro**: exige confirmação de e-mail; respostas genéricas (não revela se o e-mail existe);
  senha mínima de 8 caracteres com hash `scrypt`.
- **Entrada**: validação e limites de tamanho em todos os campos; JSON limitado a 100 KB.
- **Upload de aula**: só tipos permitidos (pdf, imagem, office…), máx. 10 MB, servido como
  download (`Content-Disposition: attachment`, `nosniff`, CSP `none`) — nunca renderizado.
- **XSS**: escape de HTML no frontend + `safeUrl()` bloqueia `javascript:`/`data:` em links.
- **Vazamento**: erros 500 respondem `{"error":"INTERNAL_ERROR"}` (stack só no log).
- **Estáticos**: só as páginas do site, `js/` e `assets/` são servidos — nunca `backend/`.
- **Auditoria**: tabela `audit_log` registra login, alterações de curso/aluno/matrícula e
  pagamentos. Consulta: `sqlite3 backend/data/skills-manager.db 'SELECT * FROM audit_log ORDER BY at DESC LIMIT 50'`.

## Fora de escopo (avaliar depois)

"Esqueci minha senha" self-service (hoje o admin redefine); 2FA; rate-limit distribuído
(Redis, só faz sentido com várias instâncias); WAF / proteção contra DDoS volumétrico
(camada de CDN/infra).
