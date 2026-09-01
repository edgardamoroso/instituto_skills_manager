import { badRequest } from './errors.js';

// Helpers de validação e normalização de entrada.
// Lançam AppError 400 com o código informado quando o valor é inválido.

export function str(value, { code, min = 0, max = 500, trim = true } = {}) {
  let text = value == null ? '' : String(value);
  if (trim) text = text.trim();
  if (text.length < min || text.length > max) throw badRequest(code || 'INVALID_FIELD');
  return text;
}

export function optionalStr(value, { max = 500, trim = true } = {}) {
  let text = value == null ? '' : String(value);
  if (trim) text = text.trim();
  if (text.length > max) text = text.slice(0, max);
  return text;
}

export function email(value, { code = 'INVALID_EMAIL' } = {}) {
  const text = String(value || '').trim().toLowerCase();
  if (text.length < 3 || text.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    throw badRequest(code);
  }
  return text;
}

export function int(value, { code = 'INVALID_NUMBER', min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw badRequest(code);
  return parsed;
}

export function isoDate(value, { code = 'INVALID_DATE' } = {}) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) throw badRequest(code);
  return text;
}

export function oneOf(value, allowed, { code = 'INVALID_OPTION' } = {}) {
  const text = String(value ?? '');
  if (!allowed.includes(text)) throw badRequest(code);
  return text;
}

// Aceita apenas URLs http(s). Rejeita javascript:, data:, file:, relativas, etc.
export function httpUrl(value, { code = 'INVALID_URL', max = 2000 } = {}) {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw badRequest(code);
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw badRequest(code);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw badRequest(code);
  return parsed.toString();
}
