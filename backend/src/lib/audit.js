import crypto from 'node:crypto';
import { db } from '../db/index.js';

const insertAudit = db.prepare(
  `INSERT INTO audit_log (id, actor_user_id, actor_ip, action, target, detail)
   VALUES (@id, @actor_user_id, @actor_ip, @action, @target, @detail)`,
);

// Registra uma ação sensível. `request` opcional para capturar autor e IP.
export function audit(action, { request = null, target = '', detail = '', actorId = null, ip = null } = {}) {
  try {
    insertAudit.run({
      id: crypto.randomUUID(),
      actor_user_id: actorId || request?.user?.id || null,
      actor_ip: ip || request?.ip || '',
      action: String(action).slice(0, 80),
      target: String(target || '').slice(0, 200),
      detail: typeof detail === 'string' ? detail.slice(0, 500) : JSON.stringify(detail).slice(0, 500),
    });
  } catch (error) {
    console.error('Falha ao gravar audit_log:', error.message);
  }
}
