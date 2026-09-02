# Deploy em produção (VM Ubuntu + Caddy)

Runbook para colocar o Instituto Skills Manager no ar em uma VM Linux
(testado em Ubuntu 24.04 LTS, ex.: Google Cloud `e2-micro` ou Hetzner).

Pré-requisitos já resolvidos:

- VM criada, com IP externo **estático**.
- DNS: registros `A` de `skillsmanager.com.br` e `www.skillsmanager.com.br`
  apontando para o IP da VM (confirme com `nslookup skillsmanager.com.br`).
- Portas **80** e **443** abertas no firewall do provedor.

Todos os comandos abaixo rodam via SSH, como um usuário com `sudo`.

---

## 1. Swap (importante em VMs de 1 GB de RAM)

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile && echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Node.js 24 + git

```bash
sudo apt-get update && sudo apt-get install -y git curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version   # deve mostrar v24.x
```

## 3. Caddy (proxy reverso com HTTPS automático)

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy
```

## 4. Código

```bash
sudo mkdir -p /opt/skills-manager && sudo chown "$USER":"$USER" /opt/skills-manager
git clone https://github.com/edgardamoroso/instituto_skills_manager /opt/skills-manager
cd /opt/skills-manager/backend && npm ci --omit=dev
```

## 5. Usuário de serviço

```bash
sudo useradd --system --home /opt/skills-manager --shell /usr/sbin/nologin skills || true
sudo mkdir -p /opt/skills-manager/backend/data /opt/skills-manager/backend/uploads
sudo chown -R skills:skills /opt/skills-manager
```

## 6. Configuração (`backend/.env`)

Gere uma senha forte para o admin e crie o arquivo:

```bash
ADMIN_PW="$(openssl rand -base64 18)"; echo "SENHA ADMIN: $ADMIN_PW"
sudo tee /opt/skills-manager/backend/.env >/dev/null <<EOF
NODE_ENV=production
PORT=3000
TRUST_PROXY=1
PUBLIC_URL=https://skillsmanager.com.br
ADMIN_EMAIL=admin@skillsmanager.com.br
ADMIN_PASSWORD=$ADMIN_PW
SESSION_TTL_DAYS=7

# SMTP dos e-mails de verificação de cadastro.
# Em branco = o link de verificação é impresso no log (journalctl -u skills-manager).
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=Instituto Skills Manager <no-reply@skillsmanager.com.br>
EOF
sudo chown skills:skills /opt/skills-manager/backend/.env && sudo chmod 600 /opt/skills-manager/backend/.env
```

**Anote a senha do admin** que apareceu no `echo`.

## 7. Serviço systemd

```bash
sudo cp /opt/skills-manager/deploy/skills-manager.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now skills-manager
sudo systemctl status skills-manager --no-pager
curl -s localhost:3000/health   # deve responder {"status":"ok"}
```

## 8. Caddy

```bash
sudo cp /opt/skills-manager/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo journalctl -u caddy -n 30 --no-pager   # acompanha a emissão do certificado
```

## 9. Conferir

Abra `https://skillsmanager.com.br` no navegador. Login admin: `admin@skillsmanager.com.br`
com a senha gerada no passo 6.

---

## Atualizar o site depois

```bash
cd /opt/skills-manager && sudo -u skills git pull
cd backend && sudo -u skills npm ci --omit=dev
sudo systemctl restart skills-manager
```

## Backup do banco (SQLite)

Cron diário guardando 7 cópias:

```bash
sudo tee /etc/cron.daily/skills-backup >/dev/null <<'EOF'
#!/bin/sh
d=/opt/skills-manager/backups; mkdir -p "$d"
sqlite3 /opt/skills-manager/backend/data/skills-manager.db ".backup '$d/db-$(date +\%F).sqlite'"
ls -1t "$d"/db-*.sqlite | tail -n +8 | xargs -r rm
EOF
sudo chmod +x /etc/cron.daily/skills-backup
sudo apt-get install -y sqlite3
```

## Logs

```bash
sudo journalctl -u skills-manager -f      # app
sudo journalctl -u caddy -f               # proxy / TLS
```
