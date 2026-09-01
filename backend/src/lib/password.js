import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Formato do hash: scrypt$<saltHex>$<derivedHex>
export function hashPassword(plain) {
  const salt = randomBytes(16);
  const derived = scryptSync(String(plain), salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, derivedHex] = stored.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(derivedHex, 'hex');
  const actual = scryptSync(String(plain), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
