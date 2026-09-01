import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../..');

// Carrega backend/.env se existir (Node 24+). Silencioso se ausente.
try {
  process.loadEnvFile(path.join(backendDir, '.env'));
} catch {
  /* sem .env — usa variáveis do ambiente / defaults */
}

const isProduction = process.env.NODE_ENV === 'production';

function parseTrustProxy(raw) {
  if (raw == null || raw === '') return false;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const asNumber = Number(raw);
  return Number.isFinite(asNumber) ? asNumber : raw;
}

export const config = {
  isProduction,
  port: Number(process.env.PORT) || 3000,
  trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${Number(process.env.PORT) || 3000}`).replace(/\/+$/, ''),
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS) || 7,
  adminEmail: process.env.ADMIN_EMAIL || 'admin@skills.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  cookieName: isProduction ? '__Host-sm_session' : 'sm_session',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Instituto Skills Manager <no-reply@skills.local>',
  },
};

// Em produção, recusa iniciar com configuração insegura.
export function assertProductionConfig() {
  if (!isProduction) return;
  const problems = [];
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'admin123') {
    problems.push('ADMIN_PASSWORD não definido ou igual ao padrão inseguro "admin123".');
  }
  if (!process.env.PUBLIC_URL || !/^https:\/\//.test(process.env.PUBLIC_URL)) {
    problems.push('PUBLIC_URL não definido ou não começa com https://.');
  }
  if (process.env.TRUST_PROXY == null || process.env.TRUST_PROXY === '') {
    problems.push('TRUST_PROXY não definido (use 1 atrás de um proxy reverso).');
  }
  if (problems.length) {
    console.error('\nConfiguração de produção inválida:\n - ' + problems.join('\n - ') + '\n');
    console.error('Ajuste backend/.env (veja backend/.env.example) e reinicie.\n');
    process.exit(1);
  }
}
